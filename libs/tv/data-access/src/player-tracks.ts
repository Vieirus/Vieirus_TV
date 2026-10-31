/** The parts of AudioTrack/AudioTrackList used here (absent from the TS DOM lib). */
interface AudioTrackLike {
    enabled: boolean;
    label: string;
    language: string;
}
interface TrackListLike<T> {
    readonly length: number;
    [index: number]: T;
    addEventListener?: (type: string, listener: () => void) => void;
    removeEventListener?: (type: string, listener: () => void) => void;
}
export interface TrackChoice {
    label: string;
    active: boolean;
}
const LANGUAGES: Record<string, string> = {
    fr: 'Français',
    fre: 'Français',
    fra: 'Français',
    en: 'English',
    eng: 'English',
    nl: 'Nederlands',
    nld: 'Nederlands',
    dut: 'Nederlands',
    de: 'Deutsch',
    deu: 'Deutsch',
    ger: 'Deutsch',
    es: 'Español',
    spa: 'Español',
    it: 'Italiano',
    ita: 'Italiano',
    pt: 'Português',
    por: 'Português',
    ar: 'العربية',
    ara: 'العربية',
    tr: 'Türkçe',
    tur: 'Türkçe',
    ru: 'Русский',
    rus: 'Русский',
    pl: 'Polski',
    pol: 'Polski',
    ja: '日本語',
    jpn: '日本語',
};
export function trackLabel(
    track: { label?: string; language?: string },
    index: number
): string {
    const language = (track.language || '').trim();
    const name = LANGUAGES[language.toLowerCase().split('-')[0]];
    const label = (track.label || '').trim();
    if (label && name && label.toLowerCase() !== language.toLowerCase())
        return label.toLowerCase().includes(name.toLowerCase())
            ? label
            : `${name} (${label})`;
    return label && label.toLowerCase() !== language.toLowerCase()
        ? label
        : name || (language ? language.toUpperCase() : `Track ${index + 1}`);
}
const trackKey = (track: { label?: string; language?: string }) =>
    `${track.language || ''}|${track.label || ''}`.toLowerCase();

/**
 * Audio languages and subtitles of the playing stream. webOS exposes them
 * through the standard video.audioTracks / video.textTracks lists (webOS 3+);
 * what appears depends on the stream itself. Choices carry over to the next
 * episode or channel when a track with the same language/label shows up.
 */
export class PlayerTracks {
    private preferredAudio?: string;
    private preferredText?: string | null;
    constructor(
        private video: HTMLVideoElement,
        private changed: () => void
    ) {
        ['addtrack', 'removetrack', 'change'].forEach((name) => {
            this.audioList?.addEventListener?.(name, this.trackChanged);
            this.textList?.addEventListener?.(name, this.trackChanged);
        });
    }
    dispose() {
        ['addtrack', 'removetrack', 'change'].forEach((name) => {
            this.audioList?.removeEventListener?.(name, this.trackChanged);
            this.textList?.removeEventListener?.(name, this.trackChanged);
        });
    }
    private trackChanged = () => {
        this.applyPreferences();
        this.changed();
    };
    private get audioList(): TrackListLike<AudioTrackLike> | undefined {
        return (
            this.video as unknown as {
                audioTracks?: TrackListLike<AudioTrackLike>;
            }
        ).audioTracks;
    }
    private get textList(): TrackListLike<TextTrack> | undefined {
        return this.video.textTracks as unknown as
            TrackListLike<TextTrack> | undefined;
    }
    private subtitles(): TextTrack[] {
        const list = this.textList;
        const result: TextTrack[] = [];
        for (let i = 0; list && i < list.length; i++)
            if (list[i].kind === 'subtitles' || list[i].kind === 'captions')
                result.push(list[i]);
        return result;
    }
    /** Audio languages of the current stream (empty when there is only one). */
    audioTracks(): TrackChoice[] {
        const list = this.audioList;
        const result: TrackChoice[] = [];
        for (let i = 0; list && i < list.length; i++)
            result.push({
                label: trackLabel(list[i], i),
                active: list[i].enabled,
            });
        return result.length > 1 ? result : [];
    }
    selectAudio(index: number) {
        const list = this.audioList;
        if (!list || index < 0 || index >= list.length) return;
        // Enable the new track first: some players briefly go silent otherwise.
        list[index].enabled = true;
        for (let i = 0; i < list.length; i++)
            if (i !== index) list[i].enabled = false;
        this.preferredAudio = trackKey(list[index]);
        this.changed();
    }
    cycleAudio() {
        const tracks = this.audioTracks();
        if (!tracks.length) return;
        const active = tracks.findIndex((t) => t.active);
        this.selectAudio((active + 1) % tracks.length);
    }
    /** Subtitle tracks the TV exposes for the current stream. */
    textTracks(): TrackChoice[] {
        return this.subtitles().map((track, i) => ({
            label: trackLabel(track, i),
            active: track.mode === 'showing',
        }));
    }
    /** -1 turns subtitles off. */
    selectText(index: number) {
        const tracks = this.subtitles();
        tracks.forEach((track, i) => {
            track.mode = i === index ? 'showing' : 'disabled';
        });
        this.preferredText = index >= 0 ? trackKey(tracks[index]) : null;
        this.changed();
    }
    cycleText() {
        const tracks = this.textTracks();
        if (!tracks.length) return;
        const active = tracks.findIndex((t) => t.active);
        // Off → first → second → … → Off
        this.selectText(active + 1 >= tracks.length ? -1 : active + 1);
    }
    private applyPreferences() {
        const audio = this.audioList;
        if (audio && this.preferredAudio !== undefined)
            for (let i = 0; i < audio.length; i++)
                if (
                    trackKey(audio[i]) === this.preferredAudio &&
                    !audio[i].enabled
                ) {
                    audio[i].enabled = true;
                    for (let j = 0; j < audio.length; j++)
                        if (j !== i) audio[j].enabled = false;
                    break;
                }
        if (this.preferredText !== undefined)
            this.subtitles().forEach((track) => {
                const wanted =
                    this.preferredText !== null &&
                    trackKey(track) === this.preferredText;
                const mode = wanted ? 'showing' : 'disabled';
                if (track.mode !== mode) track.mode = mode;
            });
    }
}

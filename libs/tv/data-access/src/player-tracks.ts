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
    /** The track is in French (language code or label). */
    french: boolean;
}
/** fr / fre / fra / fr-CA…, or a label such as "Français", "French", "VF". */
export function isFrench(
    track: { label?: string; language?: string },
    audio = false
): boolean {
    const language = (track.language || '').trim().toLowerCase();
    if (/^(fr|fre|fra)(-|_|$)/.test(language)) return true;
    const label = (track.label || '').toLowerCase();
    // "VOSTFR" = original audio with French subtitles: French only as a subtitle.
    if (audio && /vost/.test(label)) return false;
    return /fran[cç]ais|french|\bvf[fqi]?\b|vostfr/.test(label);
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
            const listener =
                name === 'addtrack' ? this.trackAdded : this.redraw;
            this.audioList?.addEventListener?.(name, listener);
            this.textList?.addEventListener?.(name, listener);
        });
    }
    dispose() {
        clearTimeout(this.applyTimer);
        ['addtrack', 'removetrack', 'change'].forEach((name) => {
            const listener =
                name === 'addtrack' ? this.trackAdded : this.redraw;
            this.audioList?.removeEventListener?.(name, listener);
            this.textList?.removeEventListener?.(name, listener);
        });
    }
    private applyTimer?: ReturnType<typeof setTimeout>;
    private redraw = () => this.changed();
    /*
     * The saved choice is applied once, shortly after a new stream announces
     * its tracks. It used to be re-applied on every 'change' event too; webOS
     * fires those while it switches, which could bounce between tracks and
     * freeze the player after a few switches.
     */
    private trackAdded = () => {
        clearTimeout(this.applyTimer);
        this.applyTimer = setTimeout(() => {
            this.applyPreferences();
            this.changed();
        }, 300);
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
                french: isFrench(list[i], true),
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
            french: isFrench(track),
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
    private context = '';
    private defaults = false;
    /**
     * Called for every new stream. Within one series the viewer's choice
     * carries over to the next episode; any other title starts again from the
     * French defaults (films and episodes only, not live channels).
     */
    start(context: string, defaults: boolean) {
        if (context !== this.context) {
            this.preferredAudio = undefined;
            this.preferredText = undefined;
        }
        this.context = context;
        this.defaults = defaults;
    }
    /**
     * Without a choice of the viewer: French audio when there is one; then
     * subtitles off if the audio is French, French subtitles if the audio is
     * known to be another language, otherwise untouched.
     */
    private applyDefaults() {
        const audio = this.audioList;
        let frenchAudio = false;
        let otherAudio = false;
        if (audio && this.preferredAudio === undefined) {
            let french = -1;
            for (let i = 0; i < audio.length; i++)
                if (french < 0 && isFrench(audio[i], true)) french = i;
            if (french >= 0 && audio.length > 1 && !audio[french].enabled) {
                audio[french].enabled = true;
                for (let j = 0; j < audio.length; j++)
                    if (j !== french) audio[j].enabled = false;
            }
        }
        for (let i = 0; audio && i < audio.length; i++)
            if (audio[i].enabled) {
                if (isFrench(audio[i], true)) frenchAudio = true;
                else if (audio[i].language && audio[i].language !== 'und')
                    otherAudio = true;
            }
        if (this.preferredText !== undefined) return;
        const subtitles = this.subtitles();
        const french = subtitles.findIndex((t) => isFrench(t));
        const chosen = frenchAudio ? -1 : otherAudio ? french : -2;
        if (chosen === -2) return;
        subtitles.forEach((track, i) => {
            const mode = i === chosen ? 'showing' : 'disabled';
            if (track.mode !== mode) track.mode = mode;
        });
    }
    private applyPreferences() {
        if (this.defaults) this.applyDefaults();
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

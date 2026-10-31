import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { NativePlayer, TrackChoice } from '@iptvnator/tv/data-access';
import { restoreFocus } from '@iptvnator/tv/ui';

const active = (tracks: TrackChoice[]) => tracks.findIndex((t) => t.active);
const isBack = (event: KeyboardEvent) =>
    event.keyCode === 461 ||
    ['Escape', 'BrowserBack', 'Backspace'].includes(event.key);

interface Pending {
    audio: number;
    /** -1 = subtitles off */
    text: number;
    resume: boolean;
}

/**
 * One "Audio & subtitles" button, shown when the stream offers a choice. It
 * pauses playback and opens a panel; OK applies the choice and resumes,
 * Back/Cancel resumes unchanged. Tracks are switched once, while paused,
 * instead of on every press.
 */
export function TrackButtons({ player }: { player?: NativePlayer }) {
    const [pending, setPending] = useState<Pending | null>(null);
    const audio = player?.tracks.audioTracks() ?? [];
    const text = player?.tracks.textTracks() ?? [];
    useEffect(() => {
        if (!pending) return;
        restoreFocus(
            audio.length
                ? `track-audio-${pending.audio}`
                : `track-text-${pending.text}`,
            'track-ok'
        );
    }, [!!pending]);
    if (!player || (!audio.length && !text.length)) return null;
    const summary = [
        audio.length ? audio[active(audio)]?.label : '',
        text.length ? (text[active(text)]?.label ?? 'No subtitles') : '',
    ]
        .filter(Boolean)
        .join(' · ');
    const open = () => {
        const resume = !player.video.paused;
        player.pause();
        setPending({ audio: active(audio), text: active(text), resume });
    };
    const close = (apply: boolean) => {
        if (!pending) return;
        if (apply) {
            if (pending.audio >= 0 && pending.audio !== active(audio))
                player.tracks.selectAudio(pending.audio);
            if (text.length && pending.text !== active(text))
                player.tracks.selectText(pending.text);
        }
        const resume = pending.resume;
        setPending(null);
        if (resume) player.resume();
        restoreFocus('player-tracks', 'player-toggle');
    };
    const option = (group: 'audio' | 'text', index: number, label: string) => {
        const chosen = pending?.[group] === index;
        return (
            <button
                key={`${group}-${index}`}
                class={`track-option ${chosen ? 'is-chosen' : ''}`}
                data-focus={`track-${group}-${index}`}
                aria-pressed={chosen}
                onClick={() =>
                    pending && setPending({ ...pending, [group]: index })
                }
            >
                <span aria-hidden="true">{chosen ? '●' : '○'}</span> {label}
            </button>
        );
    };
    return (
        <>
            <button data-focus="player-tracks" onClick={open}>
                Audio &amp; subtitles: {summary || '—'}
            </button>
            {pending ? (
                <div
                    class="track-panel"
                    data-tv-modal
                    role="dialog"
                    aria-label="Audio and subtitles"
                    onKeyDown={(event) => {
                        if (!isBack(event)) return;
                        event.preventDefault();
                        event.stopPropagation();
                        close(false);
                    }}
                >
                    <div class="track-box">
                        <h2>Audio &amp; subtitles</h2>
                        <p class="muted">
                            Playback is paused. Choose, then press OK.
                        </p>
                        <div class="track-columns">
                            {audio.length ? (
                                <section>
                                    <h3>Audio</h3>
                                    {audio.map((t, i) =>
                                        option('audio', i, t.label)
                                    )}
                                </section>
                            ) : null}
                            {text.length ? (
                                <section>
                                    <h3>Subtitles</h3>
                                    {option('text', -1, 'Off')}
                                    {text.map((t, i) =>
                                        option('text', i, t.label)
                                    )}
                                </section>
                            ) : null}
                        </div>
                        <div class="actions">
                            <button
                                class="primary"
                                data-focus="track-ok"
                                onClick={() => close(true)}
                            >
                                OK ▶
                            </button>
                            <button
                                data-focus="track-cancel"
                                onClick={() => close(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}

/** On the timeline, Left/Right jump 10 s instead of the native 1-second step. */
export function seekKeys(
    player?: NativePlayer
): JSX.KeyboardEventHandler<HTMLInputElement> {
    return (event) => {
        const left = event.key === 'ArrowLeft' || event.keyCode === 37;
        const right = event.key === 'ArrowRight' || event.keyCode === 39;
        if (!left && !right) return;
        event.preventDefault();
        event.stopPropagation();
        player?.seek(right ? 10 : -10);
    };
}

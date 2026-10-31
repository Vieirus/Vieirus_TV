import type { JSX } from 'preact';
import type { NativePlayer, TrackChoice } from '@iptvnator/tv/data-access';

const active = (tracks: TrackChoice[]) => tracks.find((t) => t.active)?.label;

/** Audio language and subtitle buttons, shown only when the stream offers a choice. */
export function TrackButtons({ player }: { player?: NativePlayer }) {
    const audio = player?.tracks.audioTracks() ?? [];
    const text = player?.tracks.textTracks() ?? [];
    return (
        <>
            {audio.length ? (
                <button
                    data-focus="player-audio"
                    onClick={() => player?.tracks.cycleAudio()}
                >
                    Audio: {active(audio) ?? '—'}
                </button>
            ) : null}
            {text.length ? (
                <button
                    data-focus="player-subtitles"
                    onClick={() => player?.tracks.cycleText()}
                >
                    Subtitles: {active(text) ?? 'Off'}
                </button>
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

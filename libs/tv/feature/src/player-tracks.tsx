import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { NativePlayer, TrackChoice } from '@iptvnator/tv/data-access';
import { restoreFocus } from '@iptvnator/tv/ui';

const active = (tracks: TrackChoice[]) => tracks.findIndex((t) => t.active);
const isBack = (event: KeyboardEvent) =>
    event.keyCode === 461 ||
    ['Escape', 'BrowserBack', 'Backspace'].includes(event.key);

type Kind = 'audio' | 'text';
interface Panel {
    kind: Kind;
    resume: boolean;
}

/**
 * "Audio" and "Subtitles" buttons, each shown when the stream offers a choice.
 * A button pauses playback and opens a list; pressing OK on an entry applies
 * it straight away and resumes. Back resumes unchanged. Tracks are switched
 * once, while paused, instead of on every press.
 */
export function TrackButtons({ player }: { player?: NativePlayer }) {
    const [panel, setPanel] = useState<Panel | null>(null);
    const audio = player?.tracks.audioTracks() ?? [];
    const text = player?.tracks.textTracks() ?? [];
    useEffect(() => {
        if (!panel) return;
        const tracks = panel.kind === 'audio' ? audio : text;
        // Subtitles off: preselect French, so one OK turns them on.
        const french = tracks.findIndex((t) => t.french);
        const focus =
            panel.kind === 'text' && active(tracks) < 0 && french >= 0
                ? french
                : active(tracks);
        restoreFocus(`track-${panel.kind}-${focus}`);
    }, [panel?.kind]);
    if (!player || (!audio.length && !text.length)) return null;
    const open = (kind: Kind) => {
        const resume = !player.video.paused;
        player.pause();
        setPanel({ kind, resume });
    };
    const close = (kind: Kind, choice?: number) => {
        if (!panel) return;
        if (
            kind === 'audio' &&
            choice !== undefined &&
            choice !== active(audio)
        )
            player.tracks.selectAudio(choice);
        if (kind === 'text' && choice !== undefined && choice !== active(text))
            player.tracks.selectText(choice);
        const resume = panel.resume;
        setPanel(null);
        if (resume) player.resume();
        restoreFocus(`player-${kind}`, 'player-toggle');
    };
    const list = panel?.kind === 'audio' ? audio : text;
    const options = panel
        ? [
              ...(panel.kind === 'text' ? [{ index: -1, label: 'Off' }] : []),
              ...list.map((t, index) => ({ index, label: t.label })),
          ]
        : [];
    const current = panel ? active(list) : -2;
    return (
        <>
            {audio.length ? (
                <button data-focus="player-audio" onClick={() => open('audio')}>
                    Audio: {audio[active(audio)]?.label ?? '—'}
                </button>
            ) : null}
            {text.length ? (
                <button data-focus="player-text" onClick={() => open('text')}>
                    Subtitles: {text[active(text)]?.label ?? 'Off'}
                </button>
            ) : null}
            {panel ? (
                <div
                    class="track-panel"
                    data-tv-modal
                    role="dialog"
                    aria-label={panel.kind === 'audio' ? 'Audio' : 'Subtitles'}
                    onKeyDown={(event) => {
                        if (!isBack(event)) return;
                        event.preventDefault();
                        event.stopPropagation();
                        close(panel.kind);
                    }}
                >
                    <div class="track-box">
                        <h2>
                            {panel.kind === 'audio' ? 'Audio' : 'Subtitles'}
                        </h2>
                        <p class="muted">
                            OK: choose and resume · Back: keep the current one
                        </p>
                        <div class="track-list">
                            {options.map((o) => (
                                <button
                                    key={o.index}
                                    class={`track-option ${o.index === current ? 'is-chosen' : ''}`}
                                    data-focus={`track-${panel.kind}-${o.index}`}
                                    aria-pressed={o.index === current}
                                    onClick={() => close(panel.kind, o.index)}
                                >
                                    <span aria-hidden="true">
                                        {o.index === current ? '●' : '○'}
                                    </span>{' '}
                                    {o.label}
                                </button>
                            ))}
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

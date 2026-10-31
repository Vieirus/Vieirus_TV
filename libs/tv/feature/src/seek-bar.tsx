import type { NativePlayer } from '@iptvnator/tv/data-access';
import type { useScrub } from './use-scrub';

/** 1:05:09 for long titles, 4:07 otherwise. */
export function clock(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rest = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

/**
 * Timeline with the time shown above its cursor. While scrubbing the bubble
 * follows the chosen position, so you can see where the video will jump.
 */
export function SeekBar({
    player,
    video,
    position,
    scrub,
}: {
    player?: NativePlayer;
    video: HTMLVideoElement | null;
    position: number;
    scrub: ReturnType<typeof useScrub>;
}) {
    const duration =
        video && Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : 0;
    const ratio = duration ? Math.max(0, Math.min(1, position / duration)) : 0;
    const percent = `${(ratio * 100).toFixed(3)}%`;
    return (
        <label class="seek">
            Playback position · ← → : 10 s · hold to move faster
            <span class="seek-track">
                <span
                    class={`seek-bubble ${scrub.target !== undefined ? 'is-scrubbing' : ''}`}
                    aria-hidden="true"
                    // Stays above the cursor and inside the bar at both ends.
                    style={{
                        left: percent,
                        transform: `translateX(-${percent})`,
                    }}
                >
                    {clock(position)}
                </span>
                <input
                    aria-label="Playback position"
                    aria-valuetext={clock(position)}
                    data-focus="player-seek"
                    onKeyDown={scrub.keyDown}
                    onBlur={scrub.blur}
                    type="range"
                    min="0"
                    max={duration}
                    value={position}
                    onInput={(e) => {
                        player?.seekTo(Number(e.currentTarget.value));
                    }}
                />
            </span>
        </label>
    );
}

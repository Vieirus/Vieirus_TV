import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { NativePlayer } from '@iptvnator/tv/data-access';

/** Key presses closer than this belong to one hold (LG remotes repeat slowly). */
const HOLD_GAP = 700;
/** Quiet time after the last press before the video jumps and plays again. */
const SETTLE = 700;

interface Scrub {
    direction: number;
    /** Start of the current hold (drives the speed). */
    started: number;
    last: number;
    value: number;
    resume: boolean;
    timer?: ReturnType<typeof setTimeout>;
}

/**
 * Seconds added by one key press, `held` seconds into a hold: 10 s during the
 * first second, then doubling every second, up to 1/40 of the title.
 */
export function scrubStep(held: number, duration: number) {
    const most = Number.isFinite(duration) ? Math.max(60, duration / 40) : 120;
    return held < 1 ? 10 : Math.min(most, 10 * Math.pow(2, held - 1));
}

/**
 * Timeline keys. Each press moves 10 s; keeping the key down moves faster and
 * faster. Playback pauses while scrubbing and only the bar moves; the video
 * jumps once, shortly after the last press, then plays again.
 *
 * Holds are recognised from the timing of presses only: LG remotes send a
 * held key as separate presses (often with a release each time and without
 * the "repeat" flag), so neither can be relied on.
 */
export function useScrub(player?: NativePlayer) {
    const [target, setTarget] = useState<number>();
    const state = useRef<Scrub>();
    const latest = useRef(player);
    latest.current = player;
    const commit = () => {
        const s = state.current;
        if (!s) return;
        clearTimeout(s.timer);
        state.current = undefined;
        const p = latest.current;
        p?.seekTo(s.value);
        if (s.resume) p?.resume();
        setTarget(undefined);
    };
    useEffect(() => () => clearTimeout(state.current?.timer), []);
    const keyDown: JSX.KeyboardEventHandler<HTMLInputElement> = (event) => {
        const left = event.key === 'ArrowLeft' || event.keyCode === 37;
        const right = event.key === 'ArrowRight' || event.keyCode === 39;
        if (!left && !right) return;
        event.preventDefault();
        event.stopPropagation();
        const p = latest.current;
        const video = p?.video;
        if (!p || !video) return;
        const direction = right ? 1 : -1;
        const duration =
            Number.isFinite(video.duration) && video.duration > 0
                ? video.duration
                : Infinity;
        const now = Date.now();
        let s = state.current;
        if (!s) {
            const resume = !video.paused;
            if (resume) p.pause();
            s = {
                direction,
                started: now,
                last: now,
                value: p.position,
                resume,
            };
        } else {
            clearTimeout(s.timer);
            if (s.direction !== direction || now - s.last > HOLD_GAP)
                s = { ...s, direction, started: now };
        }
        const held = (now - s.started) / 1000;
        const value = Math.max(
            0,
            Math.min(
                duration - 1,
                s.value + direction * scrubStep(held, duration)
            )
        );
        s = { ...s, last: now, value };
        s.timer = setTimeout(commit, SETTLE);
        state.current = s;
        setTarget(value);
    };
    return { target, keyDown, blur: commit };
}

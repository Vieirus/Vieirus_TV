import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { NativePlayer } from '@iptvnator/tv/data-access';

interface Scrub {
    direction: number;
    /** When the key went down (held time drives the speed). */
    started: number;
    last: number;
    value: number;
    timer?: ReturnType<typeof setTimeout>;
}

/**
 * Timeline keys. A short press moves 10 s; holding the key moves faster and
 * faster along the bar (about 20× real time at first, up to the whole title in
 * ~8 s). Only the shown position moves while the key is held: the video seeks
 * once, on release, so the TV does not reload the stream at every step.
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
        latest.current?.seekTo(s.value);
        setTarget(undefined);
    };
    useEffect(() => () => clearTimeout(state.current?.timer), []);
    const keyDown: JSX.KeyboardEventHandler<HTMLInputElement> = (event) => {
        const left = event.key === 'ArrowLeft' || event.keyCode === 37;
        const right = event.key === 'ArrowRight' || event.keyCode === 39;
        if (!left && !right) return;
        event.preventDefault();
        event.stopPropagation();
        const video = latest.current?.video;
        if (!video) return;
        const direction = right ? 1 : -1;
        const duration =
            Number.isFinite(video.duration) && video.duration > 0
                ? video.duration
                : Infinity;
        const clamp = (value: number) =>
            Math.max(0, Math.min(duration - 1, value));
        const now = Date.now();
        let s = state.current;
        if (!event.repeat || !s || s.direction !== direction) {
            // A new press: 10 s from the shown position (presses add up).
            clearTimeout(s?.timer);
            s = {
                direction,
                started: now,
                last: now,
                value: clamp((s?.value ?? video.currentTime) + direction * 10),
            };
        } else {
            const held = (now - s.started) / 1000;
            const step = Math.min(0.25, (now - s.last) / 1000);
            const fastest = Number.isFinite(duration)
                ? Math.max(120, duration / 8)
                : 600;
            const speed =
                held < 0.4 ? 0 : Math.min(fastest, 20 * Math.pow(2, held));
            s = {
                ...s,
                last: now,
                value: clamp(s.value + direction * speed * step),
            };
        }
        // Safety net in case the TV never sends the key release.
        s.timer = setTimeout(commit, 800);
        state.current = s;
        setTarget(s.value);
    };
    const keyUp: JSX.KeyboardEventHandler<HTMLInputElement> = (event) => {
        const left = event.key === 'ArrowLeft' || event.keyCode === 37;
        const right = event.key === 'ArrowRight' || event.keyCode === 39;
        if (left || right) commit();
    };
    return { target, keyDown, keyUp, blur: commit };
}

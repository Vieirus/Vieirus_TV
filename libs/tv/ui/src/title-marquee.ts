import { useEffect, useRef } from 'preact/hooks';

/** Slow enough to read while it moves. */
const SPEED = 38; // pixels per second
const PAUSE = 1200; // milliseconds held at each end

/**
 * Scrolls a title that is wider than its box, back and forth, only while its
 * card is focused. `box` is the clipping element and must contain exactly one
 * child element holding the text. Uses the Web Animations API (Chromium 36+),
 * so nothing depends on CSS variables inside keyframes.
 */
export function useTitleMarquee() {
    const box = useRef<HTMLElement>(null);
    const animation = useRef<Animation>();
    const stop = () => {
        if (animation.current) animation.current.cancel();
        animation.current = undefined;
        if (box.current) box.current.classList.remove('marquee');
    };
    const start = () => {
        const frame = box.current;
        const text = frame ? (frame.firstElementChild as HTMLElement) : null;
        if (!frame || !text || typeof text.animate !== 'function') return;
        stop();
        // Inline-block and no ellipsis, so the real text width can be measured.
        frame.classList.add('marquee');
        const distance = text.offsetWidth - frame.clientWidth;
        if (distance <= 1) {
            frame.classList.remove('marquee');
            return;
        }
        const total = (distance / SPEED) * 1000 + PAUSE * 2;
        const hold = PAUSE / total;
        animation.current = text.animate(
            [
                { transform: 'translateX(0)', offset: 0 },
                { transform: 'translateX(0)', offset: hold },
                { transform: `translateX(${-distance}px)`, offset: 1 - hold },
                { transform: `translateX(${-distance}px)`, offset: 1 },
            ],
            {
                duration: total,
                iterations: Infinity,
                direction: 'alternate',
                easing: 'linear',
            }
        );
    };
    useEffect(() => stop, []);
    return { box, start, stop };
}

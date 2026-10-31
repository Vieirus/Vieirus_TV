import { useEffect, useRef, useState } from 'preact/hooks';
/**
 * Controls reappear on remote/pointer input; Back and media keys keep their
 * normal meaning. While the controls are hidden, Left/Right seek by 10 seconds
 * (like most TV players) instead of only revealing the controls.
 */
export function usePlayerControls(
    fullscreen: boolean,
    paused: boolean,
    seek?: (seconds: number) => boolean
) {
    const [visible, setVisible] = useState(true);
    const timer = useRef<ReturnType<typeof setTimeout>>();
    const current = useRef(visible);
    current.current = visible;
    const seeker = useRef(seek);
    seeker.current = seek;
    const reveal = () => {
        current.current = true;
        setVisible(true);
        clearTimeout(timer.current);
        if (fullscreen && !paused)
            timer.current = setTimeout(() => setVisible(false), 5000);
    };
    useEffect(() => {
        reveal();
        return () => clearTimeout(timer.current);
    }, [fullscreen, paused]);
    useEffect(() => {
        if (!fullscreen) return;
        const key = (event: KeyboardEvent) => {
            const hidden = !current.current;
            const left = event.key === 'ArrowLeft' || event.keyCode === 37;
            const right = event.key === 'ArrowRight' || event.keyCode === 39;
            if (
                hidden &&
                (left || right) &&
                seeker.current?.(right ? 10 : -10)
            ) {
                event.preventDefault();
                event.stopPropagation();
                // Show where playback now is, with the timeline focused so the
                // next presses keep seeking.
                reveal();
                document
                    .querySelector<HTMLElement>('[data-focus="player-seek"]')
                    ?.focus();
                return;
            }
            if (hidden && event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
            }
            reveal();
        };
        document.addEventListener('keydown', key, true);
        document.addEventListener('mousemove', reveal);
        return () => {
            document.removeEventListener('keydown', key, true);
            document.removeEventListener('mousemove', reveal);
        };
    }, [fullscreen, paused]);
    return visible;
}

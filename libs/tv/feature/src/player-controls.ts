import { useEffect, useRef, useState } from 'preact/hooks';
/**
 * Controls reappear on remote/pointer input; Back and media keys keep their
 * normal meaning. While the controls are hidden, a key press only reveals
 * them: arrows used to seek then, so the first press towards a button jumped
 * 10 s instead. Seeking with arrows happens on the timeline only.
 */
export function usePlayerControls(fullscreen: boolean, paused: boolean) {
    const [visible, setVisible] = useState(true);
    const timer = useRef<ReturnType<typeof setTimeout>>();
    const current = useRef(visible);
    current.current = visible;
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
            const arrow = event.keyCode >= 37 && event.keyCode <= 40;
            // Hidden controls: OK and arrows just bring them back, keeping
            // the focus where it was.
            if (hidden && (event.key === 'Enter' || arrow)) {
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

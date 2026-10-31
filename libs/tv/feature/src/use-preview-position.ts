import { useEffect } from 'preact/hooks';
import type { TvModel } from './use-tv';

/**
 * Keep the native video frame over the Live preview box. Runs only while a
 * preview is on screen: measuring the layout after every render made each key
 * press slower on webOS 4.
 */
export function usePreviewPosition(tv: TvModel) {
    const previewing = !tv.fullscreen && !!tv.playing;
    useEffect(() => {
        // Runs only while a preview is on screen: measuring the layout after
        // every render made each key press slower on webOS 4.
        if (!previewing) return;
        let last = '';
        const position = () => {
            const rect = document
                .querySelector('.preview-placeholder')
                ?.getBoundingClientRect();
            const frame = document.querySelector<HTMLElement>(
                '.native-player.preview'
            );
            if (!rect || !frame) return;
            const next = `${rect.left},${rect.top},${rect.width},${rect.height}`;
            if (next === last) return;
            last = next;
            Object.assign(frame.style, {
                left: `${rect.left}px`,
                top: `${rect.top}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
            });
        };
        const frame = requestAnimationFrame(position);
        // Catch late layout shifts (header notices, loaded guide) cheaply.
        const timer = setInterval(position, 1000);
        window.addEventListener('resize', position);
        document.addEventListener('scroll', position, true);
        return () => {
            cancelAnimationFrame(frame);
            clearInterval(timer);
            window.removeEventListener('resize', position);
            document.removeEventListener('scroll', position, true);
        };
    }, [previewing, tv.route.view, tv.playing?.id, tv.storageReady]);
}

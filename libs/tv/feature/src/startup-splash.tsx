import { useEffect, useState } from 'preact/hooks';
import { restoreFocus } from '@iptvnator/tv/ui';
import type { TvModel } from './use-tv';

/**
 * Welcome page shown at launch while the saved source connects and Home
 * loads. It holds the remote (data-tv-modal), so arrows do nothing confusing
 * meanwhile, then hands focus to the Home feature once everything is there.
 * Shown once per launch only: later reconnections never cover the screen.
 */
export function useStartupSplash(tv: TvModel) {
    const [done, setDone] = useState(false);
    const hasSource =
        tv.storageReady &&
        tv.data.sources.some((s) => s.id === tv.data.activeId);
    const failed = !!tv.error && tv.errorRetryLabel === 'Retry connection';
    const finish = (focus = 'hero') => {
        setDone(true);
        restoreFocus(focus, 'nav:home');
    };
    useEffect(() => {
        if (done) return;
        if (tv.storageReady && !hasSource) setDone(true);
        else if (hasSource && tv.ready && !tv.busy) finish();
    }, [done, tv.storageReady, hasSource, tv.ready, tv.busy]);
    useEffect(() => {
        if (!done && failed) restoreFocus('splash-retry');
    }, [done, failed]);
    useEffect(() => {
        if (done) return;
        // OK must not reach the page loading behind the welcome page.
        const block = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest?.('.startup-splash')) return;
            if (event.key === 'Enter' || event.keyCode === 13) {
                event.preventDefault();
                event.stopPropagation();
            }
        };
        document.addEventListener('keydown', block, true);
        return () => document.removeEventListener('keydown', block, true);
    }, [done]);
    return {
        visible: !done && !tv.storageError && (!tv.storageReady || hasSource),
        failed,
        retry: () => tv.errorRetry?.(),
        sources: () => {
            setDone(true);
            tv.navigate('sources');
        },
    };
}

export function StartupSplash({
    splash,
}: {
    splash: ReturnType<typeof useStartupSplash>;
}) {
    if (!splash.visible) return null;
    return (
        <section class="startup-splash" data-tv-modal aria-live="polite">
            <div class="splash-name">
                Vieirus<span>TV</span>
            </div>
            <h1>Bienvenue à la Famille Vanaken Vieira</h1>
            {splash.failed ? (
                <div class="splash-status" role="alert">
                    <p>La connexion à votre source n’a pas abouti.</p>
                    <div class="actions">
                        <button
                            class="primary"
                            data-focus="splash-retry"
                            onClick={splash.retry}
                        >
                            Réessayer
                        </button>
                        <button
                            data-focus="splash-sources"
                            onClick={splash.sources}
                        >
                            Modifier la source
                        </button>
                    </div>
                </div>
            ) : (
                <div class="splash-status" role="status">
                    <span class="splash-spinner" aria-hidden="true" />
                    <p>Connexion en cours…</p>
                </div>
            )}
        </section>
    );
}

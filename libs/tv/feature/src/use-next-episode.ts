import { useEffect, useRef } from 'preact/hooks';
import { findParentSeries } from '@iptvnator/tv/data-access';
import { Media, seriesForEpisode } from '@iptvnator/tv/util';
import type { TvModel } from './use-tv';

const order = (a: Media, b: Media) =>
    (a.season ?? 1) - (b.season ?? 1) || (a.episode ?? 0) - (b.episode ?? 0);

/** The episode after `current` in season/episode order, if any. */
export function nextEpisode(current: Media, episodes: Media[]) {
    const sorted = episodes
        .filter((e) => e.kind === 'episode')
        .slice()
        .sort(order);
    const index = sorted.findIndex((e) => e.id === current.id);
    if (index >= 0) return sorted[index + 1];
    // Not in the list (different id format): first one after it in order.
    return sorted.find((e) => order(e, current) > 0);
}

/**
 * When an episode ends in fullscreen, start the next one. Its audio and
 * subtitle choice carries over (same series, see PlayerTracks.start).
 */
export function useNextEpisode(tv: TvModel) {
    const latest = useRef(tv);
    latest.current = tv;
    const busy = useRef('');
    const video = tv.player.current?.video;
    useEffect(() => {
        if (!video) return;
        const ended = async () => {
            const t = latest.current;
            const current = t.playing;
            if (!current || current.kind !== 'episode' || !t.fullscreen) return;
            if (busy.current === current.id) return;
            busy.current = current.id;
            try {
                let episodes = t.episodes.some((e) => e.id === current.id)
                    ? t.episodes
                    : [];
                const client = t.guideClient;
                if (!episodes.length && client) {
                    const source = t.data.sources.find(
                        (s) => s.id === current.sourceId
                    );
                    const signal = new AbortController().signal;
                    const parent =
                        seriesForEpisode(current, [
                            ...t.home,
                            ...t.data.favorites,
                            ...(t.selected ? [t.selected] : []),
                        ]) ??
                        (source
                            ? await findParentSeries(
                                  client,
                                  source,
                                  current,
                                  signal
                              )
                            : undefined);
                    if (parent)
                        episodes = await client.episodes(parent, signal);
                }
                const next = nextEpisode(current, episodes);
                // Still on the same episode? (the viewer may have left)
                const now = latest.current;
                if (!next || now.playing?.id !== current.id || !now.fullscreen)
                    return;
                await now.play(next, now.route.category, next.id);
            } catch {
                // No next episode found: stay on the finished one.
            } finally {
                busy.current = '';
            }
        };
        video.addEventListener('ended', ended);
        return () => video.removeEventListener('ended', ended);
    }, [video]);
}

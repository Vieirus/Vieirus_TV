import { useEffect, useRef } from 'preact/hooks';
import { findParentSeries } from '@iptvnator/tv/data-access';
import { isFinished, Media, seriesForEpisode } from '@iptvnator/tv/util';
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

/** The series an episode belongs to, from memory or from the provider. */
async function parentOf(tv: TvModel, episode: Media, signal: AbortSignal) {
    const known = seriesForEpisode(episode, [
        ...tv.home,
        ...tv.data.favorites,
        ...(tv.selected ? [tv.selected] : []),
    ]);
    const source = tv.data.sources.find((s) => s.id === episode.sourceId);
    if (known || !tv.guideClient || !source) return known;
    return findParentSeries(tv.guideClient, source, episode, signal);
}

/** Find the episode after `current`; undefined when it was the last one. */
export async function findNextEpisode(
    tv: TvModel,
    current: Media,
    signal = new AbortController().signal
) {
    let episodes = tv.episodes.some((e) => e.id === current.id)
        ? tv.episodes
        : [];
    if (!episodes.length && tv.guideClient) {
        const parent = await parentOf(tv, current, signal);
        if (parent) episodes = await tv.guideClient.episodes(parent, signal);
    }
    return { next: nextEpisode(current, episodes) };
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
                const { next } = await findNextEpisode(t, current);
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

/**
 * Resume from Home: a title in progress continues where it stopped; a series
 * whose latest episode was watched to the end starts the next episode, or
 * opens the series when that was the last one.
 */
export function useResume(tv: TvModel) {
    const latest = useRef(tv);
    latest.current = tv;
    return async (item: Media) => {
        const t = latest.current;
        const saved = t.data.positions[item.id];
        if (item.kind !== 'episode' || !saved || !isFinished(saved)) {
            void t.play(item);
            return;
        }
        try {
            const { next } = await findNextEpisode(t, item);
            if (next) {
                void latest.current.play(next, '', next.id);
                return;
            }
            const parent = await parentOf(
                latest.current,
                item,
                new AbortController().signal
            );
            if (parent) latest.current.open(parent);
        } catch {
            latest.current.setError(
                'Could not find the next episode. Open the series to choose one.'
            );
        }
    };
}

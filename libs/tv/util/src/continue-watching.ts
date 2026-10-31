import type { Progress, UserData } from './index';

/** Watched to the end (the player restarts such titles from the beginning). */
export function isFinished(p: Pick<Progress, 'seconds' | 'duration'>) {
    return !!p.duration && p.duration - p.seconds <= 15;
}
const isSeriesEpisode = (p: Progress) =>
    p.item.kind === 'episode' && !!p.item.parentId;

/** A series contributes its latest episode only, even if older episodes are unfinished. */
export function continueWatching(data: UserData, limit = 8): Progress[] {
    const seen = new Set<string>();
    return data.history
        .map((progress, ordinal) => ({ progress, ordinal }))
        .filter(
            ({ progress: p }) =>
                p.item.sourceId === data.activeId &&
                (p.item.kind === 'movie' || p.item.kind === 'episode')
        )
        .sort(
            (a, b) =>
                b.progress.updated - a.progress.updated || a.ordinal - b.ordinal
        )
        .filter(({ progress: p }) => {
            const key = JSON.stringify([
                p.item.sourceId,
                p.item.kind,
                p.item.kind === 'episode'
                    ? p.item.parentId || p.item.id
                    : p.item.id,
            ]);
            if (seen.has(key)) return false;
            seen.add(key);
            if (!Number.isFinite(p.seconds) || p.seconds <= 0) return false;
            // A started series stays on Home after its latest episode ends;
            // the card then offers the next episode.
            return !isFinished(p) || isSeriesEpisode(p);
        })
        .slice(0, limit)
        .map(({ progress }) => progress);
}

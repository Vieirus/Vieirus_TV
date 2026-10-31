import { normalizeTitleKeys } from '@iptvnator/shared/interfaces';

/*
 * Normalizing a title runs a dozen regular expressions. On a webOS 4 TV
 * (Chromium 53, where the Unicode classes are also rewritten into long
 * character ranges) doing that for every title of a 20 000-film catalogue on
 * every key press made search take seconds. Each title is now normalized once
 * and reused by every later search.
 */
const normalized = new Map<string, string>();
const lowered = new Map<string, string>();
const LIMIT = 200000;

function remember(cache: Map<string, string>, key: string, value: string) {
    if (cache.size >= LIMIT) cache.clear();
    cache.set(key, value);
    return value;
}

export function normalizedTitle(title: string): string {
    const cached = normalized.get(title);
    return cached !== undefined
        ? cached
        : remember(normalized, title, normalizeTitleKeys(title).exact);
}

function lowerTitle(title: string): string {
    const cached = lowered.get(title);
    return cached !== undefined
        ? cached
        : remember(lowered, title, title.toLowerCase());
}

/** Keep literal partial searches and admit equivalent punctuation/diacritics. */
export function catalogTitleMatcher(query: string): (title: string) => boolean {
    if (!query) return () => true;
    const literal = query.toLowerCase();
    const key = normalizeTitleKeys(query).exact;
    return (title) =>
        lowerTitle(title).includes(literal) ||
        (!!key && normalizedTitle(title).includes(key));
}

/**
 * Prepare the search index in small slices while the viewer is elsewhere, so
 * the first search does not pay for the whole catalogue at once.
 */
export function warmTitleIndex(
    titles: string[],
    signal?: AbortSignal,
    slice = 400
) {
    let index = 0;
    const step = () => {
        if (signal?.aborted) return;
        const end = Math.min(titles.length, index + slice);
        for (; index < end; index++) {
            normalizedTitle(titles[index]);
            lowerTitle(titles[index]);
        }
        if (index < titles.length) setTimeout(step, 30);
    };
    setTimeout(step, 30);
}

import {
    XtreamClient,
    xtreamCatalogTimestamp,
    resolveXtreamVodPlaybackSource,
} from '@iptvnator/portal/xtream/client';
import {
    Catalog,
    CatalogSort,
    sortCatalog,
    catalogTitleMatcher,
    Kind,
    Media,
    Source,
    ProviderClient,
    rows,
    text,
    artwork,
    identity,
    withSeriesContext,
} from '@iptvnator/tv/util';
import type { XtreamVodDetails } from '@iptvnator/shared/interfaces';
import { ProviderTransport } from './transport';
export class XtreamProvider implements ProviderClient {
    readonly capabilities = {
        live: true,
        movies: true,
        series: true,
        epg: true,
    };
    private client: XtreamClient;
    /** Raw provider lists by action, shared by every caller (also while still loading). */
    private pending = new Map<string, Promise<Record<string, unknown>[]>>();
    /** Mapped Media per kind and the last filtered/sorted view: both cost O(list) on a TV CPU. */
    private mapped = new Map<Kind, Media[]>();
    private view?: { key: string; items: Media[] };
    /** Owns requests that outlive a single screen; aborted with the provider. */
    private lifetime = new AbortController();
    private prefetchTimer?: ReturnType<typeof setTimeout>;
    constructor(
        private source: Source,
        transport: ProviderTransport
    ) {
        this.client = new XtreamClient(source, (params, signal) =>
            transport.request(source, 'xtream', params, signal)
        );
    }
    async connect(signal: AbortSignal) {
        await this.client.account(signal);
        return this.source;
    }
    private media(raw: Record<string, unknown>, kind: Kind): Media {
        const providerId = text(
            kind === 'series' ? raw.series_id : (raw.stream_id ?? raw.id)
        );
        return {
            id: identity(this.source, kind, providerId),
            sourceId: this.source.id,
            providerId,
            kind,
            title: text(raw.name ?? raw.title),
            addedAt: xtreamCatalogTimestamp(raw, kind === 'series'),
            poster: artwork(raw.stream_icon ?? raw.cover),
            category: text(raw.category_id),
            backdrop: artwork(
                Array.isArray(raw.backdrop_path)
                    ? raw.backdrop_path[0]
                    : raw.backdrop_path
            ),
            description: text(raw.plot ?? raw.description),
            year: text(raw.year ?? raw.releaseDate),
            raw,
        };
    }
    private list(action: string): Promise<Record<string, unknown>[]> {
        let request = this.pending.get(action);
        if (!request) {
            request = this.client
                .request(action, {}, this.lifetime.signal)
                .then(rows)
                .catch((error) => {
                    // A failure must not be remembered: the next visit retries.
                    this.pending.delete(action);
                    throw error;
                });
            this.pending.set(action, request);
        }
        return request;
    }
    private mediaOf(kind: Kind, data: Record<string, unknown>[]): Media[] {
        let items = this.mapped.get(kind);
        if (!items) {
            items = data.map((r) => this.media(r, kind));
            this.mapped.set(kind, items);
        }
        return items;
    }
    /**
     * Fetch the three catalogs one after another shortly after connecting, so the
     * first visit to Live/Movies/Series finds them ready. Staggered so the JSON
     * parsing of a very large list never lands in the middle of a key press.
     */
    prefetch() {
        const steps = [
            'get_live_categories',
            'get_live_streams',
            'get_vod_categories',
            'get_vod_streams',
            'get_series_categories',
            'get_series',
        ];
        const next = () => {
            const action = steps.shift();
            if (!action || this.lifetime.signal.aborted) return;
            this.list(action)
                .catch(() => undefined)
                .then(() => {
                    this.prefetchTimer = setTimeout(next, 400);
                });
        };
        this.prefetchTimer = setTimeout(next, 1500);
    }
    async catalog(
        kind: Kind,
        category: string,
        page: number,
        query: string,
        signal: AbortSignal,
        sort: CatalogSort = 'recent'
    ): Promise<Catalog> {
        const type = kind === 'movie' ? 'vod' : kind;
        const [data, categoryRows] = await Promise.all([
            this.list(kind === 'series' ? 'get_series' : `get_${type}_streams`),
            this.list(`get_${type}_categories`),
        ]);
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const categories = categoryRows.map((r) => ({
            id: text(r.category_id),
            name: text(r.category_name),
        }));
        // Later pages and repeat visits reuse the same filtered, sorted list.
        const key = JSON.stringify([kind, category, query, sort]);
        if (this.view?.key !== key) {
            const matchesTitle = catalogTitleMatcher(query);
            const items = this.mediaOf(kind, data).filter(
                (m) =>
                    (!category || m.category === category) &&
                    matchesTitle(m.title)
            );
            this.view = {
                key,
                items: sortCatalog(items, kind === 'live' ? 'provider' : sort),
            };
        }
        const items = this.view.items;
        return {
            items: items.slice(page * 60, (page + 1) * 60),
            total: items.length,
            page,
            categories,
        };
    }
    async details(item: Media, signal: AbortSignal): Promise<Media> {
        if (item.kind === 'episode') return item;
        const result = (await this.client.request(
            item.kind === 'series' ? 'get_series_info' : 'get_vod_info',
            {
                [item.kind === 'series' ? 'series_id' : 'vod_id']:
                    item.providerId,
            },
            signal
        )) as Record<string, unknown>;
        const info = (result.info ?? {}) as Record<string, unknown>;
        return {
            ...item,
            raw: { ...item.raw, details: result },
            description: text(info.plot ?? info.description),
            year: text(info.releasedate ?? info.releaseDate),
            poster: artwork(info.movie_image ?? info.cover) ?? item.poster,
            backdrop: artwork(
                Array.isArray(info.backdrop_path)
                    ? info.backdrop_path[0]
                    : info.backdrop_path
            ),
        };
    }
    async episodes(item: Media, signal: AbortSignal): Promise<Media[]> {
        const detail = item.raw.details
            ? item
            : await this.details(item, signal);
        const data = detail.raw.details as {
            episodes?: Record<string, unknown>;
        };
        const result: Media[] = [];
        Object.keys(data.episodes ?? {}).forEach((season) =>
            rows(data.episodes?.[season]).forEach((r) => {
                const providerId = text(r.id);
                const info = (r.info ?? {}) as Record<string, unknown>;
                result.push(
                    withSeriesContext(
                        {
                            ...this.media(r, 'episode'),
                            id: identity(
                                this.source,
                                'episode',
                                `${item.providerId}:${season}:${providerId}`
                            ),
                            providerId,
                            parentId: item.id,
                            seriesTitle: item.title,
                            seriesYear: item.year,
                            poster: detail.poster || item.poster,
                            episodeStill: artwork(info.movie_image),
                            description: text(info.plot ?? info.description),
                            backdrop: detail.backdrop,
                            season: Number(r.season ?? season),
                            episode: Number(r.episode_num),
                            title: text(r.title) || `Episode ${r.episode_num}`,
                            raw: r,
                        },
                        detail
                    )
                );
            })
        );
        return result;
    }
    async epg(item: Media, signal: AbortSignal) {
        return (await this.client.epg(item.providerId, signal)).map((p) => ({
            title: p.title,
            description: p.description,
            start: Date.parse(p.start),
            end: Date.parse(p.stop),
        }));
    }
    async resolve(item: Media, signal: AbortSignal) {
        if (item.kind === 'live')
            return {
                url: this.client.stream(
                    'live',
                    item.providerId,
                    this.client.formats.includes('m3u8') ||
                        !this.client.formats.length
                        ? 'm3u8'
                        : this.client.formats[0]
                ),
            };
        if (item.kind === 'episode')
            return {
                url: this.client.stream(
                    'series',
                    item.providerId,
                    text(item.raw.container_extension)
                ),
            };
        let source =
            resolveXtreamVodPlaybackSource(
                item.raw.details as XtreamVodDetails
            ) ??
            resolveXtreamVodPlaybackSource({
                movie_data: item.raw,
            } as unknown as XtreamVodDetails);
        if (!source) {
            const detail = await this.details(item, signal);
            source = resolveXtreamVodPlaybackSource(
                detail.raw.details as XtreamVodDetails
            );
        }
        if (!source)
            throw new Error(
                'This movie has no complete stream ID and file extension or direct address.'
            );
        return {
            url:
                source.directSource ??
                this.client.stream(
                    'movie',
                    source.streamId,
                    source.containerExtension
                ),
        };
    }
    dispose() {
        if (this.prefetchTimer) clearTimeout(this.prefetchTimer);
        this.lifetime.abort();
        this.pending.clear();
        this.mapped.clear();
        this.view = undefined;
    }
}

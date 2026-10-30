import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XtreamProvider } from '../data-access/src/xtream';
import type { ProviderTransport } from '../data-access/src/transport';
import type { Source } from '@iptvnator/tv/util';

const source: Source = {
    id: 'x',
    provider: 'xtream',
    name: 'X',
    url: 'http://provider.invalid',
    username: 'u',
    password: 'p',
};
const signal = () => new AbortController().signal;

function fake(options: { failFirst?: string } = {}) {
    const calls: string[] = [];
    let failed = false;
    const transport = {
        async request(_s: Source, _r: string, params: Record<string, string>) {
            const action = params.action ?? '';
            calls.push(action);
            if (action === options.failFirst && !failed) {
                failed = true;
                throw new Error('network');
            }
            if (action === 'get_vod_streams')
                return Array.from({ length: 150 }, (_, i) => ({
                    stream_id: i + 1,
                    name: `Film ${i + 1}`,
                    category_id: String(i % 2),
                    added: String(1000 + i),
                }));
            if (action === 'get_vod_categories')
                return [
                    { category_id: '0', category_name: 'A' },
                    { category_id: '1', category_name: 'B' },
                ];
            return [];
        },
    } as unknown as ProviderTransport;
    return { calls, provider: new XtreamProvider(source, transport) };
}

test('repeat visits and later pages reuse one request and one prepared list', async () => {
    const { calls, provider } = fake();
    const first = await provider.catalog('movie', '', 0, '', signal());
    const second = await provider.catalog('movie', '', 1, '', signal());
    const again = await provider.catalog('movie', '', 0, '', signal());
    assert.equal(calls.filter((c) => c === 'get_vod_streams').length, 1);
    assert.equal(calls.filter((c) => c === 'get_vod_categories').length, 1);
    assert.equal(first.total, 150);
    assert.equal(first.items.length, 60);
    assert.equal(second.items.length, 60);
    assert.equal(again.items[0], first.items[0], 'same prepared Media object');
    assert.equal(first.categories.length, 2);
    const byCategory = await provider.catalog('movie', '1', 0, '', signal());
    assert.equal(byCategory.total, 75);
});

test('two screens asking at the same time share the request', async () => {
    const { calls, provider } = fake();
    await Promise.all([
        provider.catalog('movie', '', 0, '', signal()),
        provider.catalog('movie', '0', 0, '', signal()),
    ]);
    assert.equal(calls.filter((c) => c === 'get_vod_streams').length, 1);
});

test('a failed request is retried on the next visit, not remembered', async () => {
    const { calls, provider } = fake({ failFirst: 'get_vod_streams' });
    await assert.rejects(provider.catalog('movie', '', 0, '', signal()));
    const retry = await provider.catalog('movie', '', 0, '', signal());
    assert.equal(retry.total, 150);
    assert.equal(calls.filter((c) => c === 'get_vod_streams').length, 2);
});

test('an aborted caller gets an AbortError but the list stays cached', async () => {
    const { calls, provider } = fake();
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
        provider.catalog('movie', '', 0, '', controller.signal),
        (error: unknown) => (error as Error).name === 'AbortError'
    );
    await provider.catalog('movie', '', 0, '', signal());
    assert.equal(calls.filter((c) => c === 'get_vod_streams').length, 1);
});

test('prefetch warms live, movies and series one after another, then stops on dispose', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { calls, provider } = fake();
    provider.prefetch();
    assert.deepEqual(calls, []);
    for (let i = 0; i < 12; i++) {
        t.mock.timers.tick(1600);
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(calls, [
        'get_live_categories',
        'get_live_streams',
        'get_vod_categories',
        'get_vod_streams',
        'get_series_categories',
        'get_series',
    ]);
    const warmed = fake();
    warmed.provider.prefetch();
    warmed.provider.dispose();
    t.mock.timers.tick(5000);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(warmed.calls, []);
});

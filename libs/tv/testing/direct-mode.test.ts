import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProviderRequestError, ProviderTransport } from '@iptvnator/tv/data-access';
import type { Source } from '@iptvnator/tv/util';
import { parseM3u } from '../data-access/src/direct-m3u';

const playlist =
    '#EXTM3U\n#EXTINF:-1 tvg-id="a" tvg-logo="http://x/l.png" group-title="Films, HD",Canal, Plus\nhttp://h/1.m3u8\n#EXTINF:-1,Sans url\n';

test('direct M3U parsing keeps commas inside names and quoted groups', () => {
    const items = parseM3u(playlist).items;
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'Canal, Plus');
    assert.equal(items[0].group.title, 'Films, HD');
    assert.equal(items[0].tvg.logo, 'http://x/l.png');
});

test('an empty backend address reads Xtream and M3U straight from the provider', async (t) => {
    const calls: string[] = [];
    t.mock.method(globalThis, 'fetch', async (url: string) => {
        calls.push(url);
        if (url.includes('player_api.php'))
            return Response.json({ user_info: { status: 'Active' } });
        return new Response(playlist);
    });
    const transport = new ProviderTransport('');
    assert.equal(transport.direct, true);
    const signal = new AbortController().signal;
    const xtream: Source = {
        id: 'x',
        provider: 'xtream',
        name: 'X',
        url: 'http://provider.invalid:8080',
    };
    const account = (await transport.request(
        xtream,
        'xtream',
        { action: 'get_account_info', username: 'u', password: 'p' },
        signal
    )) as { user_info: { status: string } };
    assert.equal(account.user_info.status, 'Active');
    assert.equal(
        calls[0],
        'http://provider.invalid:8080/player_api.php?action=get_account_info&username=u&password=p'
    );
    const parsed = (await transport.request(
        { id: 'm', provider: 'm3u', name: 'M', url: 'http://provider.invalid/list.m3u' },
        'parse',
        {},
        signal
    )) as { playlist: { items: unknown[] } };
    assert.equal(parsed.playlist.items.length, 1);
});

test('direct mode reports blocked requests and refuses Stalker without a home server', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => {
        throw new TypeError('Failed to fetch');
    });
    const transport = new ProviderTransport('');
    const signal = new AbortController().signal;
    await assert.rejects(
        transport.request(
            { id: 'x', provider: 'xtream', name: 'X', url: 'http://provider.invalid' },
            'xtream',
            {},
            signal
        ),
        (error: unknown) =>
            error instanceof ProviderRequestError && error.status === 0
    );
    await assert.rejects(
        transport.request(
            { id: 's', provider: 'stalker', name: 'S', url: 'http://provider.invalid' },
            'stalker',
            {},
            signal
        ),
        /home server/
    );
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { NativePlayer, trackLabel } from '@iptvnator/tv/data-access';
import {
    catalogTitleMatcher,
    normalizedTitle,
    warmTitleIndex,
} from '@iptvnator/tv/util';
import { normalizeTitleKeys } from '@iptvnator/shared/interfaces';

function fakeList<T extends object>(tracks: T[]) {
    const target = new EventTarget();
    const list = Object.assign(target, { length: tracks.length }) as Record<
        number,
        T
    > &
        EventTarget & { length: number };
    tracks.forEach((t, i) => (list[i] = t));
    return list;
}

function player(audio: object[], text: object[]) {
    const dom = new JSDOM('<video></video>');
    Object.assign(globalThis, {
        document: dom.window.document,
        window: dom.window,
    });
    const video = dom.window.document.querySelector('video')!;
    const audioTracks = fakeList(audio);
    const textTracks = fakeList(text);
    Object.defineProperties(video, {
        audioTracks: { value: audioTracks },
        textTracks: { value: textTracks },
        load: { value: () => undefined },
        pause: { value: () => undefined },
    });
    let changes = 0;
    const p = new NativePlayer(
        video,
        async () => undefined,
        () => undefined,
        () => changes++
    );
    return { p, audioTracks, textTracks, changes: () => changes };
}

test('audio tracks: listed only when there is a choice, cycled and remembered', async () => {
    const fr = { enabled: true, label: '', language: 'fre' };
    const en = { enabled: false, label: 'English 5.1', language: 'eng' };
    const { p, audioTracks } = player([fr, en], []);
    assert.deepEqual(
        p.tracks.audioTracks().map((t) => [t.label, t.active]),
        [
            ['Français', true],
            ['English 5.1', false],
        ]
    );
    p.tracks.cycleAudio();
    assert.equal(fr.enabled, false);
    assert.equal(en.enabled, true);
    p.tracks.cycleAudio();
    assert.equal(fr.enabled, true);
    assert.equal(en.enabled, false);
    // Preference applies to the next stream's tracks when they appear.
    p.tracks.selectAudio(1);
    en.enabled = false;
    fr.enabled = true;
    audioTracks.dispatchEvent(new Event('addtrack'));
    assert.equal(en.enabled, true);
    assert.equal(fr.enabled, false);
    p.dispose();

    const single = player([{ enabled: true, label: '', language: 'fr' }], []);
    assert.deepEqual(single.p.tracks.audioTracks(), []);
    single.p.dispose();
});

test('subtitles: Off → each track → Off, metadata tracks ignored', () => {
    const fr = {
        kind: 'subtitles',
        label: '',
        language: 'fr',
        mode: 'disabled',
    };
    const nl = {
        kind: 'captions',
        label: 'NL',
        language: 'nl',
        mode: 'disabled',
    };
    const meta = {
        kind: 'metadata',
        label: 'id3',
        language: '',
        mode: 'hidden',
    };
    const { p } = player([], [fr, meta, nl]);
    assert.deepEqual(
        p.tracks.textTracks().map((t) => t.label),
        ['Français', 'Nederlands']
    );
    p.tracks.cycleText();
    assert.equal(fr.mode, 'showing');
    p.tracks.cycleText();
    assert.deepEqual([fr.mode, nl.mode], ['disabled', 'showing']);
    p.tracks.cycleText();
    assert.deepEqual([fr.mode, nl.mode], ['disabled', 'disabled']);
    assert.equal(meta.mode, 'hidden');
    p.dispose();
});

test('track labels fall back sensibly', () => {
    assert.equal(trackLabel({ label: '', language: '' }, 2), 'Track 3');
    assert.equal(trackLabel({ label: '', language: 'kor' }, 0), 'KOR');
    assert.equal(
        trackLabel({ label: 'VF', language: 'fra' }, 0),
        'Français (VF)'
    );
    assert.equal(
        trackLabel({ label: 'Français', language: 'fr' }, 0),
        'Français'
    );
});

test('cached search matcher returns the same results as uncached normalization', async () => {
    const titles = [
        'Amélie',
        'AMELIE (2001)',
        'Spider-Man: No Way Home',
        'Spiderman',
        'Сезон охоты',
        'La Casa de Papel - Saison 2',
        'Léon',
        '',
        'The Matrix 1999',
    ];
    const reference = (query: string) => {
        const literal = query.toLowerCase();
        const key = normalizeTitleKeys(query).exact;
        return titles.filter(
            (t) =>
                t.toLowerCase().includes(literal) ||
                (!!key && normalizeTitleKeys(t).exact.includes(key))
        );
    };
    for (const query of [
        'amelie',
        'Amélie',
        'spider man',
        'spiderman',
        'сезон',
        'papel',
        'leon',
        '',
        'matrix',
        '   ',
    ]) {
        const match = catalogTitleMatcher(query);
        assert.deepEqual(titles.filter(match), reference(query), query);
        // Second pass uses the cache.
        assert.deepEqual(titles.filter(match), reference(query), query);
    }
    assert.equal(normalizedTitle('Léon'), normalizeTitleKeys('Léon').exact);
    const many = Array.from({ length: 1000 }, (_, i) => `Film numéro ${i}`);
    warmTitleIndex(many, undefined, 300);
    await new Promise((r) => setTimeout(r, 300));
    const started = Date.now();
    assert.equal(many.filter(catalogTitleMatcher('numero 99')).length, 11);
    assert.ok(Date.now() - started < 200);
});

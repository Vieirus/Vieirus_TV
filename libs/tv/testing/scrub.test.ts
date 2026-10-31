import { test } from 'node:test';
import assert from 'node:assert/strict';
import { options, h, render } from 'preact';
import { JSDOM } from 'jsdom';
import { useScrub } from '../feature/src/use-scrub';
import type { NativePlayer } from '@iptvnator/tv/data-access';

test('timeline: short press = 10 s, held key accelerates, one seek on release', async () => {
    const dom = new JSDOM('<div id="root"></div>');
    Object.assign(globalThis, {
        document: dom.window.document,
        window: dom.window,
        requestAnimationFrame: (f: () => void) => setTimeout(f, 0),
    });
    options.debounceRendering = (f) => f();
    const seeks: number[] = [];
    const player = {
        video: { currentTime: 100, duration: 3600 },
        seekTo: (s: number) => seeks.push(s),
    } as unknown as NativePlayer;
    let scrub!: ReturnType<typeof useScrub>;
    const Probe = () => {
        scrub = useScrub(player);
        return null;
    };
    render(h(Probe, {}), dom.window.document.getElementById('root')!);
    const key = (repeat = false) =>
        ({
            key: 'ArrowRight',
            keyCode: 39,
            repeat,
            preventDefault() {},
            stopPropagation() {},
        }) as never;

    scrub.keyDown(key());
    scrub.keyUp(key());
    assert.deepEqual(seeks, [110]);

    // Hold for ~2 s of repeats (simulated clock).
    const realNow = Date.now;
    let now = realNow();
    Date.now = () => now;
    try {
        scrub.keyDown(key());
        for (let i = 0; i < 40; i++) {
            now += 50;
            scrub.keyDown(key(true));
        }
        assert.equal(seeks.length, 1, 'no seek while held');
        scrub.keyUp(key());
    } finally {
        Date.now = realNow;
    }
    assert.equal(seeks.length, 2);
    // Far more than the 10 s per press a plain repeat would give (~400 s).
    assert.ok(seeks[1] - 100 > 60, `moved ${seeks[1] - 100}s`);
    assert.ok(seeks[1] < 3600);
});

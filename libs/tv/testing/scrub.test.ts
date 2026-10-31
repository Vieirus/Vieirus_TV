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
    // The TV keeps reporting the old currentTime while a seek is applied;
    // the player's position is the pending target.
    const fake = {
        video: { currentTime: 100, duration: 3600 },
        position: 100,
        seekTo: (s: number) => {
            seeks.push(s);
            fake.position = s;
        },
    };
    const player = fake as unknown as NativePlayer;
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
    // Started from the pending 110 s, not the stale 100 s, and accelerated.
    assert.ok(seeks[1] - 110 > 60, `moved ${seeks[1] - 110}s`);
    assert.ok(seeks[1] < 3600);
    // Next press continues from the pending target: never backwards.
    scrub.keyDown(key());
    scrub.keyUp(key());
    assert.equal(seeks[2], seeks[1] + 10);
});

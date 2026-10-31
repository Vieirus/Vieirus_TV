import { test } from 'node:test';
import assert from 'node:assert/strict';
import { options, h, render } from 'preact';
import { JSDOM } from 'jsdom';
import { scrubStep, useScrub } from '../feature/src/use-scrub';
import type { NativePlayer } from '@iptvnator/tv/data-access';

function setup() {
    const dom = new JSDOM('<div id="root"></div>');
    Object.assign(globalThis, {
        document: dom.window.document,
        window: dom.window,
        requestAnimationFrame: (f: () => void) => setTimeout(f, 0),
    });
    options.debounceRendering = (f) => f();
    const log: string[] = [];
    const fake = {
        video: { currentTime: 100, duration: 3600, paused: false },
        position: 100,
        seekTo: (s: number) => {
            log.push(`seek ${Math.round(s)}`);
            fake.position = s;
        },
        pause: () => {
            log.push('pause');
            fake.video.paused = true;
        },
        resume: () => {
            log.push('play');
            fake.video.paused = false;
        },
    };
    let scrub!: ReturnType<typeof useScrub>;
    const Probe = () => {
        scrub = useScrub(fake as unknown as NativePlayer);
        return null;
    };
    render(h(Probe, {}), dom.window.document.getElementById('root')!);
    // LG style: every repeat is a plain press, no repeat flag.
    const press = () =>
        scrub.keyDown({
            key: 'ArrowRight',
            keyCode: 39,
            repeat: false,
            preventDefault() {},
            stopPropagation() {},
        } as never);
    return { log, press, fake };
}

test('short press: pause, +10 s, one seek, play again', async () => {
    const { log, press } = setup();
    press();
    assert.deepEqual(log, ['pause']);
    await new Promise((r) => setTimeout(r, 750));
    assert.deepEqual(log, ['pause', 'seek 110', 'play']);
});

test('held key sent as separate presses accelerates, seeks once at the end', async () => {
    const { log, press } = setup();
    const realNow = Date.now;
    let now = realNow();
    Date.now = () => now;
    try {
        for (let i = 0; i < 40; i++) {
            press();
            now += 120; // ~8 presses per second for ~5 s
        }
    } finally {
        Date.now = realNow;
    }
    assert.deepEqual(log, ['pause'], 'no jump while held');
    await new Promise((r) => setTimeout(r, 750));
    assert.equal(log.length, 3);
    const moved = Number(log[1].split(' ')[1]) - 100;
    // 40 presses at a plain 10 s would be 400 s; accelerating goes far beyond.
    assert.ok(moved > 1000, `moved ${moved}s`);
    assert.equal(log[2], 'play');
});

test('step grows with hold time and is capped', () => {
    assert.equal(scrubStep(0.5, 3600), 10);
    assert.equal(scrubStep(2, 3600), 20);
    assert.equal(scrubStep(3, 3600), 40);
    assert.equal(scrubStep(10, 3600), 90);
});

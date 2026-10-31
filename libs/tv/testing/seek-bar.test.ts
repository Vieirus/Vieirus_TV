import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clock } from '../feature/src/seek-bar';

test('timeline clock format', () => {
    assert.equal(clock(0), '0:00');
    assert.equal(clock(247.9), '4:07');
    assert.equal(clock(3909), '1:05:09');
    assert.equal(clock(NaN), '0:00');
});

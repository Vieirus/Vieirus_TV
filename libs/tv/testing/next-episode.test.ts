import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextEpisode } from '../feature/src/use-next-episode';
import type { Media } from '@iptvnator/tv/util';

const ep = (id: string, season: number, episode: number) =>
    ({ id, kind: 'episode', season, episode }) as Media;

test('next episode follows season/episode order, across seasons', () => {
    const list = [ep('s2e1', 2, 1), ep('s1e2', 1, 2), ep('s1e1', 1, 1)];
    assert.equal(nextEpisode(list[2], list)?.id, 's1e2');
    assert.equal(nextEpisode(list[1], list)?.id, 's2e1');
    assert.equal(nextEpisode(list[0], list), undefined);
    // Current episode not in the list (other id): by number.
    assert.equal(nextEpisode(ep('other', 1, 1), list)?.id, 's1e2');
});

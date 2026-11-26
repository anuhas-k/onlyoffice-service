import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupVersions } from '../public/history-groups.js';

const v = (id, kind) => ({ id, kind });
// the API returns newest first
const list = (...items) => items.map(([id, kind]) => v(id, kind));

test('a milestone heads the checkpoints saved before it; the initial version stands alone', () => {
  const groups = groupVersions(list(['m1', 'milestone'], ['c2', 'checkpoint'], ['c1', 'checkpoint'], ['i', 'initial']));
  assert.deepEqual(groups.map((g) => [g.head?.id, g.checkpoints.map((c) => c.id), g.inProgress]), [
    ['m1', ['c2', 'c1'], false],
    ['i', [], false],
  ]);
});

test('checkpoints newer than the latest milestone form an in-progress group with no head', () => {
  const groups = groupVersions(list(['c4', 'checkpoint'], ['c3', 'checkpoint'], ['m1', 'milestone'], ['i', 'initial']));
  assert.deepEqual(groups.map((g) => [g.head?.id ?? null, g.checkpoints.map((c) => c.id), g.inProgress]), [
    [null, ['c4', 'c3'], true],
    ['m1', [], false],
    ['i', [], false],
  ]);
});

test('two sessions give two milestone groups, newest first, each owning only its own checkpoints', () => {
  const groups = groupVersions(list(['m2', 'milestone'], ['c3', 'checkpoint'], ['m1', 'milestone'], ['c1', 'checkpoint'], ['i', 'initial']));
  assert.deepEqual(groups.map((g) => [g.head.id, g.checkpoints.map((c) => c.id)]), [['m2', ['c3']], ['m1', ['c1']], ['i', []]]);
});

test('recovered and conflict versions head their own group like a milestone and are never swallowed', () => {
  const groups = groupVersions(list(['r', 'recovered'], ['c1', 'checkpoint'], ['x', 'conflict'], ['i', 'initial']));
  assert.deepEqual(groups.map((g) => [g.head.id, g.checkpoints.map((c) => c.id), g.inProgress]), [
    ['r', ['c1'], false],
    ['x', [], false],
    ['i', [], false],
  ]);
});

test('an empty list gives no groups', () => {
  assert.deepEqual(groupVersions([]), []);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffParagraphs, DiffError } from './text-diff.js';

const lines = (n, prefix = 'line') => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);

test('identical documents: nothing changed, one skip for the whole thing', () => {
  const out = diffParagraphs(['a', 'b', 'c'], ['a', 'b', 'c']);
  assert.deepEqual(out.stats, { added: 0, removed: 0, unchanged: 3 });
  assert.deepEqual(out.lines, [{ type: 'skip', count: 3 }]);
});

test('two empty documents give no lines at all', () => {
  assert.deepEqual(diffParagraphs([], []), { stats: { added: 0, removed: 0, unchanged: 0 }, lines: [] });
});

test('a changed paragraph is shown with two lines of context either side and the rest folded', () => {
  const from = lines(12);
  const to = [...from];
  to[5] = 'line 6 edited';
  const out = diffParagraphs(from, to);
  assert.deepEqual(out.stats, { added: 1, removed: 1, unchanged: 11 });
  assert.deepEqual(out.lines.map((l) => (l.type === 'skip' ? `skip ${l.count}` : `${l.type}: ${l.text}`)), [
    'skip 3', 'ctx: line 4', 'ctx: line 5', 'del: line 6', 'add: line 6 edited', 'ctx: line 7', 'ctx: line 8', 'skip 4',
  ]);
});

test('pure additions and pure removals', () => {
  const added = diffParagraphs(['a', 'c'], ['a', 'b', 'c']);
  assert.deepEqual(added.stats, { added: 1, removed: 0, unchanged: 2 });
  assert.deepEqual(added.lines.filter((l) => l.type === 'add').map((l) => l.text), ['b']);
  const removed = diffParagraphs(['a', 'b', 'c'], ['a', 'c']);
  assert.deepEqual(removed.stats, { added: 0, removed: 1, unchanged: 2 });
  assert.deepEqual(removed.lines.filter((l) => l.type === 'del').map((l) => l.text), ['b']);
});

test('against nothing (the initial version) every line is an addition; into nothing every line is a removal', () => {
  const first = diffParagraphs([], ['x', 'y']);
  assert.deepEqual(first.stats, { added: 2, removed: 0, unchanged: 0 });
  assert.ok(first.lines.every((l) => l.type === 'add'));
  const gone = diffParagraphs(['x', 'y'], []);
  assert.deepEqual(gone.stats, { added: 0, removed: 2, unchanged: 0 });
});

test('line numbers: deletions carry the old number, additions the new one, context both', () => {
  const out = diffParagraphs(['a', 'b', 'c'], ['a', 'B', 'c']);
  assert.deepEqual(out.lines.map((l) => [l.type, l.fromNo ?? null, l.toNo ?? null]), [
    ['ctx', 1, 1], ['del', 2, null], ['add', null, 2], ['ctx', 3, 3],
  ]);
});

test('a replaced paragraph marks only the changed words, and deletions come before additions', () => {
  const out = diffParagraphs(['The quick brown fox'], ['The slow brown fox']);
  const [del, add] = out.lines;
  assert.equal(del.type, 'del');
  assert.equal(add.type, 'add');
  assert.deepEqual(del.segments, [{ text: 'The ', changed: false }, { text: 'quick', changed: true }, { text: ' brown fox', changed: false }]);
  assert.deepEqual(add.segments, [{ text: 'The ', changed: false }, { text: 'slow', changed: true }, { text: ' brown fox', changed: false }]);
});

test('word marks join back to exactly the original text', () => {
  const out = diffParagraphs(['alpha  beta gamma delta'], ['alpha beta   gamma epsilon delta']);
  const [del, add] = out.lines;
  assert.equal(del.segments.map((s) => s.text).join(''), 'alpha  beta gamma delta');
  assert.equal(add.segments.map((s) => s.text).join(''), 'alpha beta   gamma epsilon delta');
});

test('unequal replace blocks: paired lines get word marks, the leftover line stays plain', () => {
  const out = diffParagraphs(['keep', 'one old', 'two old', 'end'], ['keep', 'one new', 'end']);
  const dels = out.lines.filter((l) => l.type === 'del');
  const adds = out.lines.filter((l) => l.type === 'add');
  assert.equal(dels.length, 2);
  assert.equal(adds.length, 1);
  assert.ok(dels[0].segments && adds[0].segments, 'first pair has segments');
  assert.equal(dels[1].segments, undefined);
});

test('a long document with one edit does not trip the size limit (common prefix and suffix are trimmed)', () => {
  const from = lines(20_000);
  const to = [...from];
  to[10_000] = 'changed';
  const out = diffParagraphs(from, to);
  assert.deepEqual(out.stats, { added: 1, removed: 1, unchanged: 19_999 });
});

test('two big documents that share nothing are refused with a DiffError instead of allocating a huge table', () => {
  assert.throws(() => diffParagraphs(lines(3000, 'old'), lines(3000, 'new')), (err) => err instanceof DiffError && err.code === 'TooLarge');
});

test('very long single paragraphs fall back to a whole-line mark instead of a word diff', () => {
  const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join(' ');
  const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join(' ');
  const [del, add] = diffParagraphs([a], [b]).lines;
  assert.equal(del.segments, undefined);
  assert.equal(add.segments, undefined);
});

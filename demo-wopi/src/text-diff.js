// Paragraph-level diff with word-level marks inside replaced paragraphs, shaped like a unified diff.
//
// Design note (BE-T): n, m = paragraph counts of the two versions (a long contract is a few thousand; unbounded in
// principle). Access pattern: ordered comparison of two sequences → longest common subsequence (LCS). After trimming
// the common prefix/suffix (an edit usually touches a small middle) the table is O(n·m) time and space, so it is capped
// at MAX_LINE_CELLS and refused beyond that rather than allocating without bound. Word marks run the same LCS on the
// tokens of ONE paired paragraph, capped at MAX_WORD_CELLS (past that the whole line is simply shown as changed).
// shortcut: quadratic LCS, not Myers O(ND), demo only — switch to Myers when documents of 3000+ unrelated paragraphs matter.

const CONTEXT_LINES = 2;
const MAX_LINE_CELLS = 4_000_000;
const MAX_WORD_CELLS = 250_000;

export class DiffError extends Error {
  /** @param {'TooLarge'} code */
  constructor(code, message) {
    super(message);
    this.name = 'DiffError';
    this.code = code;
  }
}

/** LCS edit script over two string arrays: [{op:'eq'|'del'|'add', i, j}], deletions before additions inside a changed block. */
function lcsOps(a, b) {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) ops.push({ op: 'eq', i: i++, j: j++ });
    else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) ops.push({ op: 'del', i: i++, j });
    else ops.push({ op: 'add', i, j: j++ });
  }
  while (i < n) ops.push({ op: 'del', i: i++, j });
  while (j < m) ops.push({ op: 'add', i, j: j++ });
  return ops;
}

const tokens = (text) => text.match(/\s+|\S+/g) ?? [];

function pushSegment(segments, text, changed) {
  const last = segments.at(-1);
  if (last && last.changed === changed) last.text += text;
  else segments.push({ text, changed });
}

/** Word-level marks for one replaced paragraph: {from: segments, to: segments}, or null when it is too big to be worth it. */
function wordSegments(fromText, toText) {
  const a = tokens(fromText);
  const b = tokens(toText);
  if (a.length * b.length > MAX_WORD_CELLS) return null;
  const from = [];
  const to = [];
  for (const { op, i, j } of lcsOps(a, b)) {
    if (op === 'eq') { pushSegment(from, a[i], false); pushSegment(to, b[j], false); }
    else if (op === 'del') pushSegment(from, a[i], true);
    else pushSegment(to, b[j], true);
  }
  return { from, to };
}

function commonPrefix(a, b) {
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  return k;
}

function commonSuffix(a, b, prefix) {
  let k = 0;
  while (k < a.length - prefix && k < b.length - prefix && a[a.length - 1 - k] === b[b.length - 1 - k]) k++;
  return k;
}

function editScript(from, to) {
  const prefix = commonPrefix(from, to);
  const suffix = commonSuffix(from, to, prefix);
  const middleFrom = from.slice(prefix, from.length - suffix);
  const middleTo = to.slice(prefix, to.length - suffix);
  if (middleFrom.length * middleTo.length > MAX_LINE_CELLS) throw new DiffError('TooLarge', 'The two versions differ too much to compare');
  const ops = [];
  for (let k = 0; k < prefix; k++) ops.push({ op: 'eq', i: k, j: k });
  for (const o of lcsOps(middleFrom, middleTo)) ops.push({ op: o.op, i: o.i + prefix, j: o.j + prefix });
  for (let k = suffix; k > 0; k--) ops.push({ op: 'eq', i: from.length - k, j: to.length - k });
  return ops;
}

function toLine(o, from, to) {
  if (o.op === 'eq') return { type: 'ctx', text: from[o.i], fromNo: o.i + 1, toNo: o.j + 1 };
  if (o.op === 'del') return { type: 'del', text: from[o.i], fromNo: o.i + 1 };
  return { type: 'add', text: to[o.j], toNo: o.j + 1 };
}

/** Pair the deletions and additions of each changed block index-wise and attach word-level marks. */
function markWords(lines) {
  let at = 0;
  while (at < lines.length) {
    if (lines[at].type === 'ctx') { at++; continue; }
    let end = at;
    while (end < lines.length && lines[end].type !== 'ctx') end++;
    const block = lines.slice(at, end);
    const dels = block.filter((l) => l.type === 'del');
    const adds = block.filter((l) => l.type === 'add');
    for (let k = 0; k < Math.min(dels.length, adds.length); k++) {
      const marks = wordSegments(dels[k].text, adds[k].text);
      if (marks) { dels[k].segments = marks.from; adds[k].segments = marks.to; }
    }
    at = end;
  }
}

/** Keep changed lines plus CONTEXT_LINES around them; fold every other run of unchanged lines into {type:'skip', count}. */
function foldContext(lines, context) {
  const keep = new Array(lines.length).fill(false);
  lines.forEach((line, index) => {
    if (line.type === 'ctx') return;
    for (let k = Math.max(0, index - context); k <= Math.min(lines.length - 1, index + context); k++) keep[k] = true;
  });
  const out = [];
  let skipped = 0;
  lines.forEach((line, index) => {
    if (keep[index]) {
      if (skipped > 0) { out.push({ type: 'skip', count: skipped }); skipped = 0; }
      out.push(line);
    } else {
      skipped++;
    }
  });
  if (skipped > 0) out.push({ type: 'skip', count: skipped });
  return out;
}

/**
 * @param {string[]} from paragraphs of the older version  @param {string[]} to paragraphs of the newer version
 * @returns {{stats: {added: number, removed: number, unchanged: number}, lines: object[]}}
 */
export function diffParagraphs(from, to, { context = CONTEXT_LINES } = {}) {
  const lines = editScript(from, to).map((o) => toLine(o, from, to));
  markWords(lines);
  const count = (type) => lines.filter((l) => l.type === type).length;
  return { stats: { added: count('add'), removed: count('del'), unchanged: count('ctx') }, lines: foldContext(lines, context) };
}

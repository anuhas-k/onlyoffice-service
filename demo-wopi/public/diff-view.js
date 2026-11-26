// Builds the "Changes" panel from the diff API response. Text only: every value goes through textContent, never innerHTML.
function span(className, text) {
  const el = document.createElement('span');
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

function renderText(line) {
  const holder = document.createElement('span');
  if (!line.segments) {
    holder.textContent = line.text === '' ? ' ' : line.text; // keep empty paragraphs visible
    return holder;
  }
  for (const part of line.segments) holder.append(part.changed ? span('diff-mark', part.text) : document.createTextNode(part.text));
  return holder;
}

function renderLine(line) {
  const row = document.createElement('div');
  if (line.type === 'skip') {
    row.className = 'diff-skip';
    row.textContent = `⋯ ${line.count} unchanged paragraph${line.count === 1 ? '' : 's'}`;
    return row;
  }
  row.className = `diff-line diff-${line.type}`;
  const sign = { add: '+', del: '−', ctx: ' ' }[line.type];
  row.append(span('diff-no', line.fromNo ?? ''), span('diff-no', line.toNo ?? ''), span('diff-sign', sign), renderText(line));
  return row;
}

export function renderDiff(diff) {
  document.getElementById('diff').hidden = false;
  const from = diff.from ? `${diff.from.kind} ${new Date(diff.from.createdAt).toLocaleString()}` : 'nothing (first version)';
  document.getElementById('diff-title').textContent = `${diff.to.kind} ${new Date(diff.to.createdAt).toLocaleString()} vs ${from}`;
  const { added, removed } = diff.stats;
  document.getElementById('diff-stats').textContent = added === 0 && removed === 0
    ? 'No text changes. Formatting-only changes are not shown.'
    : `+${added} added, −${removed} removed paragraph${added + removed === 1 ? '' : 's'}. Text only: formatting, images and table layout are not compared.`;
  document.getElementById('diff-body').replaceChildren(...diff.lines.map(renderLine));
}

export function showDiffError(message) {
  document.getElementById('diff').hidden = false;
  document.getElementById('diff-title').textContent = '';
  document.getElementById('diff-stats').textContent = message;
  document.getElementById('diff-body').replaceChildren();
}

export function hideDiff() {
  document.getElementById('diff').hidden = true;
}

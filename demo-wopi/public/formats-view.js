// "Supported file types" card: one row per format the Document Server can open, with a Create sample button where one exists.
// Text only: every value goes through textContent.
const KIND_TITLES = { word: 'Word processing', cell: 'Spreadsheets', slide: 'Presentations', pdf: 'PDF and page formats' };

function cell(child, className) {
  const td = document.createElement('td');
  if (child instanceof Node) td.append(child);
  else td.textContent = child;
  if (className) td.className = className;
  return td;
}

function offers(format) {
  if (format.dsActions === null) return cell('Document Server unreachable', 'muted');
  if (format.dsActions.length === 0) return cell('not offered', 'warn');
  const missingEdit = format.mode === 'edit' && !format.dsActions.includes('edit');
  return cell(format.dsActions.join(', ') + (missingEdit ? '  ⚠ no edit action' : ''), missingEdit ? 'warn' : '');
}

function row(format, onCreate) {
  const tr = document.createElement('tr');
  const ext = document.createElement('code');
  ext.textContent = `.${format.ext}`;
  tr.append(cell(ext), cell(format.label), cell(format.mode === 'edit' ? 'edit' : 'view only', `mode-${format.mode}`), offers(format));
  const action = document.createElement('td');
  if (format.sample) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Create sample';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await onCreate(format); } finally { button.disabled = false; }
    });
    action.append(button);
  } else {
    action.textContent = 'upload your own';
    action.className = 'muted';
  }
  tr.append(action);
  return tr;
}

export function renderFormats(data, onCreate) {
  const rows = [];
  let lastKind = null;
  for (const format of data.formats) {
    if (format.kind !== lastKind) {
      lastKind = format.kind;
      const head = document.createElement('tr');
      head.className = 'kind-row';
      const th = document.createElement('th');
      th.colSpan = 5;
      th.textContent = KIND_TITLES[format.kind] ?? format.kind;
      head.append(th);
      rows.push(head);
    }
    rows.push(row(format, onCreate));
  }
  document.getElementById('formats').replaceChildren(...rows);
  const editable = data.formats.filter((f) => f.mode === 'edit').length;
  const withSample = data.formats.filter((f) => f.sample).length;
  document.getElementById('formats-summary').textContent =
    `${data.formats.length} types · ${editable} editable · ${withSample} with a sample · Document Server ${data.dsReachable ? 'reachable' : 'NOT reachable (the "offers" column is unknown)'}`;
}

/** Comma-separated list for the file picker's accept attribute. */
export const acceptList = (data) => data.formats.map((f) => `.${f.ext}`).join(',');

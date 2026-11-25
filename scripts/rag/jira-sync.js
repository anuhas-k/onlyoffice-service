#!/usr/bin/env node
/**
 * ASTRA — Jira Bug Sync
 * Reads qa/bugs.json → creates/updates Jira tickets
 * Pure Node.js — no external dependencies.
 *
 * Usage:
 *   node scripts/rag/jira-sync.js                    # sync all bugs
 *   node scripts/rag/jira-sync.js --bug BUG-001      # sync one bug
 *   node scripts/rag/jira-sync.js --export            # export CSV for bulk import
 *   node scripts/rag/jira-sync.js --dry-run           # show what would be created
 *
 * Env vars (in .env or .env.test):
 *   JIRA_HOST=yourteam.atlassian.net
 *   JIRA_EMAIL=you@company.com
 *   JIRA_TOKEN=your-api-token
 *   JIRA_PROJECT=PROJ
 *   JIRA_SPRINT=SCRUM Sprint 0    (optional)
 *   JIRA_TEAM=                     (optional)
 *
 * Standalone — works without dashboard.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── Config ───
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const BUGS_FILE = path.join(PROJECT_DIR, 'qa', 'bugs.json');
const ENV_FILE = path.join(PROJECT_DIR, '.env');
const ENV_TEST = path.join(PROJECT_DIR, '.env.test');

// ─── Load env ───
function loadEnv() {
  const env = {};
  for (const f of [ENV_FILE, ENV_TEST]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return { ...process.env, ...env };
}

const env = loadEnv();
const JIRA_HOST = env.JIRA_HOST || '';
const JIRA_EMAIL = env.JIRA_EMAIL || '';
const JIRA_TOKEN = env.JIRA_TOKEN || '';
const JIRA_PROJECT = env.JIRA_PROJECT || '';
const JIRA_SPRINT = env.JIRA_SPRINT || '';
const JIRA_TEAM = env.JIRA_TEAM || '';

// ─── Severity → Jira Priority ───
const PRIORITY_MAP = {
  'S1': { name: 'Highest', id: '1' },
  'S2': { name: 'High', id: '2' },
  'S3': { name: 'Medium', id: '3' },
  'S4': { name: 'Low', id: '4' },
};

// ─── Severity → Due date offset (days from now) ───
const DUE_DATE_MAP = {
  'S1': 1,   // fix today
  'S2': 3,   // fix this sprint
  'S3': 7,   // fix next sprint
  'S4': 14,  // backlog
};

// ─── Severity → Story points estimate ───
const STORY_POINTS_MAP = {
  'S1': 5,
  'S2': 3,
  'S3': 2,
  'S4': 1,
};

// ─── v7.9.1 (PROJECT B retro I-5): per-instance field-ID map ───────────────
// Custom field IDs differ across Jira instances. Hardcoding customfield_10015
// (Start date) and customfield_10016 (Story points) only worked on PROJECT B —
// every other tenant fails silently. We now resolve them dynamically:
//   1. Look up ~/.astra/jira-fields-<host>.json (built by jira-createmeta-probe.sh)
//   2. Map a human field name → the local custom-field ID
//   3. Skip fields the probe marked "unsettable" (e.g. reporter)
// Cached per host so we only probe once per session.
const path_mod = require('path');
const os = require('os');
const { execSync } = require('child_process');

function jiraFieldMapCachePath() {
  const safe = String(JIRA_HOST).replace(/[^A-Za-z0-9._-]/g, '_');
  return path_mod.join(os.homedir(), '.astra', `jira-fields-${safe}.json`);
}

let _FIELD_MAP = null;
function loadFieldMap() {
  if (_FIELD_MAP !== null) return _FIELD_MAP;
  const cache = jiraFieldMapCachePath();
  try {
    if (fs.existsSync(cache)) {
      const stat = fs.statSync(cache);
      const ageHr = (Date.now() - stat.mtimeMs) / 3600_000;
      if (ageHr < 24) {
        _FIELD_MAP = JSON.parse(fs.readFileSync(cache, 'utf8'));
        return _FIELD_MAP;
      }
    }
    // Refresh via the probe (idempotent; probe also caches under .astra/)
    if (JIRA_PROJECT) {
      const probe = path_mod.join(os.homedir(), '.claude', 'skills', 'astra', 'scripts', 'jira-createmeta-probe.sh');
      if (fs.existsSync(probe)) {
        const out = execSync(`bash ${probe} ${JIRA_PROJECT} Bug 2>/dev/null`, { cwd: PROJECT_DIR, encoding: 'utf8' });
        try {
          const parsed = JSON.parse(out);
          fs.mkdirSync(path_mod.dirname(cache), { recursive: true });
          fs.writeFileSync(cache, JSON.stringify(parsed, null, 2));
          fs.chmodSync(cache, 0o600);
          _FIELD_MAP = parsed;
          return _FIELD_MAP;
        } catch { /* fall through */ }
      }
    }
  } catch { /* fall through */ }
  _FIELD_MAP = { settable: [], unsettable: [], field_names: {}, _source: 'unavailable' };
  return _FIELD_MAP;
}

// Map a human Jira field name → the customfield_XXXXX ID on THIS instance.
// Returns null if not found (caller should skip rather than guess).
function fieldId(humanName) {
  const map = loadFieldMap();
  if (!map.field_names) return null;
  const lower = humanName.toLowerCase();
  for (const [fid, name] of Object.entries(map.field_names)) {
    if (String(name).toLowerCase() === lower) return fid;
  }
  return null;
}

// Is a field settable on this instance's create screen?
function isSettable(fieldId) {
  const map = loadFieldMap();
  if (!map.settable || map.settable.length === 0) return true; // unknown → try
  return map.settable.includes(fieldId);
}

// ─── Jira API ───
function jiraRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: JIRA_HOST,
      path: `/rest/api/3${path}`,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }); }
        catch { resolve({ status: res.statusCode, body: body }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ─── Build Jira issue payload ───
function buildIssuePayload(bug) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (DUE_DATE_MAP[bug.severity] || 7));

  const payload = {
    fields: {
      project: { key: JIRA_PROJECT },
      summary: `[${bug.id}] ${bug.title}`,
      description: {
        type: 'doc',
        version: 1,
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: `Severity: ${bug.severity}` }] },
          { type: 'paragraph', content: [{ type: 'text', text: `Endpoint: ${bug.endpoint || 'N/A'}` }] },
          { type: 'paragraph', content: [{ type: 'text', text: `Test Case: ${bug.tc_id || 'N/A'}` }] },
          { type: 'paragraph', content: [{ type: 'text', text: `Steps: ${bug.steps || 'See BUG_REPORT.md'}` }] },
          { type: 'paragraph', content: [{ type: 'text', text: `Expected: ${bug.expected || 'N/A'}` }] },
          { type: 'paragraph', content: [{ type: 'text', text: `Actual: ${bug.actual || 'N/A'}` }] },
        ],
      },
      issuetype: { name: 'Bug' },
      priority: PRIORITY_MAP[bug.severity] || PRIORITY_MAP['S3'],
      duedate: dueDate.toISOString().split('T')[0],
    },
  };

  // v7.9.1 (PROJECT B retro I-5): dynamic custom-field IDs per instance.
  // The probe (jira-createmeta-probe.sh) populates ~/.astra/jira-fields-<host>.json
  // so we can map human names → instance-specific customfield IDs without
  // hardcoding the PROJECT B ones (10015, 10016) that fail on every other tenant.
  const startDateId = fieldId('Start date');
  if (startDateId && isSettable(startDateId)) {
    payload.fields[startDateId] = bug.reported || new Date().toISOString().split('T')[0];
  }
  const storyPointsId = fieldId('Story point estimate') || fieldId('Story Points');
  if (storyPointsId && isSettable(storyPointsId)) {
    payload.fields[storyPointsId] = STORY_POINTS_MAP[bug.severity] || 2;
  }
  const teamId = fieldId('Team');
  if (teamId && isSettable(teamId) && JIRA_TEAM) {
    payload.fields[teamId] = JIRA_TEAM;
  }
  const startTimeId = fieldId('Start time');
  if (startTimeId && isSettable(startTimeId) && bug.reported) {
    payload.fields[startTimeId] = `${bug.reported}T09:00:00.000Z`;
  }
  const dueTimeId = fieldId('Due time');
  if (dueTimeId && isSettable(dueTimeId)) {
    payload.fields[dueTimeId] = `${dueDate.toISOString().split('T')[0]}T17:00:00.000Z`;
  }

  // Assignee
  if (bug.assignee_email) {
    payload.fields.assignee = { accountId: bug.assignee_email };
  }

  // Labels
  if (bug.labels && bug.labels.length > 0) {
    payload.fields.labels = bug.labels;
  } else {
    payload.fields.labels = ['qa-automation', bug.severity.toLowerCase()];
  }

  return payload;
}

// ─── Sync one bug ───
async function syncBug(bug, dryRun = false) {
  if (bug.jira_key) {
    // Update existing ticket
    if (bug.status === 'VERIFIED') {
      console.log(`  ${bug.id} → ${bug.jira_key} → transition to Done`);
      if (!dryRun) {
        // Transition to Done (transition ID varies — common: 31, 41)
        await jiraRequest('POST', `/issue/${bug.jira_key}/transitions`, {
          transition: { id: '31' }
        });
      }
    } else if (bug.status === 'FIXED') {
      console.log(`  ${bug.id} → ${bug.jira_key} → transition to Fix Ready`);
      if (!dryRun) {
        await jiraRequest('POST', `/issue/${bug.jira_key}/transitions`, {
          transition: { id: '21' }
        });
      }
    }
    return bug.jira_key;
  }

  // Create new ticket
  const payload = buildIssuePayload(bug);
  console.log(`  ${bug.id} → CREATE: [${bug.severity}] ${bug.title}`);

  if (dryRun) {
    console.log(`    Priority: ${PRIORITY_MAP[bug.severity]?.name}`);
    console.log(`    Due: ${payload.fields.duedate}`);
    console.log(`    Assignee: ${bug.assignee || 'unassigned'}`);
    console.log(`    Reporter: ${bug.reporter}`);
    return null;
  }

  const res = await jiraRequest('POST', '/issue', payload);
  if (res.status === 201) {
    const key = res.body.key;
    console.log(`    Created: ${key}`);
    return key;
  } else {
    console.log(`    FAILED (${res.status}): ${JSON.stringify(res.body)}`);
    return null;
  }
}

// ─── Export CSV ───
function exportCSV(bugs) {
  const header = 'Summary,Issue Type,Priority,Reporter,Assignee,Due Date,Labels,Description,Story Points';
  const rows = bugs.map(b => {
    const due = new Date();
    due.setDate(due.getDate() + (DUE_DATE_MAP[b.severity] || 7));
    return [
      `"[${b.id}] ${b.title}"`,
      'Bug',
      PRIORITY_MAP[b.severity]?.name || 'Medium',
      b.reporter || '',
      b.assignee || '',
      due.toISOString().split('T')[0],
      `"qa-automation,${b.severity.toLowerCase()}"`,
      `"${(b.steps || '').replace(/"/g, '""')}"`,
      STORY_POINTS_MAP[b.severity] || 2,
    ].join(',');
  });

  const csv = [header, ...rows].join('\n');
  const outPath = path.join(PROJECT_DIR, 'qa', 'jira-import.csv');
  fs.writeFileSync(outPath, csv);
  console.log(`Exported ${bugs.length} bugs to ${outPath}`);
  console.log('Import at: https://' + JIRA_HOST + '/secure/BulkCreateSetupPage!default.jspa');
}

// ─── Main ───
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const exportMode = args.includes('--export');
  const bugFilter = args.includes('--bug') ? args[args.indexOf('--bug') + 1] : null;

  // Load bugs
  if (!fs.existsSync(BUGS_FILE)) {
    console.log('No qa/bugs.json found. Run tests first to generate bugs.');
    process.exit(0);
  }

  const data = JSON.parse(fs.readFileSync(BUGS_FILE, 'utf-8'));
  let bugs = data.bugs || [];

  if (bugFilter) {
    bugs = bugs.filter(b => b.id === bugFilter);
    if (bugs.length === 0) { console.log(`Bug ${bugFilter} not found.`); process.exit(1); }
  }

  // Export mode
  if (exportMode) {
    exportCSV(bugs);
    return;
  }

  // Check Jira credentials
  if (!JIRA_HOST || !JIRA_EMAIL || !JIRA_TOKEN || !JIRA_PROJECT) {
    console.log('\nJira credentials not configured. Set in .env:');
    console.log('  JIRA_HOST=yourteam.atlassian.net');
    console.log('  JIRA_EMAIL=you@company.com');
    console.log('  JIRA_TOKEN=your-api-token');
    console.log('  JIRA_PROJECT=PROJ');
    console.log('\nOr use --export for CSV bulk import.');
    process.exit(1);
  }

  console.log(`\nJira Sync — ${bugs.length} bug(s)${dryRun ? ' (DRY RUN)' : ''}\n`);

  // Sync each bug
  for (const bug of bugs) {
    const key = await syncBug(bug, dryRun);
    if (key && !bug.jira_key) {
      bug.jira_key = key;
    }
  }

  // Write back with Jira keys
  if (!dryRun) {
    fs.writeFileSync(BUGS_FILE, JSON.stringify(data, null, 2));
    console.log(`\nbugs.json updated with Jira keys.`);
  }

  console.log('Done.');
}

main().catch(err => { console.error(err.message); process.exit(1); });

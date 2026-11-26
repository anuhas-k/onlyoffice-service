#!/usr/bin/env bash
# Show what the Document Server did to this app, newest last: WOPI calls, close/leave/heartbeat calls and version history.
# usage: ./trace.sh [since]   (default: 10m)   — list-page polling is filtered out; query strings (tokens) are never logged.
set -euo pipefail
cd "$(dirname "$0")"
docker compose logs app --no-log-prefix --since "${1:-10m}" 2>&1 | python3 -c "
import sys, json, datetime
reqs = {}
for line in sys.stdin:
    try: d = json.loads(line)
    except ValueError: continue
    if 'req' in d: reqs[d['reqId']] = d['req']
    t = datetime.datetime.fromtimestamp(d['time'] / 1000).strftime('%H:%M:%S') if 'time' in d else '        '
    if 'res' in d:
        q = reqs.get(d['reqId'], {})
        u = q.get('url', '')
        if u in ('/files', '/healthz') or u.endswith(('.css', '.js', '.ico', '.html')) or u == '/': continue
        print(t, q.get('method', ''), u.replace('/wopi/files/', 'wopi:').replace('/wopi-sessions/', 'session:'), d['res']['statusCode'])
    elif d.get('level', 30) >= 40 or 'close:' in d.get('msg', '') or 'wopi proof' in d.get('msg', ''):
        print(t, 'LOG', d.get('msg'), {k: v for k, v in d.items() if k in ('reason', 'command', 'fileId')})
"
echo "--- versions"
docker compose exec -T app sh -c 'cat /data/meta.json' | python3 -c "
import sys, json
for f in json.load(sys.stdin)['files'].values():
    print(f['name'])
    for v in f['versions']: print('   ', v['kind'].ljust(10), v['createdAt'], v['participants'])
"

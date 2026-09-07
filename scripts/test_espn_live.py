#!/usr/bin/env python3
import json
import sys
import threading
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import espn_live_server as bridge

root = Path(__file__).resolve().parents[1]
fixtures = json.loads((root / "tests/fixtures/espn_payloads.json").read_text())
pre = bridge.normalize_draft_payload(fixtures["preDraft"])
assert pre["picks"] == [], pre

directory = {}
bridge.collect_player_directory(fixtures["directoryInitial"], directory)
normalized = bridge.normalize_draft_payload(fixtures["draftDetailOnly"], "4", directory)
assert [p["overall"] for p in normalized["picks"]] == [1, 2]
assert normalized["picks"][0]["name"] == "Jahmyr Gibbs"
assert normalized["picks"][0]["position"] == "RB"
assert normalized["picks"][0]["proTeamId"] == 8
assert normalized["picks"][0]["draftedByConfiguredTeam"] is True
assert normalized["picks"][1]["name"] is None

old_config = bridge.config
old_fetch = bridge.fetch_json
old_directory = bridge._player_directory
old_misses = bridge._directory_miss_attempted
calls = []
bridge.config = lambda: {'league_id': '123', 'season': '2026', 's2': 'dummy', 'swid': 'dummy', 'team_id': '4', 'port': '0'}
bridge._player_directory = None
bridge._directory_miss_attempted = set()
def fake_fetch(url, cfg):
    calls.append(url)
    if 'mDraftDetail' in url:
        return 200, fixtures['draftDetailOnly']
    if len([x for x in calls if 'kona_player_info' in x]) == 1:
        return 200, fixtures['directoryInitial']
    return 200, fixtures['directoryRefresh']
bridge.fetch_json = fake_fetch
status, result = bridge.draft_response()
assert status == 200
assert result['picks'][1]['name'] == 'Mystery Player'
assert result['picks'][1]['position'] == 'WR'
assert len([x for x in calls if 'kona_player_info' in x]) == 2, calls
bridge.config = old_config
bridge.fetch_json = old_fetch
bridge._player_directory = old_directory
bridge._directory_miss_attempted = old_misses

created_env = root / 'server/.env'
if not created_env.exists():
    created_env.write_text('ESPN_S2=dummy\nSWID=dummy\n', encoding='utf-8')
    remove_env = True
else:
    remove_env = False
server = bridge.ThreadingHTTPServer(('127.0.0.1', 0), bridge.Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
base = f'http://127.0.0.1:{server.server_port}'
def get(path):
    try:
        with urlopen(base + path, timeout=2) as response:
            return response.status, response.read().decode('utf-8')
    except HTTPError as exc:
        return exc.code, exc.read().decode('utf-8')
assert get('/')[0] == 200
assert 'FantasySavior' in get('/')[1]
assert get('/app.js')[0] == 200
assert get('/data/players.data.js')[0] == 200
for blocked in ['/server/.env', '/.git/config', '/scripts/espn_probe.py', '/../server/.env', '/docs/ARCHITECTURE.md']:
    assert get(blocked)[0] == 404, blocked
server.shutdown()
server.server_close()
thread.join(timeout=2)
if remove_env:
    created_env.unlink()
print('ESPN bridge fixture and static-serving tests passed.')

#!/usr/bin/env python3
"""Local, read-only ESPN bridge for FantasySavior.

The bridge serves the static app and exposes only a sanitized draft payload. ESPN
cookies are read from server/.env or the process environment and are never sent
back to the browser or written to logs.
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = Path(__file__).resolve().with_name('.env')
DEFAULT_PORT = 8787
POSITION_BY_ID = {1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 16: 'DST', 17: 'K'}
PLAYER_ID_KEYS = ('playerId', 'playerID', 'id')
OVERALL_KEYS = ('overallPickNumber', 'overall', 'pickNumber', 'overallPick')

_last_completed_count: int | None = None
_live_change_observed = False


def read_env_file(path: Path = ENV_PATH) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        value = value.strip().strip('"').strip("'")
        values[key.strip()] = value
    return values


def config() -> dict[str, str]:
    local = read_env_file()
    def get(name: str, default: str = '') -> str:
        return os.environ.get(name, local.get(name, default)).strip()
    return {
        'league_id': get('ESPN_LEAGUE_ID'),
        'season': get('ESPN_SEASON', '2026'),
        's2': get('ESPN_S2'),
        'swid': get('ESPN_SWID'),
        'team_id': get('ESPN_TEAM_ID'),
        'port': get('PORT', str(DEFAULT_PORT)),
    }


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def configured(cfg: dict[str, str]) -> bool:
    return bool(cfg['league_id'] and cfg['season'] and cfg['s2'] and cfg['swid'])


def endpoint(cfg: dict[str, str], view: str = 'mDraftDetail') -> str:
    return (
        'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/'
        f"seasons/{cfg['season']}/segments/0/leagues/{cfg['league_id']}?view={view}"
    )


def fetch_json(url: str, cfg: dict[str, str]) -> tuple[int, Any]:
    cookie = f"espn_s2={cfg['s2']}; SWID={cfg['swid']}"
    request = Request(url, headers={
        'Accept': 'application/json',
        'User-Agent': 'FantasySavior-local-read-only-bridge/1.0',
        'Cookie': cookie,
    }, method='GET')
    with urlopen(request, timeout=8) as response:
        body = response.read()
        return int(response.status), json.loads(body.decode('utf-8'))


def as_int(value: Any) -> int | None:
    try:
        number = int(value)
        return number
    except (TypeError, ValueError):
        return None


def first_value(record: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in record and record[key] is not None:
            return record[key]
    return None


def position_from(value: Any) -> str | None:
    if isinstance(value, str):
        value = value.upper().strip()
        return value if value in {'QB', 'RB', 'WR', 'TE', 'DST', 'K'} else None
    numeric = as_int(value)
    return POSITION_BY_ID.get(numeric)


def player_name(record: dict[str, Any]) -> str | None:
    for key in ('name', 'fullName', 'playerName', 'displayName'):
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    player = record.get('player')
    if isinstance(player, dict):
        return player_name(player)
    return None


def player_position(record: dict[str, Any]) -> str | None:
    for key in ('position', 'defaultPosition', 'defaultPositionId', 'positionId', 'lineupSlotId'):
        if key in record:
            found = position_from(record[key])
            if found:
                return found
    player = record.get('player')
    if isinstance(player, dict):
        return player_position(player)
    return None


def collect_player_directory(node: Any, result: dict[int, dict[str, Any]]) -> None:
    if isinstance(node, list):
        for item in node:
            collect_player_directory(item, result)
        return
    if not isinstance(node, dict):
        return
    pid = as_int(first_value(node, PLAYER_ID_KEYS))
    name = player_name(node)
    if pid is not None and pid > 0 and (name or player_position(node)):
        result[pid] = {'name': name, 'position': player_position(node)}
    for value in node.values():
        if isinstance(value, (dict, list)):
            collect_player_directory(value, result)


def pick_rows(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    detail = payload.get('draftDetail')
    if not isinstance(detail, dict):
        detail = payload
    for key in ('drafted', 'picks', 'draftPicks', 'draftSlots'):
        rows = detail.get(key)
        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, dict)]
    return []


def normalize_draft_payload(payload: Any, team_id: str = '') -> dict[str, Any]:
    directory: dict[int, dict[str, Any]] = {}
    collect_player_directory(payload, directory)
    normalized: list[dict[str, Any]] = []
    for row in pick_rows(payload):
        overall = as_int(first_value(row, OVERALL_KEYS))
        player_id = as_int(first_value(row, PLAYER_ID_KEYS))
        if overall is None or player_id is None or player_id <= 0:
            continue
        player = directory.get(player_id, {})
        position = player_position(row) or player.get('position')
        name = player_name(row) or player.get('name')
        team = first_value(row, ('teamId', 'teamID', 'draftedByTeamId'))
        item: dict[str, Any] = {
            'overall': overall,
            'round': as_int(first_value(row, ('roundId', 'round', 'roundNumber'))),
            'roundPick': as_int(first_value(row, ('roundPickNumber', 'roundPick'))),
            'teamId': as_int(team) if as_int(team) is not None else team,
            'espnPlayerId': player_id,
            'name': name,
            'position': position,
        }
        if team_id and str(team) == str(team_id):
            item['draftedByConfiguredTeam'] = True
        normalized.append(item)
    normalized.sort(key=lambda item: item['overall'])
    return {
        'picks': normalized,
        'drafted': bool(normalized),
        'inProgress': bool((payload.get('draftDetail') or {}).get('inProgress', payload.get('inProgress', False))) if isinstance(payload, dict) else False,
        'rawPickCount': len(pick_rows(payload)),
    }


def capability_update(completed_count: int) -> dict[str, Any]:
    global _last_completed_count, _live_change_observed
    if _last_completed_count is not None and completed_count > _last_completed_count:
        _live_change_observed = True
    _last_completed_count = completed_count
    return {
        'mDraftDetail': 'observed-live-change' if _live_change_observed else 'unverified',
        'liveChangeObserved': _live_change_observed,
        'completedPickCount': completed_count,
    }


def safe_error(code: str, message: str, status: int = 503) -> tuple[int, dict[str, Any]]:
    return status, {'ok': False, 'code': code, 'message': message, 'fetchedAt': now_iso()}


def draft_response() -> tuple[int, dict[str, Any]]:
    cfg = config()
    if not configured(cfg):
        return safe_error('not-configured', 'ESPN bridge is not configured; manual mode is available.')
    try:
        status, payload = fetch_json(endpoint(cfg), cfg)
    except HTTPError as exc:
        if exc.code in (401, 403):
            return safe_error('auth-failed', 'ESPN authentication failed; manual mode is available.', exc.code)
        return safe_error('espn-http-error', f'ESPN returned HTTP {exc.code}.')
    except (URLError, TimeoutError, OSError, json.JSONDecodeError):
        return safe_error('network-error', 'ESPN could not be reached; retrying is safe.')
    normalized = normalize_draft_payload(payload, cfg['team_id'])
    cap = capability_update(len(normalized['picks']))
    return 200, {
        'ok': True,
        'fetchedAt': now_iso(),
        'inProgress': normalized['inProgress'],
        'drafted': normalized['drafted'],
        'picks': normalized['picks'],
        'capability': cap,
        'season': as_int(cfg['season']),
        'leagueId': cfg['league_id'],
        'teamIdConfigured': bool(cfg['team_id']),
        'warnings': [] if normalized['picks'] else ['No completed ESPN picks observed yet.'],
    }


class Handler(BaseHTTPRequestHandler):
    server_version = 'FantasySaviorESPNBridge/1.0'

    def log_message(self, fmt: str, *args: Any) -> None:
        # Never log query strings, headers, or response bodies: they can contain secrets.
        sys.stderr.write('[FantasySavior] ' + (fmt % args) + '\n')

    def send_json(self, status: int, value: dict[str, Any]) -> None:
        body = json.dumps(value, separators=(',', ':')).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == '/api/health':
            cfg = config()
            self.send_json(200, {
                'ok': True,
                'espnConfigured': configured(cfg),
                'season': as_int(cfg['season']),
                'leagueId': cfg['league_id'] or None,
                'liveCapability': 'observed' if _live_change_observed else 'unverified',
            })
            return
        if path == '/api/espn/draft':
            status, value = draft_response()
            self.send_json(status, value)
            return
        self.serve_static(path)

    def serve_static(self, path: str) -> None:
        relative = path.lstrip('/') or 'index.html'
        candidate = (ROOT / relative).resolve()
        if ROOT not in candidate.parents and candidate != ROOT:
            self.send_error(404)
            return
        if not candidate.is_file():
            self.send_error(404)
            return
        content_type = 'text/plain; charset=utf-8'
        if candidate.suffix == '.html': content_type = 'text/html; charset=utf-8'
        elif candidate.suffix == '.js': content_type = 'application/javascript; charset=utf-8'
        elif candidate.suffix == '.css': content_type = 'text/css; charset=utf-8'
        elif candidate.suffix == '.json': content_type = 'application/json; charset=utf-8'
        body = candidate.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    cfg = config()
    port = as_int(cfg['port']) or DEFAULT_PORT
    server = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    print(f'FantasySavior bridge serving on http://0.0.0.0:{port}/')
    print('ESPN credentials configured:', configured(cfg))
    server.serve_forever()


if __name__ == '__main__':
    main()

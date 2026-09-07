#!/usr/bin/env python3
"""Sanitized one-shot ESPN capability probe for the local bridge."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import espn_live_server as bridge


def main() -> int:
    status, result = bridge.draft_response()
    print(json.dumps({
        'httpStatus': status,
        'ok': result.get('ok', False),
        'code': result.get('code'),
        'inProgress': result.get('inProgress'),
        'drafted': result.get('drafted'),
        'completedPickCount': len(result.get('picks', [])),
        'capability': result.get('capability'),
        'warnings': result.get('warnings', []),
    }, indent=2, sort_keys=True))
    return 0 if status < 400 else 1

if __name__ == '__main__':
    raise SystemExit(main())

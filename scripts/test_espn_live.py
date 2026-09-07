#!/usr/bin/env python3
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import espn_live_server as bridge

fixtures = json.loads((Path(__file__).resolve().parents[1] / "tests/fixtures/espn_payloads.json").read_text())
pre = bridge.normalize_draft_payload(fixtures["preDraft"])
assert pre["picks"] == [], pre
completed = bridge.normalize_draft_payload(fixtures["completed"], "4")
assert [p["overall"] for p in completed["picks"]] == [1, 2]
assert completed["picks"][0]["name"] == "Jahmyr Gibbs"
assert completed["picks"][0]["position"] == "RB"
assert completed["picks"][0]["draftedByConfiguredTeam"] is True
assert completed["picks"][1]["name"] == "Mystery Player"
assert completed["picks"][1]["position"] == "WR"
print("ESPN bridge fixture tests passed.")

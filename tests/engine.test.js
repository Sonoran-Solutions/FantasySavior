/* FantasySavior engine tests (Node). Run: node tests/engine.test.js */
"use strict";

const assert = require("assert");
const path = require("path");
const FS = require(path.join(__dirname, "..", "engine.js"));
const data = require(path.join(__dirname, "..", "data", "players.json"));

const players = data.players.slice().sort((a, b) => a.rank - b.rank);

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok  " + name);
  } catch (e) {
    console.error("FAIL  " + name);
    console.error(e && e.message ? e.message : e);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
console.log("Snake-draft math");

const expected = {
  1: [1, 16, 17, 32, 33, 48, 49, 64, 65, 80, 81, 96, 97, 112, 113, 128],
  4: [4, 13, 20, 29, 36, 45, 52, 61, 68, 77, 84, 93, 100, 109, 116, 125],
  5: [5, 12, 21, 28, 37, 44, 53, 60, 69, 76, 85, 92, 101, 108, 117, 124],
  8: [8, 9, 24, 25, 40, 41, 56, 57, 72, 73, 88, 89, 104, 105, 120, 121]
};

for (const slot of ["1", "4", "5", "8"]) {
  test("slot " + slot + " full schedule", function () {
    const s = Number(slot);
    const schedule = FS.myPickSchedule(FS.LEAGUE.teams, s, FS.LEAGUE.totalRounds);
    assert.strictEqual(schedule.length, 16, "schedule length");
    assert.deepStrictEqual(schedule, expected[slot], "schedule values");
  });
}

test("round calculation", function () {
  assert.strictEqual(FS.currentRound(8, 1), 1);
  assert.strictEqual(FS.currentRound(8, 8), 1);
  assert.strictEqual(FS.currentRound(8, 9), 2);
  assert.strictEqual(FS.currentRound(8, 128), 16);
});

test("next user pick", function () {
  const sched = FS.myPickSchedule(8, 6, 16);
  assert.strictEqual(FS.nextUserPick(sched, 1), 6);
  assert.strictEqual(FS.nextUserPick(sched, 7), 11);
  assert.strictEqual(FS.nextUserPick(sched, 123), 123);
  assert.strictEqual(FS.nextUserPick(sched, 128), null);
  assert.strictEqual(FS.picksUntilNextUserPick(sched, 1), 5);
});

// ---------------------------------------------------------------------------
console.log("Draft state");

test("applyPick advances pick and records player", function () {
  let s = FS.createInitialState(3);
  const r = FS.applyPick(s, players[0].id, false);
  assert.ok(r.ok);
  s = r.state;
  assert.strictEqual(s.currentOverallPick, 2);
  assert.strictEqual(s.picks.length, 1);
  assert.strictEqual(s.picks[0].playerId, players[0].id);
  assert.strictEqual(s.picks[0].draftedByMe, false);
});

test("applyPick rejects duplicate", function () {
  let s = FS.createInitialState(3);
  s = FS.applyPick(s, players[0].id, false).state;
  const r = FS.applyPick(s, players[0].id, false);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "already-drafted");
});

test("draftedByMe records roster", function () {
  let s = FS.createInitialState(3);
  s = FS.applyPick(s, players[0].id, true).state;
  assert.deepStrictEqual(FS.myPlayerIds(s), [players[0].id]);
});

test("undo reverses exactly", function () {
  let s = FS.createInitialState(3);
  s = FS.applyPick(s, players[0].id, false).state;
  s = FS.applyPick(s, players[1].id, true).state;
  const before = { pick: s.currentOverallPick, picks: JSON.parse(JSON.stringify(s.picks)) };

  const u = FS.undo(s);
  assert.ok(u.ok);
  assert.strictEqual(u.state.currentOverallPick, before.pick - 1);
  assert.strictEqual(u.state.picks.length, before.picks.length - 1);

  const u2 = FS.undo(u.state);
  assert.ok(u2.ok);
  assert.strictEqual(u2.state.picks.length, 0);
  assert.strictEqual(u2.state.currentOverallPick, 1);

  const u3 = FS.undo(u2.state);
  assert.strictEqual(u3.ok, false);
});

// ---------------------------------------------------------------------------
console.log("Recommendation engine");

test("recommend excludes drafted players", function () {
  let s = FS.createInitialState(4);
  const draftedId = players[0].id;
  s = FS.applyPick(s, draftedId, true).state;
  const rec = FS.recommend(players, s);
  const ids = rec.ranked.map((x) => x.player.id);
  assert.ok(!ids.includes(draftedId), "drafted player should be absent");
});

test("K/DST suppressed early", function () {
  const s = FS.createInitialState(1);
  const rec = FS.recommend(players, s);
  assert.ok(rec.top, "top exists");
  assert.ok(["K", "DST"].indexOf(rec.top.player.position) === -1, "top is not K/DST");
  const top10 = rec.ranked.slice(0, 10);
  const bad = top10.filter((x) => x.player.position === "K" || x.player.position === "DST");
  assert.strictEqual(bad.length, 0, "no K/DST in top 10 early");
});

test("DST becomes recommended at round 15 when empty", function () {
  const s = simulateToPick(113);
  const rec = FS.recommend(players, s);
  assert.strictEqual(rec.round, 15);
  assert.strictEqual(rec.top.player.position, "DST");
});

test("K becomes recommended at round 16 when empty", function () {
  const s = simulateToPick(121);
  const rec = FS.recommend(players, s);
  assert.strictEqual(rec.round, 16);
  assert.ok(["K", "DST"].indexOf(rec.top.player.position) !== -1, "top is K or DST in final round");
});

// ---------------------------------------------------------------------------
console.log("Full mock draft");

test("full 128-pick draft records without corruption", function () {
  let s = FS.createInitialState(1);
  const schedule = FS.myPickSchedule(8, 1, 16);
  const mySet = {};
  schedule.forEach((p) => { mySet[p] = true; });

  for (let pick = 1; pick <= 128; pick++) {
    const drafted = FS.draftedPlayerIds(s);
    let chosen = null;
    for (const p of players) {
      if (!drafted[p.id]) { chosen = p; break; }
    }
    assert.ok(chosen, "player available at pick " + pick);
    const r = FS.applyPick(s, chosen.id, !!mySet[pick]);
    assert.ok(r.ok, "applyPick ok at pick " + pick);
    s = r.state;
  }
  assert.strictEqual(s.currentOverallPick, 129);
  assert.strictEqual(s.picks.length, 128);
  assert.strictEqual(FS.myPlayerIds(s).length, 16, "user roster has 16 players");
  assert.ok(FS.isComplete(s));
  const ids = s.picks.map((p) => p.playerId);
  assert.strictEqual(new Set(ids).size, 128, "no duplicate picks");
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function simulateToPick(targetOverallPick) {
  // Fill picks up to (but not including) target, skipping K/DST so those slots stay empty.
  let s = FS.createInitialState(1);
  while (s.currentOverallPick < targetOverallPick) {
    const drafted = FS.draftedPlayerIds(s);
    let chosen = null;
    for (const p of players) {
      if (p.position === "K" || p.position === "DST") continue;
      if (!drafted[p.id]) { chosen = p; break; }
    }
    if (!chosen) break;
    s = FS.applyPick(s, chosen.id, false).state;
  }
  return s;
}

// ---------------------------------------------------------------------------
console.log("\n" + passed + " tests passed" + (process.exitCode ? " (with failures)" : ""));

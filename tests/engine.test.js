/* FantasySavior engine tests (Node). Run: node tests/engine.test.js */
"use strict";

const assert = require("assert");
const path = require("path");
const fs = require("fs");
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

test("return horizon advances past the pick currently on the clock", function () {
  const sched = FS.myPickSchedule(8, 6, 16);
  assert.strictEqual(FS.nextUserPick(sched, 11), 11);
  assert.strictEqual(FS.followingUserPick(sched, 11), 22);
  assert.strictEqual(FS.followingUserPick(sched, 12), 22);
});

test("return horizon handles snake corners and final pick", function () {
  const slot1 = FS.myPickSchedule(8, 1, 16);
  const slot8 = FS.myPickSchedule(8, 8, 16);
  assert.strictEqual(FS.followingUserPick(slot1, 16), 17);
  assert.strictEqual(FS.followingUserPick(slot8, 8), 9);
  assert.strictEqual(FS.followingUserPick(slot1, 113), 128);
  assert.strictEqual(FS.followingUserPick(slot1, 128), null);
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

test("unlisted pick advances without consuming a listed player and undoes exactly", function () {
  let s = FS.createInitialState(3);
  const firstId = players[0].id;
  const r = FS.applyUnlistedPick(s);
  assert.ok(r.ok);
  s = r.state;
  assert.strictEqual(s.currentOverallPick, 2);
  assert.deepStrictEqual(s.picks[0], { overall: 1, playerId: null, draftedByMe: false, unlisted: true });
  assert.ok(!FS.draftedPlayerIds(s)[firstId]);
  const u = FS.undo(s);
  assert.ok(u.ok);
  assert.strictEqual(u.state.currentOverallPick, 1);
  assert.deepStrictEqual(u.state.picks, []);
});

test("multiple unlisted picks survive JSON round trip", function () {
  let s = FS.createInitialState(1);
  s = FS.applyUnlistedPick(s).state;
  s = FS.applyPick(s, players[0].id, false).state;
  s = FS.applyUnlistedPick(s).state;
  const restored = JSON.parse(JSON.stringify(s));
  assert.strictEqual(restored.currentOverallPick, 4);
  assert.strictEqual(restored.picks.filter((p) => p.unlisted).length, 2);
  assert.strictEqual(FS.draftedPlayerIds(restored)[players[0].id], true);
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

test("recommend uses the following pick while user is on the clock", function () {
  let s = FS.createInitialState(6);
  while (s.currentOverallPick < 11) {
    s = FS.applyUnlistedPick(s).state;
  }
  const rec = FS.recommend(players, s);
  assert.strictEqual(rec.isUserPick, true);
  assert.strictEqual(rec.nextUserPick, 11);
  assert.strictEqual(rec.returnHorizon, 22);
  assert.strictEqual(rec.picksUntilReturn, 11);
});

test("recommend uses upcoming pick between turns and finite final horizon", function () {
  let s = FS.createInitialState(1);
  while (s.currentOverallPick < 12) s = FS.applyUnlistedPick(s).state;
  let rec = FS.recommend(players, s);
  assert.strictEqual(rec.isUserPick, false);
  assert.strictEqual(rec.nextUserPick, 16);
  assert.strictEqual(rec.returnHorizon, 16);

  s = FS.createInitialState(1);
  while (s.currentOverallPick < 113) s = FS.applyUnlistedPick(s).state;
  rec = FS.recommend(players, s);
  assert.strictEqual(rec.isUserPick, true);
  assert.strictEqual(rec.returnHorizon, 128);
  assert.ok(rec.ranked.every((x) => Number.isFinite(x.returnProbability)));
});

test("final scheduled pick has no return label or score adjustment", function () {
  const s = FS.createInitialState(1);
  s.currentOverallPick = 128;
  const before = JSON.parse(JSON.stringify(players));
  const rec = FS.recommend(players, s);
  assert.strictEqual(rec.returnHorizon, null);
  assert.strictEqual(rec.picksUntilReturn, null);
  assert.ok(rec.ranked.every((x) => Number.isFinite(x.score)));
  assert.strictEqual(rec.ranked[0].returnProbability, null);
  assert.strictEqual(rec.ranked[0].returnLabel, "FINAL PICK");
  assert.ok(!rec.ranked[0].reasons.some((r) => /return|survive/i.test(r)));
  assert.ok(!rec.waitGuidance.some((g) => g.type === "WAIT ON QB" || g.type === "WAIT ON TE"));
  assert.deepStrictEqual(players, before);
});

test("user-owned unlisted pick preserves position in roster calculations", function () {
  let s = FS.createInitialState(1);
  s = FS.applyUnlistedPick(s, true, "RB").state;
  assert.strictEqual(s.picks[0].position, "RB");
  assert.strictEqual(FS.myPickEntries(s).length, 1);
  const roster = FS.myPickEntries(s).map((p) => ({ position: p.position }));
  assert.strictEqual(FS.countsByPosition(roster).RB, 1);
  assert.strictEqual(FS.undo(s).state.picks.length, 0);
});

test("invalid user-owned unlisted position is rejected without advancing", function () {
  const s = FS.createInitialState(1);
  const result = FS.applyUnlistedPick(s, true, "INVALID");
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "position-required");
  assert.strictEqual(s.currentOverallPick, 1);
  assert.deepStrictEqual(s.picks, []);
});

test("unlisted control has one DOM id and both ownership labels", function () {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.strictEqual((html.split("id=\"unlistedBtn\"").length - 1), 1);
  assert.ok(html.includes("Unlisted / Skip Pick"));
  assert.ok(fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8").includes("My unlisted pick"));
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

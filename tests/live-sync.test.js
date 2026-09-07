/* Deterministic ESPN Live Mode reconciliation tests. */
"use strict";
const assert = require("assert");
const FS = require("../engine.js");
const Live = require("../live-sync.js");
const data = require("../data/players.json");
const players = data.players.slice().sort((a, b) => a.rank - b.rank);

function payload(picks) {
  return { ok: true, picks: picks, capability: { liveChangeObserved: true } };
}
function espnPick(overall, player, id) {
  return { overall, espnPlayerId: id, name: player.name, position: player.position };
}
function apply(state, picks) {
  const result = Live.reconcile(payload(picks), state, players, FS);
  assert.strictEqual(result.ok, true, result.message || result.reason);
  return result;
}

let state = FS.createInitialState(1);
let first = espnPick(1, players[0], 10001);
let result = apply(state, [first]);
assert.strictEqual(result.applied.length, 1);
assert.strictEqual(result.state.currentOverallPick, 2);
assert.strictEqual(result.state.picks[0].playerId, players[0].id);
state = result.state;
result = apply(state, [first]);
assert.strictEqual(result.applied.length, 0, "repeating a poll must be idempotent");
assert.strictEqual(result.state.currentOverallPick, 2);

const nextPicks = [2, 3, 4].map((overall, index) => espnPick(overall, players[index + 1], 10002 + index));
result = apply(state, [first].concat(nextPicks));
assert.strictEqual(result.applied.length, 3);
state = result.state;
assert.strictEqual(state.currentOverallPick, 5);
assert.strictEqual(new Set(state.picks.map(p => p.playerId)).size, 4);

let unknownOpponent = FS.createInitialState(2);
let unknown = { overall: 1, espnPlayerId: 99001, name: "Unlisted ESPN Player", position: "RB" };
result = apply(unknownOpponent, [unknown]);
assert.strictEqual(result.state.picks[0].unlisted, true);
assert.strictEqual(result.state.picks[0].source, "espn");
assert.strictEqual(apply(result.state, [unknown]).applied.length, 0);

let unknownUser = FS.createInitialState(1);
result = apply(unknownUser, [{ overall: 1, espnPlayerId: 99002, name: "Unlisted User Player", position: "WR" }]);
assert.strictEqual(FS.countsByPosition(FS.myPickEntries(result.state).map(p => ({ position: p.position }))).WR, 1);

let gap = Live.reconcile(payload([{ overall: 2, espnPlayerId: 10001, name: players[0].name, position: players[0].position }]), FS.createInitialState(1), players, FS);
assert.strictEqual(gap.ok, false);
assert.strictEqual(gap.reason, "sequence-gap");

let conflictState = FS.applyPick(FS.createInitialState(1), players[0].id, true).state;
let conflict = Live.reconcile(payload([{ overall: 1, espnPlayerId: 10003, name: players[1].name, position: players[1].position }]), conflictState, players, FS);
assert.strictEqual(conflict.ok, false);
assert.strictEqual(conflict.reason, "conflict");
assert.strictEqual(conflict.state.picks[0].playerId, players[0].id);

let replayState = FS.createInitialState(1);
const replayPicks = players.slice(0, 128).map((player, i) => espnPick(i + 1, player, 20000 + i));
for (const end of [1, 4, 9, 32, 64, 96, 128]) {
  replayState = apply(replayState, replayPicks.slice(0, end)).state;
}
assert.strictEqual(replayState.currentOverallPick, 129);
assert.strictEqual(replayState.picks.length, 128);
assert.strictEqual(new Set(replayState.picks.map(p => p.playerId)).size, 128);

console.log("Live-sync tests passed.");

/* FantasySavior ESPN Live Mode adapter. No credentials or provider logic live here. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FantasySaviorLiveSync = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  "use strict";

  var VALID_POSITIONS = ["QB", "RB", "WR", "TE", "DST", "K"];

  function normalizeName(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function positionMatches(player, position) {
    if (!position || !player.position) return true;
    if (player.position === position) return true;
    return position === "DST" && player.position === "DST";
  }

  function resolvePlayer(pick, players) {
    var name = normalizeName(pick.name);
    if (!name) return null;
    var matches = players.filter(function (player) {
      return normalizeName(player.name) === name && positionMatches(player, pick.position);
    });
    return matches.length === 1 ? matches[0] : null;
  }

  function pickSignature(pick, resolved) {
    if (resolved) return "listed:" + resolved.id;
    if (pick.espnPlayerId != null) return "espn:" + String(pick.espnPlayerId);
    return "unlisted:" + normalizeName(pick.name) + ":" + String(pick.position || "");
  }

  function localSignature(pick) {
    if (pick.playerId != null) return "listed:" + pick.playerId;
    if (pick.source === "espn" && pick.espnPlayerId != null) return "espn:" + String(pick.espnPlayerId);
    return null;
  }

  function conflict(reason, state, extra) {
    return Object.assign({ ok: false, reason: reason, state: state, applied: [], warnings: [] }, extra || {});
  }

  function reconcile(payload, state, players, FS) {
    if (!payload || payload.ok !== true || !Array.isArray(payload.picks)) {
      return conflict(payload && payload.code ? payload.code : "bridge-error", state, {
        message: payload && payload.message ? payload.message : "Live bridge unavailable."
      });
    }
    var picks = payload.picks.slice().sort(function (a, b) { return a.overall - b.overall; });
    var byOverall = {};
    for (var i = 0; i < picks.length; i++) {
      var incoming = picks[i];
      if (typeof incoming.overall !== "number" || incoming.overall < 1) continue;
      if (byOverall[incoming.overall]) {
        return conflict("duplicate-espn-pick", state, { message: "ESPN returned duplicate pick " + incoming.overall + "." });
      }
      byOverall[incoming.overall] = incoming;
    }

    var localPicks = state.picks || [];
    for (var j = 0; j < localPicks.length; j++) {
      var local = localPicks[j];
      var matchingIncoming = byOverall[local.overall];
      if (!matchingIncoming) {
        return conflict("local-history-missing", state, { message: "ESPN history is missing local pick " + local.overall + "." });
      }
      var resolvedExisting = resolvePlayer(matchingIncoming, players);
      var expected = pickSignature(matchingIncoming, resolvedExisting);
      var actual = localSignature(local);
      if (actual !== expected) {
        return conflict("conflict", state, {
          message: "SYNC CONFLICT AT PICK " + local.overall,
          overall: local.overall,
          localPick: local,
          espnPick: matchingIncoming
        });
      }
    }

    var next = state;
    var applied = [];
    var warnings = [];
    var schedule = FS.myPickSchedule(FS.LEAGUE.teams, next.draftPosition, FS.LEAGUE.totalRounds);
    for (var k = 0; k < picks.length; k++) {
      var pick = picks[k];
      if (pick.overall < next.currentOverallPick) continue;
      if (pick.overall > next.currentOverallPick) {
        return conflict("sequence-gap", state, { message: "ESPN is missing pick " + next.currentOverallPick + "." });
      }
      var player = resolvePlayer(pick, players);
      var byMe = FS.isUserPick(schedule, next.currentOverallPick);
      var result;
      if (player) {
        result = FS.applyPick(next, player.id, byMe);
      } else {
        var position = VALID_POSITIONS.indexOf(pick.position) !== -1 ? pick.position : null;
        if (byMe && !position) {
          return conflict("unresolved-user-player", state, { message: "Cannot safely assign unresolved user pick " + pick.overall + "." });
        }
        result = FS.applyUnlistedPick(next, byMe, position, {
          source: "espn",
          espnPlayerId: pick.espnPlayerId,
          name: pick.name || null
        });
        if (result.ok) warnings.push("Unmatched ESPN player at pick " + pick.overall + (pick.name ? ": " + pick.name : "."));
      }
      if (!result.ok) return conflict(result.reason || "engine-rejected", state, { message: "Could not apply ESPN pick " + pick.overall + "." });
      next = result.state;
      applied.push({ overall: pick.overall, playerId: player ? player.id : null, draftedByMe: byMe });
    }
    return { ok: true, state: next, applied: applied, warnings: warnings };
  }

  function create(options) {
    options = options || {};
    var timer = null;
    var active = false;
    var paused = false;
    var busy = false;
    var interval = 10000;
    var lastOverall = null;

    function emit(phase, message, live) {
      if (options.onStatus) options.onStatus({ phase: phase, message: message, live: !!live, lastOverall: lastOverall });
    }
    function stopTimer() { if (timer != null) { clearTimeout(timer); timer = null; } }
    function schedule(ms) { stopTimer(); if (active && !paused) timer = setTimeout(pollNow, ms); }
    function pause() { paused = true; stopTimer(); emit("paused", "PAUSED · manual mode available", false); }
    function stop() { active = false; paused = false; stopTimer(); emit("off", "OFF", false); }
    async function pollNow() {
      if (!active || paused || busy) return;
      busy = true;
      emit("connecting", "CONNECTING…", false);
      try {
        var response = await (options.fetchJson || function () { return fetch("/api/espn/draft", { cache: "no-store" }).then(function (r) { return r.json(); }); })();
        if (!response || response.ok !== true) {
          if (response && response.code === "auth-failed") { active = false; emit("auth-failed", "AUTH FAILED · manual mode available", false); }
          else if (response && response.code === "conflict") { active = false; emit("conflict", "CONFLICT · manual mode available", false); }
          else emit("degraded", (response && response.message) || "DEGRADED · retrying", false);
          schedule(10000);
          return;
        }
        if (!response.capability || response.capability.liveChangeObserved !== true) {
          emit("probing", "PROBING · waiting for observed ESPN pick update", false);
          schedule(response.inProgress ? 3000 : 10000);
          return;
        }
        var result = reconcile(response, options.getState(), options.getPlayers(), options.FS);
        if (!result.ok) {
          active = false;
          emit(result.reason === "conflict" ? "conflict" : "degraded", result.message || "SYNC STOPPED · manual mode available", false);
          if (options.onResult) options.onResult(result);
          return;
        }
        if (result.applied.length) {
          options.setState(result.state);
          if (options.render) options.render();
          lastOverall = result.applied[result.applied.length - 1].overall;
        }
        emit("synced", "SYNCED" + (lastOverall == null ? "" : " · Pick " + lastOverall), true);
        if (options.onResult) options.onResult(result);
        interval = response.inProgress ? 3000 : 10000;
        schedule(interval);
      } catch (error) {
        emit("degraded", "DEGRADED · retrying", false);
        schedule(10000);
      } finally { busy = false; }
    }
    function start() { active = true; paused = false; emit("connecting", "CONNECTING…", false); pollNow(); }
    return { start: start, stop: stop, pause: pause, pollNow: pollNow, isActive: function () { return active && !paused; }, status: function () { return { active: active, paused: paused, lastOverall: lastOverall }; } };
  }

  return { normalizeName: normalizeName, resolvePlayer: resolvePlayer, reconcile: reconcile, create: create };
});

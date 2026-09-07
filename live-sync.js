/* FantasySavior ESPN Live Mode adapter. No credentials or provider logic live here. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FantasySaviorLiveSync = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VALID_POSITIONS = ["QB", "RB", "WR", "TE", "DST", "K"];
  var ESPN_PRO_TEAM_TO_ABBR = {
    1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
    9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
    17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
    25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU"
  };
  var DEFENSE_ALIASES = {
    ARI: ["arizona cardinals", "cardinals", "ari"], ATL: ["atlanta falcons", "falcons", "atl"],
    BAL: ["baltimore ravens", "ravens", "bal"], BUF: ["buffalo bills", "bills", "buf"],
    CAR: ["carolina panthers", "panthers", "car"], CHI: ["chicago bears", "bears", "chi"],
    CIN: ["cincinnati bengals", "bengals", "cin"], CLE: ["cleveland browns", "browns", "cle"],
    DAL: ["dallas cowboys", "cowboys", "dal"], DEN: ["denver broncos", "broncos", "den"],
    DET: ["detroit lions", "lions", "det"], GB: ["green bay packers", "packers", "gb"],
    HOU: ["houston texans", "texans", "hou"], IND: ["indianapolis colts", "colts", "ind"],
    JAX: ["jacksonville jaguars", "jaguars", "jax"], KC: ["kansas city chiefs", "chiefs", "kc"],
    LAC: ["los angeles chargers", "chargers", "lac"], LAR: ["los angeles rams", "rams", "lar"],
    LV: ["las vegas raiders", "raiders", "lv", "oakland raiders"], MIA: ["miami dolphins", "dolphins", "mia"],
    MIN: ["minnesota vikings", "vikings", "min"], NE: ["new england patriots", "patriots", "ne"],
    NO: ["new orleans saints", "saints", "no"], NYG: ["new york giants", "giants", "nyg"],
    NYJ: ["new york jets", "jets", "nyj"], PHI: ["philadelphia eagles", "eagles", "phi"],
    PIT: ["pittsburgh steelers", "steelers", "pit"], SF: ["san francisco 49ers", "49ers", "sf"],
    SEA: ["seattle seahawks", "seahawks", "sea"], TB: ["tampa bay buccaneers", "buccaneers", "tb", "bucs"],
    TEN: ["tennessee titans", "titans", "ten"], WAS: ["washington commanders", "commanders", "was"]
  };

  function normalizeName(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function defenseKey(value, proTeamId) {
    var fromTeam = ESPN_PRO_TEAM_TO_ABBR[String(proTeamId || "")];
    if (fromTeam) return fromTeam;
    var cleaned = normalizeName(value).replace(/\b(defense|d st|dst)\b/g, "").trim();
    for (var abbr in DEFENSE_ALIASES) {
      if (DEFENSE_ALIASES[abbr].some(function (alias) { return normalizeName(alias) === cleaned; })) return abbr;
    }
    return null;
  }

  function positionMatches(player, position) {
    if (!position || !player.position) return true;
    return player.position === position;
  }

  function resolvePlayer(pick, players) {
    if (pick.position === "DST") {
      var key = defenseKey(pick.name, pick.proTeamId);
      if (!key) return null;
      var defenses = players.filter(function (player) {
        return player.position === "DST" && (player.team === key || defenseKey(player.name, null) === key);
      });
      return defenses.length === 1 ? defenses[0] : null;
    }
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
      emit("connecting", "CONNECTING…", true);
      try {
        var response = await (options.fetchJson || function () { return fetch("/api/espn/draft", { cache: "no-store" }).then(function (r) { return r.json(); }); })();
        // Pause/stop may happen while the request is in flight. Never reconcile
        // or schedule after control has been handed back to Manual Mode.
        if (!active || paused) return;
        if (!response || response.ok !== true) {
          if (response && response.code === "auth-failed") { active = false; emit("auth-failed", "AUTH FAILED · manual mode available", false); }
          else if (response && response.code === "conflict") { active = false; emit("conflict", "CONFLICT · manual mode available", false); }
          else emit("degraded", (response && response.message) || "DEGRADED · retrying", true);
          schedule(10000);
          return;
        }
        if (!response.capability || response.capability.liveChangeObserved !== true) {
          emit("probing", "PROBING · waiting for observed ESPN pick update", true);
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
        schedule(response.inProgress ? 3000 : 10000);
      } catch (error) {
        if (active && !paused) {
          emit("degraded", "DEGRADED · retrying", true);
          schedule(10000);
        }
      } finally { busy = false; }
    }
    function start() {
      if (active && !paused) return;
      active = true;
      paused = false;
      emit("connecting", "CONNECTING…", true);
      pollNow();
    }
    return {
      start: start,
      stop: stop,
      pause: pause,
      pollNow: pollNow,
      isActive: function () { return active && !paused; },
      status: function () { return { active: active, paused: paused, lastOverall: lastOverall }; }
    };
  }

  return {
    normalizeName: normalizeName,
    defenseKey: defenseKey,
    resolvePlayer: resolvePlayer,
    reconcile: reconcile,
    create: create
  };
});

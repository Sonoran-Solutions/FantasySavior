/* FantasySavior — draft engine (pure, deterministic, testable in Node and browser).
 *
 * This file contains no DOM access and no localStorage access. The UI layer in
 * app.js calls into it, and tests/engine.test.js exercises it under Node.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FantasySavior = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // League preset (hard MVP constraints from AGENTS.md / README.md)
  // ---------------------------------------------------------------------------
  const LEAGUE = {
    teams: 8,
    scoring: "standard",
    totalRounds: 16,
    totalPicks: 128,
    roster: {
      QB: 1,
      RB: 2,
      WR: 2,
      TE: 1,
      FLEX: 1,
      DST: 1,
      K: 1,
      BENCH: 7,
      IR: 1
    }
  };

  const STARTER_SLOTS = ["QB", "RB", "WR", "TE", "FLEX", "DST", "K"];
  const MANDATORY = { QB: 1, RB: 2, WR: 2, TE: 1, DST: 1, K: 1 };

  // ---------------------------------------------------------------------------
  // Snake-draft math
  // ---------------------------------------------------------------------------
  function withinRoundPick(teams, slot, round) {
    return round % 2 === 1 ? slot : teams - slot + 1;
  }

  function overallPickForRound(teams, slot, round) {
    return (round - 1) * teams + withinRoundPick(teams, slot, round);
  }

  // All 16 of the user's overall selection numbers, ascending.
  function myPickSchedule(teams, slot, totalRounds) {
    const picks = [];
    for (let r = 1; r <= totalRounds; r++) {
      picks.push(overallPickForRound(teams, slot, r));
    }
    return picks;
  }

  function currentRound(teams, overallPick) {
    return Math.floor((overallPick - 1) / teams) + 1;
  }

  function nextUserPick(schedule, currentOverallPick) {
    for (const p of schedule) {
      if (p >= currentOverallPick) return p;
    }
    return null;
  }

  function followingUserPick(schedule, currentOverallPick) {
    for (const p of schedule) {
      if (p > currentOverallPick) return p;
    }
    return null;
  }

  function isUserPick(schedule, currentOverallPick) {
    return schedule.indexOf(currentOverallPick) !== -1;
  }

  function picksUntilNextUserPick(schedule, currentOverallPick) {
    const next = nextUserPick(schedule, currentOverallPick);
    if (next == null) return null;
    return next - currentOverallPick;
  }

  // ---------------------------------------------------------------------------
  // Draft state
  // ---------------------------------------------------------------------------
  function createInitialState(draftPosition) {
    return {
      version: 1,
      draftPosition: draftPosition,
      currentOverallPick: 1,
      picks: [],
      undoStack: []
    };
  }

  function isComplete(state) {
    return state.currentOverallPick > LEAGUE.totalPicks;
  }

  // Snapshot of the mutable portion, used for exact undo.
  function snapshot(state) {
    return {
      currentOverallPick: state.currentOverallPick,
      picks: state.picks.map(function (p) {
        return copyPick(p);
      })
    };
  }

  function copyPick(p) {
    return {
      overall: p.overall,
      playerId: p.playerId,
      draftedByMe: p.draftedByMe,
      ...(p.position ? { position: p.position } : {}),
      ...(p.unlisted ? { unlisted: true } : {})
    };
  }

  function draftedPlayerIds(state) {
    const set = {};
    for (const p of state.picks) if (p.playerId != null) set[p.playerId] = true;
    return set;
  }

  function myPlayerIds(state) {
    return state.picks
      .filter(function (p) { return p.draftedByMe && p.playerId != null; })
      .map(function (p) { return p.playerId; });
  }

  function myPickEntries(state) {
    return state.picks.filter(function (p) { return p.draftedByMe; });
  }

  // Apply one draft mutation. Returns { ok, state } or { ok, reason }.
  function applyPick(state, playerId, draftedByMe) {
    if (isComplete(state)) {
      return { ok: false, reason: "draft-complete" };
    }
    if (draftedPlayerIds(state)[playerId]) {
      return { ok: false, reason: "already-drafted" };
    }
    const next = {
      version: state.version,
      draftPosition: state.draftPosition,
      currentOverallPick: state.currentOverallPick + 1,
      picks: state.picks.concat([
        { overall: state.currentOverallPick, playerId: playerId, draftedByMe: !!draftedByMe }
      ]),
      undoStack: state.undoStack.concat([snapshot(state)])
    };
    return { ok: true, state: next };
  }

  function applyUnlistedPick(state, draftedByMe, position) {
    if (isComplete(state)) return { ok: false, reason: "draft-complete" };
    if (draftedByMe && ["QB", "RB", "WR", "TE", "DST", "K"].indexOf(position) === -1) {
      return { ok: false, reason: "position-required" };
    }
    const next = {
      version: state.version,
      draftPosition: state.draftPosition,
      currentOverallPick: state.currentOverallPick + 1,
      picks: state.picks.concat([
        Object.assign(
          { overall: state.currentOverallPick, playerId: null, draftedByMe: !!draftedByMe, unlisted: true },
          position ? { position: position } : {}
        )
      ]),
      undoStack: state.undoStack.concat([snapshot(state)])
    };
    return { ok: true, state: next };
  }

  // Exact multi-step undo. Returns { ok, state }.
  function undo(state) {
    if (!state.undoStack.length) {
      return { ok: false, reason: "nothing-to-undo", state: state };
    }
    const prev = state.undoStack[state.undoStack.length - 1];
    const next = {
      version: state.version,
      draftPosition: state.draftPosition,
      currentOverallPick: prev.currentOverallPick,
      picks: prev.picks.map(function (p) {
        return copyPick(p);
      }),
      undoStack: state.undoStack.slice(0, -1)
    };
    return { ok: true, state: next };
  }

  // ---------------------------------------------------------------------------
  // Roster helpers
  // ---------------------------------------------------------------------------
  function countsByPosition(myPlayers) {
    const c = { QB: 0, RB: 0, WR: 0, TE: 0, DST: 0, K: 0 };
    for (const p of myPlayers) {
      if (c[p.position] != null) c[p.position]++;
    }
    return c;
  }

  function flexPoolSize(counts) {
    return (
      Math.max(0, (counts.RB || 0) - MANDATORY.RB) +
      Math.max(0, (counts.WR || 0) - MANDATORY.WR) +
      Math.max(0, (counts.TE || 0) - MANDATORY.TE)
    );
  }

  // Which mandatory starter slots are already filled (0/1 per slot).
  function startersFilled(counts) {
    return {
      QB: Math.min(1, counts.QB || 0),
      RB: Math.min(MANDATORY.RB, counts.RB || 0),
      WR: Math.min(MANDATORY.WR, counts.WR || 0),
      TE: Math.min(1, counts.TE || 0),
      FLEX: Math.min(1, flexPoolSize(counts)),
      DST: Math.min(1, counts.DST || 0),
      K: Math.min(1, counts.K || 0)
    };
  }

  function totalStartersFilled(counts) {
    const s = startersFilled(counts);
    return s.QB + s.RB + s.WR + s.TE + s.FLEX + s.DST + s.K;
  }

  // Visual slot assignment (no effect on recommendation value except via counts).
  function assignSlots(myPlayers) {
    const byPos = { QB: [], RB: [], WR: [], TE: [], DST: [], K: [] };
    for (const p of myPlayers) byPos[p.position].push(p);
    for (const k in byPos) byPos[k].sort(function (a, b) { return a.rank - b.rank; });

    const slots = { QB: [], RB: [], WR: [], TE: [], FLEX: [], DST: [], K: [] };
    const bench = [];
    const leftovers = { RB: [], WR: [], TE: [] };

    for (const pos of ["QB", "RB", "WR", "TE", "DST", "K"]) {
      const list = byPos[pos] || [];
      const take = Math.min(MANDATORY[pos], list.length);
      slots[pos] = list.slice(0, take);
      const extra = list.slice(take);
      if (pos === "RB" || pos === "WR" || pos === "TE") {
        leftovers[pos] = extra;
      } else {
        bench.push.apply(bench, extra);
      }
    }

    const flexPool = leftovers.RB.concat(leftovers.WR, leftovers.TE)
      .sort(function (a, b) { return a.rank - b.rank; });
    if (flexPool.length) slots.FLEX = [flexPool.shift()];
    bench.push.apply(bench, flexPool);
    bench.sort(function (a, b) { return a.rank - b.rank; });

    return { slots: slots, bench: bench };
  }

  // ---------------------------------------------------------------------------
  // Recommendation engine
  // ---------------------------------------------------------------------------
  // All tunable weights in one place, per DRAFT_STRATEGY.md.
  const WEIGHTS = {
    rankWeight: 0.6,          // base player value: 100 - (rank-1)*rankWeight
    adpWeight: 1.0,           // per meaningful pick a player has fallen past ADP
    adpDeadZone: 2,           // ignore the first N picks of ADP slack
    maxAdpBonus: 25,
    scarcity: { 1: 18, 2: 12, 3: 7, 4: 3 },
    eliteQB: 8,
    eliteTE: 8,
    genericQB: 0,
    genericTE: 0,
    injuryPenalty: { medium: 3, high: 6, severe: 12 },
    injuryMonitorPenalty: 2,
    injuredReservePenalty: 12,
    earlyKDSTPenalty: 45,
    dstAllowedRound: 15,
    kAllowedRound: 16,
    kdstFillBonus: 38,
    returnLogisticScale: 5
  };

  const ROUND_WEIGHTS = {
    early:     { rosterNeed: 4,  qbNeed: 2, teNeed: 2, redundancy: 3,  upside: 4,  wontReturn: 10 },
    mid:       { rosterNeed: 8,  qbNeed: 6, teNeed: 6, redundancy: 5,  upside: 6,  wontReturn: 12 },
    "late-mid":{ rosterNeed: 10, qbNeed: 8, teNeed: 8, redundancy: 6,  upside: 10, wontReturn: 8 },
    late:      { rosterNeed: 12, qbNeed: 9, teNeed: 9, redundancy: 6,  upside: 12, wontReturn: 6 },
    kicker:    { rosterNeed: 6,  qbNeed: 4, teNeed: 4, redundancy: 2,  upside: 6,  wontReturn: 2 }
  };

  function roundBucket(round) {
    if (round <= 4) return "early";
    if (round <= 8) return "mid";
    if (round <= 12) return "late-mid";
    if (round <= 14) return "late";
    return "kicker";
  }

  // Probability a player is still on the board at the user's next pick (logistic).
  function returnProbability(player, returnHorizon) {
    if (returnHorizon == null) return null;
    const distance = player.adp - returnHorizon;
    return 1 / (1 + Math.exp(-distance / WEIGHTS.returnLogisticScale));
  }

  function returnLabel(probability) {
    if (probability == null) return "FINAL PICK";
    if (probability < 0.1) return "Very unlikely to return";
    if (probability < 0.3) return "Unlikely to return";
    if (probability < 0.6) return "Could return";
    if (probability < 0.85) return "Likely to return";
    return "Very likely to return";
  }

  function basePlayerValue(player) {
    return Math.max(0, 100 - (player.rank - 1) * WEIGHTS.rankWeight);
  }

  function adpValue(player, currentOverallPick) {
    const delta = currentOverallPick - player.adp;
    const meaningful = Math.max(0, delta - WEIGHTS.adpDeadZone);
    return Math.min(WEIGHTS.maxAdpBonus, meaningful * WEIGHTS.adpWeight);
  }

  // Remaining players in the same position+tier (computed once per recompute).
  function buildTierRemaining(players, draftedIds) {
    const map = {};
    for (const p of players) {
      if (draftedIds[p.id]) continue;
      const key = p.position + ":" + p.tier;
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }

  function scarcityBonus(player, tierRemaining) {
    const remaining = tierRemaining[player.position + ":" + player.tier] || 0;
    return WEIGHTS.scarcity[remaining] || 0;
  }

  function rosterNeedBonus(player, starters, round) {
    const rw = ROUND_WEIGHTS[roundBucket(round)];
    let need = 0;
    if (player.position === "QB" && starters.QB < 1) need = rw.qbNeed;
    else if (player.position === "RB" && starters.RB < 2) need = rw.rosterNeed;
    else if (player.position === "WR" && starters.WR < 2) need = rw.rosterNeed;
    else if (player.position === "TE" && starters.TE < 1) need = rw.teNeed;
    else if (
      (player.position === "RB" || player.position === "WR" || player.position === "TE") &&
      starters.FLEX < 1
    ) {
      need = rw.rosterNeed * 0.4;
    }
    return need;
  }

  function positionalAdvantage(player) {
    if (player.position === "QB") {
      return player.tier === 1 ? WEIGHTS.eliteQB : WEIGHTS.genericQB;
    }
    if (player.position === "TE") {
      return player.tier === 1 ? WEIGHTS.eliteTE : WEIGHTS.genericTE;
    }
    return 0;
  }

  function redundancyPenalty(player, counts, round) {
    const rw = ROUND_WEIGHTS[roundBucket(round)];
    const c = counts;
    let pen = 0;
    if (player.position === "QB" && c.QB >= 1) pen = rw.redundancy;
    else if (player.position === "TE" && c.TE >= 1) pen = rw.redundancy;
    else if (player.position === "RB" && c.RB >= 2) pen = rw.redundancy * 0.8;
    else if (player.position === "WR" && c.WR >= 2) pen = rw.redundancy * 0.8;
    else if (player.position === "DST" && c.DST >= 1) pen = rw.redundancy;
    else if (player.position === "K" && c.K >= 1) pen = rw.redundancy;

    // Elite value tolerates redundancy early.
    const isElite = player.tier === 1 || (player.tags || []).indexOf("elite") !== -1;
    if (isElite && round <= 4) pen *= 0.2;
    return pen;
  }

  function upsideBonus(player, round) {
    const rw = ROUND_WEIGHTS[roundBucket(round)];
    const tags = player.tags || [];
    let bonus = 0;
    const hasUpside =
      tags.indexOf("upside") !== -1 ||
      tags.indexOf("lottery-ticket") !== -1 ||
      tags.indexOf("sleeper") !== -1;
    if (hasUpside) {
      bonus += rw.upside;
      if (round >= 9) bonus += 6; // bench rounds favor ceiling harder
    }
    return bonus;
  }

  function injuryPenalty(player) {
    let pen = 0;
    const risk = player.availabilityRisk;
    if (risk === "medium") pen += WEIGHTS.injuryPenalty.medium;
    else if (risk === "high") pen += WEIGHTS.injuryPenalty.high;
    else if (risk === "severe") pen += WEIGHTS.injuryPenalty.severe;

    const tags = player.tags || [];
    if (tags.indexOf("injured-reserve") !== -1) pen += WEIGHTS.injuredReservePenalty;
    else if (tags.indexOf("injury-monitor") !== -1) pen += WEIGHTS.injuryMonitorPenalty;
    return pen;
  }

  function kdstPenalty(player, round) {
    if (player.position !== "K" && player.position !== "DST") return 0;
    const allowed =
      player.position === "DST" ? WEIGHTS.dstAllowedRound : WEIGHTS.kAllowedRound;
    if (round >= allowed) return 0;
    return WEIGHTS.earlyKDSTPenalty;
  }

  function kdstFillBonus(player, starters, round) {
    if (player.position === "DST" && starters.DST < 1 && round >= WEIGHTS.dstAllowedRound) {
      return WEIGHTS.kdstFillBonus;
    }
    if (player.position === "K" && starters.K < 1 && round >= WEIGHTS.kAllowedRound) {
      return WEIGHTS.kdstFillBonus;
    }
    return 0;
  }

  function hasUpsideTag(player) {
    const tags = player.tags || [];
    return (
      tags.indexOf("upside") !== -1 ||
      tags.indexOf("lottery-ticket") !== -1 ||
      tags.indexOf("sleeper") !== -1
    );
  }

  // Human-readable reasons for a scored candidate.
  function reasonsFor(player, ctx, playerReturnProbability) {
    const reasons = [];
    const rw = ROUND_WEIGHTS[roundBucket(ctx.round)];

    if (ctx.bestBasePlayerId === player.id) reasons.push("Best player remaining");
    if (adpValue(player, ctx.currentOverallPick) >= 8) {
      reasons.push("Fallen well past ADP — value");
    }
    const remaining = ctx.tierRemaining[player.position + ":" + player.tier] || 0;
    if (remaining >= 1 && remaining <= 3) {
      reasons.push("Only " + remaining + " " + player.position + " left in this tier");
    }
    if (player.position === "QB" && ctx.starters.QB < 1 && player.tier === 1) {
      reasons.push("Elite QB — real positional advantage");
    }
    if (player.position === "TE" && ctx.starters.TE < 1 && player.tier === 1) {
      reasons.push("Elite TE — real positional advantage");
    }
    if (player.position === "RB" && ctx.starters.RB < 2) {
      reasons.push(ctx.starters.RB === 0 ? "Fills your RB1" : "Fills your RB2");
    }
    if (player.position === "WR" && ctx.starters.WR < 2) {
      reasons.push(ctx.starters.WR === 0 ? "Fills your WR1" : "Fills your WR2");
    }
    if (
      (player.position === "RB" || player.position === "WR" || player.position === "TE") &&
      ctx.starters.FLEX < 1 &&
      ctx.starters[player.position] >= MANDATORY[player.position]
    ) {
      reasons.push("Completes your FLEX");
    }
    if (ctx.picksUntilReturn != null && ctx.picksUntilReturn <= 2 && playerReturnProbability < 0.3) {
      reasons.push("Unlikely to survive to your next pick");
    } else if (playerReturnProbability != null && playerReturnProbability < 0.15) {
      reasons.push("Unlikely to return");
    }
    if (hasUpsideTag(player) && ctx.round >= 9) {
      reasons.push("High-upside lottery ticket");
    }
    if (player.availabilityRisk === "high" || player.availabilityRisk === "severe") {
      reasons.push("Availability risk");
    }
    if (player.availabilityRisk === "medium") {
      reasons.push("Minor availability risk");
    }
    return reasons.slice(0, 4);
  }

  // Wait guidance for QB/TE in shallow leagues.
  function waitGuidance(ctx, top) {
    const guidance = [];
    if (!top) return guidance;

    const qbRemaining = ctx.positionRemaining.QB || 0;
    const teRemaining = ctx.positionRemaining.TE || 0;

    if (ctx.starters.QB < 1 && qbRemaining >= 4 && top.position !== "QB") {
      guidance.push({
        type: "WAIT ON QB",
        reasons: [
          qbRemaining + " QBs remain in the player pool",
          ctx.picksUntilReturn == null
            ? "No later draft opportunity"
            : ctx.isUserPick
            ? "Your following pick is " + ctx.picksUntilReturn + " selections away"
            : "Your next pick is " + ctx.picksUntilNext + " selections away"
        ]
      });
    }
    if (ctx.starters.TE < 1 && teRemaining >= 3 && top.position !== "TE") {
      guidance.push({
        type: "WAIT ON TE",
        reasons: [
          teRemaining + " TEs remain in the player pool",
          "Do not force a mid-tier TE while upside is available"
        ]
      });
    }
    return guidance;
  }

  // Compute a full ranked shortlist. Pure function of (players, state).
  function recommend(players, state) {
    const draftedIds = draftedPlayerIds(state);
    const available = players.filter(function (p) { return !draftedIds[p.id]; });

    const schedule = myPickSchedule(LEAGUE.teams, state.draftPosition, LEAGUE.totalRounds);
    const round = currentRound(LEAGUE.teams, state.currentOverallPick);
    const next = nextUserPick(schedule, state.currentOverallPick);
    const userTurn = isUserPick(schedule, state.currentOverallPick);
    const returnHorizon = userTurn
      ? followingUserPick(schedule, state.currentOverallPick)
      : next;
    const picksUntilNext = next == null ? 0 : next - state.currentOverallPick;
    const picksUntilReturn = returnHorizon == null ? null : returnHorizon - state.currentOverallPick;

    const myPlayers = myPickEntries(state).map(function (pick) {
      return pick.playerId == null
        ? { id: null, name: "Unlisted pick", position: pick.position, rank: Number.MAX_SAFE_INTEGER }
        : playerById(players, pick.playerId);
    }).filter(Boolean);
    const counts = countsByPosition(myPlayers);
    const starters = startersFilled(counts);

    const tierRemaining = buildTierRemaining(players, draftedIds);
    const positionRemaining = {};
    for (const p of available) {
      positionRemaining[p.position] = (positionRemaining[p.position] || 0) + 1;
    }

    // Highest raw base value among available (used to label "best player remaining").
    let bestBasePlayerId = null;
    let bestBaseValue = -Infinity;
    for (const p of available) {
      const v = basePlayerValue(p);
      if (v > bestBaseValue) {
        bestBaseValue = v;
        bestBasePlayerId = p.id;
      }
    }

    const ctx = {
      round: round,
      currentOverallPick: state.currentOverallPick,
      nextUserPick: next,
      picksUntilNext: picksUntilNext,
      picksUntilReturn: picksUntilReturn,
      isUserPick: userTurn,
      tierRemaining: tierRemaining,
      positionRemaining: positionRemaining,
      starters: starters,
      counts: counts,
      bestBasePlayerId: bestBasePlayerId
    };

    const scored = [];
    for (const p of available) {
      const playerReturnProbability = returnProbability(p, returnHorizon);
      const score =
        basePlayerValue(p) +
        adpValue(p, state.currentOverallPick) +
        scarcityBonus(p, tierRemaining) +
        rosterNeedBonus(p, starters, round) +
        positionalAdvantage(p) -
        redundancyPenalty(p, counts, round) +
        upsideBonus(p, round) -
        injuryPenalty(p) -
        kdstPenalty(p, round) +
        kdstFillBonus(p, starters, round) +
        (playerReturnProbability == null ? 0 : 1 - playerReturnProbability) * ROUND_WEIGHTS[roundBucket(round)].wontReturn;

      scored.push({
        player: p,
        score: score,
        returnProbability: playerReturnProbability,
        returnLabel: returnLabel(playerReturnProbability),
        reasons: reasonsFor(p, ctx, playerReturnProbability)
      });
    }

    scored.sort(function (a, b) { return b.score - a.score; });

    const top = scored[0] || null;

    // Shortlist: top pick, best different-position alternative, best pure value, best upside.
    let altPosition = null;
    for (const s of scored) {
      if (top && s.player.position !== top.player.position) {
        altPosition = s;
        break;
      }
    }

    let bestValue = null;
    let bestValueScore = -Infinity;
    for (const s of scored) {
      const v = basePlayerValue(s.player);
      if (v > bestValueScore) {
        bestValueScore = v;
        bestValue = s;
      }
    }

    let bestUpside = null;
    for (const s of scored) {
      if (hasUpsideTag(s.player)) {
        bestUpside = s;
        break;
      }
    }

    const shortlist = [top, altPosition, bestValue, bestUpside]
      .filter(Boolean)
      .filter(function (s, i, arr) {
        return arr.findIndex(function (x) { return x.player.id === s.player.id; }) === i;
      })
      .slice(0, 4);

    return {
      round: round,
      currentOverallPick: state.currentOverallPick,
      nextUserPick: next,
      picksUntilNext: picksUntilNext,
      isUserPick: userTurn,
      returnHorizon: returnHorizon,
      picksUntilReturn: picksUntilReturn,
      availableCount: available.length,
      tierRemaining: tierRemaining,
      positionRemaining: positionRemaining,
      starters: starters,
      totalStartersFilled: totalStartersFilled(counts),
      ranked: scored,
      top: top,
      shortlist: shortlist,
      altPosition: altPosition,
      bestValue: bestValue,
      bestUpside: bestUpside,
      waitGuidance: waitGuidance(ctx, top ? top.player : null),
      schedule: schedule
    };
  }

  function playerById(players, id) {
    for (const p of players) {
      if (p.id === id) return p;
    }
    return null;
  }

  return {
    LEAGUE: LEAGUE,
    STARTER_SLOTS: STARTER_SLOTS,
    MANDATORY: MANDATORY,
    WEIGHTS: WEIGHTS,
    ROUND_WEIGHTS: ROUND_WEIGHTS,
    withinRoundPick: withinRoundPick,
    overallPickForRound: overallPickForRound,
    myPickSchedule: myPickSchedule,
    currentRound: currentRound,
    nextUserPick: nextUserPick,
    followingUserPick: followingUserPick,
    isUserPick: isUserPick,
    picksUntilNextUserPick: picksUntilNextUserPick,
    createInitialState: createInitialState,
    isComplete: isComplete,
    snapshot: snapshot,
    draftedPlayerIds: draftedPlayerIds,
    myPlayerIds: myPlayerIds,
    myPickEntries: myPickEntries,
    applyPick: applyPick,
    applyUnlistedPick: applyUnlistedPick,
    undo: undo,
    countsByPosition: countsByPosition,
    startersFilled: startersFilled,
    totalStartersFilled: totalStartersFilled,
    assignSlots: assignSlots,
    returnProbability: returnProbability,
    returnLabel: returnLabel,
    basePlayerValue: basePlayerValue,
    recommend: recommend,
    playerById: playerById
  };
});

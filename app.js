/* FantasySavior — UI layer. Calls into the pure engine in engine.js. */
(function () {
  "use strict";

  var FS = window.FantasySavior;
  var STORAGE_KEY = "fantasy-savior:draft:v1";

  var players = [];
  var playersById = {};
  var state = null;
  var dataMetadata = null;

  var filter = "ALL";
  var searchQuery = "";

  // -------------------------------------------------------------------------
  // Small DOM helpers
  // -------------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function toast(message, kind) {
    var el = $("toast");
    el.textContent = message;
    el.className = "toast " + (kind || "");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.add("hidden"); }, 2600);
  }

  // -------------------------------------------------------------------------
  // Data + state loading
  // -------------------------------------------------------------------------
  function loadData() {
    if (!window.FANTASY_SAVIOR_DATA || !window.FANTASY_SAVIOR_DATA.players) {
      throw new Error("Player data missing (window.FANTASY_SAVIOR_DATA)");
    }
    players = window.FANTASY_SAVIOR_DATA.players.slice().sort(function (a, b) {
      return a.rank - b.rank;
    });
    playersById = {};
    for (var i = 0; i < players.length; i++) playersById[players[i].id] = players[i];
    dataMetadata = window.FANTASY_SAVIOR_DATA.metadata || {};
  }

  function loadState() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { /* storage blocked */ }
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!isValidState(parsed)) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function isValidState(s) {
    if (!s || s.version !== 1) return false;
    if (typeof s.draftPosition !== "number" || s.draftPosition < 1 || s.draftPosition > FS.LEAGUE.teams) return false;
    if (typeof s.currentOverallPick !== "number") return false;
    if (!Array.isArray(s.picks)) return false;
    if (!Array.isArray(s.undoStack)) return false;
    for (var i = 0; i < s.picks.length; i++) {
      var p = s.picks[i];
      if (!p || typeof p.overall !== "number") return false;
      if (p.playerId !== null && typeof p.playerId !== "string") return false;
      if (p.playerId === null && p.unlisted !== true) return false;
      if (typeof p.draftedByMe !== "boolean") return false;
      if (p.playerId === null && p.draftedByMe && ["QB", "RB", "WR", "TE", "DST", "K"].indexOf(p.position) === -1) return false;
    }
    return true;
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {
      toast("Could not save draft state to this browser.", "error");
    }
  }

  function clearState() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    state = null;
  }

  // -------------------------------------------------------------------------
  // Setup screen
  // -------------------------------------------------------------------------
  function renderSetup() {
    $("app").classList.add("hidden");
    $("setup").classList.remove("hidden");
    $("topActions").classList.add("hidden");

    var existing = loadState();
    var resumeBox = $("resumeBox");
    if (existing) {
      resumeBox.classList.remove("hidden");
      var myCount = existing.picks.filter(function (p) { return p.draftedByMe; }).length;
      $("resumeSummary").textContent =
        "Draft in progress — slot " + existing.draftPosition +
        ", pick " + existing.currentOverallPick +
        ", roster " + myCount + " players.";
    } else {
      resumeBox.classList.add("hidden");
    }

    var picker = $("slotPicker");
    picker.innerHTML = "";
    for (var s = 1; s <= FS.LEAGUE.teams; s++) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn slot-btn";
      btn.textContent = String(s);
      btn.dataset.slot = String(s);
      picker.appendChild(btn);
    }
  }

  // -------------------------------------------------------------------------
  // Main app render
  // -------------------------------------------------------------------------
  function renderApp() {
    $("setup").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("topActions").classList.remove("hidden");

    var rec = state ? FS.recommend(players, state) : null;

    renderStatus(rec);
    renderBoard();
    renderCopilot(rec);
    renderUndoButton();
  }

  function renderStatus(rec) {
    if (!state) return;
    var schedule = FS.myPickSchedule(FS.LEAGUE.teams, state.draftPosition, FS.LEAGUE.totalRounds);
    var next = FS.nextUserPick(schedule, state.currentOverallPick);
    var onClock = FS.isUserPick(schedule, state.currentOverallPick);
    var round = FS.currentRound(FS.LEAGUE.teams, state.currentOverallPick);
    $("draftStatus").textContent =
      "Slot " + state.draftPosition + "  ·  Pick " + state.currentOverallPick + "/" + FS.LEAGUE.totalPicks +
      "  ·  Round " + round + "  ·  " + (onClock ? "YOUR PICK NOW" : "NEXT OPPORTUNITY " + (next == null ? "—" : next));
    var generated = dataMetadata.generatedAt ? new Date(dataMetadata.generatedAt) : null;
    var generatedText = generated && !isNaN(generated.getTime())
      ? generated.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "unknown";
    $("dataStatus").textContent = "DATA: " + generatedText + (dataMetadata.refreshBeforeDraft ? " · REFRESH RECOMMENDED" : "");
    $("dataStatus").className = "data-status" + (dataMetadata.refreshBeforeDraft ? " data-warning" : "");
  }

  function renderUndoButton() {
    var canUndo = state && state.undoStack.length > 0;
    $("undoBtn").disabled = !canUndo;
    $("undoBtn").style.opacity = canUndo ? "1" : "0.4";
  }

  // -------------------------------------------------------------------------
  // Board
  // -------------------------------------------------------------------------
  function renderFilters() {
    var container = $("filters");
    container.innerHTML = "";
    var positions = ["ALL", "QB", "RB", "WR", "TE", "DST", "K"];
    positions.forEach(function (pos) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-btn" + (filter === pos ? " active" : "");
      btn.textContent = pos;
      btn.dataset.filter = pos;
      container.appendChild(btn);
    });
  }

  function visiblePlayers() {
    var drafted = FS.draftedPlayerIds(state);
    var q = searchQuery.trim().toLowerCase();
    return players.filter(function (p) {
      if (drafted[p.id]) return false;
      if (filter !== "ALL" && p.position !== filter) return false;
      if (q && p.name.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function renderBoard() {
    renderFilters();
    var list = visiblePlayers();
    var el = $("boardList");

    $("boardCount").textContent = list.length + " available";

    // Tier depletion hint for the currently relevant positions.
    var rec = state ? FS.recommend(players, state) : null;
    var dep = "";
    if (rec) {
      var parts = [];
      ["RB", "WR", "TE", "QB"].forEach(function (pos) {
        var lowest = null;
        Object.keys(rec.tierRemaining).forEach(function (key) {
          if (key.indexOf(pos + ":") === 0) {
            var n = rec.tierRemaining[key];
            if (n >= 1 && n <= 3 && (lowest == null || n < lowest)) lowest = n;
          }
        });
        if (lowest != null) parts.push(pos + " " + lowest + " left");
      });
      dep = parts.length ? "Tier watch: " + parts.join(" · ") : "";
    }
    $("tierDepletion").textContent = dep;

    if (!list.length) {
      el.innerHTML = '<div class="empty-state">No players match.</div>';
      return;
    }

    var html = "";
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      html += playerRowHtml(p);
    }
    el.innerHTML = html;
  }

  function playerRowHtml(p) {
    var inj = p.injuryStatus || (p.availabilityRisk && p.availabilityRisk !== "low" ? p.availabilityRisk + " risk" : "");
    var injBadge = "";
    if (inj) {
      var sev = p.availabilityRisk === "high" || p.availabilityRisk === "severe" ? " severe" : "";
      injBadge = '<span class="injury-badge' + sev + '">' + escapeHtml(inj) + "</span>";
    }
    var adpTxt = p.adp != null ? String(Math.round(p.adp)) : "—";
    var schedule = FS.myPickSchedule(FS.LEAGUE.teams, state.draftPosition, FS.LEAGUE.totalRounds);
    var onClock = FS.isUserPick(schedule, state.currentOverallPick);
    return (
      '<div class="player-row" data-id="' + escapeHtml(p.id) + '">' +
        '<span class="pos-badge pos-' + escapeHtml(p.position) + '">' + escapeHtml(p.position) + "</span>" +
        '<div class="player-main">' +
          '<div class="player-name">' + escapeHtml(p.name) + "</div>" +
          '<div class="player-sub">' +
            "<span>" + escapeHtml(p.team) + "</span>" +
            '<span>Bye ' + escapeHtml(p.bye) + "</span>" +
            '<span>Rk ' + escapeHtml(p.rank) + "</span>" +
            "<span>ADP " + escapeHtml(adpTxt) + "</span>" +
            '<span class="tier-badge">T' + escapeHtml(p.tier) + "</span>" +
            injBadge +
          "</div>" +
        "</div>" +
        '<div class="player-actions">' +
          (onClock
            ? '<button class="pick-btn mine" data-action="mine">Draft to me</button>'
            : '<button class="pick-btn other" data-action="other">Mark drafted</button>') +
        "</div>" +
      "</div>"
    );
  }

  // -------------------------------------------------------------------------
  // Copilot
  // -------------------------------------------------------------------------
  function renderCopilot(rec) {
    if (!rec) {
      $("pickContext").innerHTML = "";
      $("recommendation").innerHTML = "";
      $("roster").innerHTML = "";
      return;
    }

    // Pick context pills.
    var nextTxt = rec.isUserPick
      ? (rec.returnHorizon == null ? "—" : rec.returnHorizon)
      : (rec.nextUserPick == null ? "—" : rec.nextUserPick);
    var untilTxt = rec.isUserPick
      ? (rec.picksUntilReturn == null ? "—" : rec.picksUntilReturn)
      : (rec.picksUntilNext == null ? "—" : rec.picksUntilNext);
    $("pickContext").innerHTML =
      '<div class="ctx-pill"><strong>Current pick</strong>' + escapeHtml(rec.currentOverallPick) + "</div>" +
      '<div class="ctx-pill"><strong>Round</strong>' + escapeHtml(rec.round) + "</div>" +
      '<div class="ctx-pill"><strong>' + (rec.isUserPick ? "Next opportunity" : "Your next pick") + "</strong>" + escapeHtml(nextTxt) + "</div>" +
      '<div class="ctx-pill"><strong>Picks until</strong>' + escapeHtml(untilTxt) + "</div>";

    // Recommendation.
    var recHtml = '<div class="rec-head">Recommendation</div>';
    if (rec.top) {
      recHtml += topRecHtml(rec);
      recHtml += waitGuidanceHtml(rec);
      recHtml += altListHtml(rec);
    } else {
      recHtml += '<div class="empty-state">Draft complete.</div>';
    }
    $("recommendation").innerHTML = recHtml;

    // Roster.
    $("roster").innerHTML = rosterHtml();
  }

  function topRecHtml(rec) {
    var p = rec.top.player;
    var reasons = (rec.top.reasons || []).map(function (r) {
      return "<li>" + escapeHtml(r) + "</li>";
    }).join("");
    return (
      '<div class="rec-top">' +
        '<div class="rec-label">TAKE</div>' +
        '<div class="player-name">' + escapeHtml(p.name) + "</div>" +
        '<div class="player-sub">' +
          '<span class="pos-badge pos-' + escapeHtml(p.position) + '">' + escapeHtml(p.position) + "</span>" +
          "<span>" + escapeHtml(p.team) + "</span>" +
          '<span>Rk ' + escapeHtml(p.rank) + "</span>" +
          '<span class="tier-badge">T' + escapeHtml(p.tier) + "</span>" +
          "<span>" + escapeHtml(rec.top.returnLabel) + "</span>" +
        "</div>" +
        (reasons ? '<ul class="rec-reasons">' + reasons + "</ul>" : "") +
      "</div>"
    );
  }

  function waitGuidanceHtml(rec) {
    if (!rec.waitGuidance || !rec.waitGuidance.length) return "";
    return rec.waitGuidance.map(function (g) {
      var items = g.reasons.map(function (r) { return "<li>" + escapeHtml(r) + "</li>"; }).join("");
      return (
        '<div class="wait-guidance">' +
          '<div class="wait-title">' + escapeHtml(g.type) + "</div>" +
          "<ul>" + items + "</ul>" +
        "</div>"
      );
    }).join("");
  }

  function shortlistRole(s, rec) {
    if (rec.top && s.player.id === rec.top.player.id) return "TAKE";
    if (rec.altPosition && s.player.id === rec.altPosition.player.id) return "Alternative position";
    if (rec.bestValue && s.player.id === rec.bestValue.player.id) return "Best player available";
    if (rec.bestUpside && s.player.id === rec.bestUpside.player.id) return "Upside swing";
    return "Also consider";
  }

  function altListHtml(rec) {
    var alts = rec.shortlist.filter(function (s) { return !rec.top || s.player.id !== rec.top.player.id; });
    if (!alts.length) return "";
    var html = '<div class="rec-head">Alternatives</div><div class="alt-list">';
    alts.forEach(function (s) {
      var p = s.player;
      html +=
        '<div class="alt-item">' +
          '<div class="alt-main">' +
            '<div class="alt-name">' + escapeHtml(p.name) + "</div>" +
            '<div class="alt-sub">' +
              escapeHtml(shortlistRole(s, rec)) + " · " +
              escapeHtml(p.position) + " · Rk " + escapeHtml(p.rank) +
              " · " + escapeHtml(s.returnLabel) +
            "</div>" +
          "</div>" +
          '<div class="player-actions">' +
            '<button class="pick-btn ' + (rec.isUserPick ? "mine" : "other") + '" data-id="' + escapeHtml(p.id) + '" data-action="' + (rec.isUserPick ? "mine" : "other") + '">' + (rec.isUserPick ? "Draft to me" : "Mark drafted") + '</button>' +
          "</div>" +
        "</div>";
    });
    html += "</div>";
    return html;
  }

  function rosterHtml() {
    var mine = FS.myPickEntries(state).map(function (pick) {
      return pick.playerId == null
        ? { name: "Unlisted pick", position: pick.position, rank: Number.MAX_SAFE_INTEGER }
        : playersById[pick.playerId];
    }).filter(Boolean);
    var counts = FS.countsByPosition(mine);
    var assignment = FS.assignSlots(mine);

    var order = [
      { key: "QB", label: "QB", req: 1 },
      { key: "RB", label: "RB", req: 2 },
      { key: "WR", label: "WR", req: 2 },
      { key: "TE", label: "TE", req: 1 },
      { key: "FLEX", label: "FLEX", req: 1 },
      { key: "DST", label: "DST", req: 1 },
      { key: "K", label: "K", req: 1 }
    ];

    var html = '<div class="roster-head">Your roster (' + FS.totalStartersFilled(counts) + "/9 starters)</div>";
    html += '<div class="roster-grid">';
    order.forEach(function (o) {
      var list = assignment.slots[o.key] || [];
      if (list.length) {
        list.forEach(function (p) {
          html +=
            '<div class="roster-slot">' +
              '<span class="slot-pos">' + escapeHtml(o.label) + "</span>" +
              '<span class="pos-badge pos-' + escapeHtml(p.position) + '">' + escapeHtml(p.position) + "</span>" +
              '<span class="slot-player">' + escapeHtml(p.name) + "</span>" +
              '<span class="slot-pos">Rk ' + escapeHtml(p.rank) + "</span>" +
            "</div>";
        });
      } else if (counts[o.key] < o.req || o.key === "FLEX") {
        html +=
          '<div class="roster-slot">' +
            '<span class="slot-pos">' + escapeHtml(o.label) + "</span>" +
            '<span class="slot-player slot-empty">Open</span>' +
          "</div>";
      }
    });
    html += "</div>";

    if (assignment.bench.length) {
      var names = assignment.bench.map(function (p) { return escapeHtml(p.name); }).join(", ");
      html += '<div class="roster-bench">Bench: ' + names + "</div>";
    }
    return html;
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  function doPick(playerId, draftedByMe) {
    if (!state) return;
    var schedule = FS.myPickSchedule(FS.LEAGUE.teams, state.draftPosition, FS.LEAGUE.totalRounds);
    if (FS.isUserPick(schedule, state.currentOverallPick) !== !!draftedByMe &&
        !confirm("This is scheduled as " + (FS.isUserPick(schedule, state.currentOverallPick) ? "your" : "an opponent's") + " pick. Record it anyway?")) return;
    var result = FS.applyPick(state, playerId, draftedByMe);
    if (!result.ok) {
      toast(result.reason === "already-drafted" ? "Player already drafted." : "Draft is complete.", "error");
      return;
    }
    state = result.state;
    saveState();
    renderApp();
    if (FS.isComplete(state)) toast("Draft complete — 128 picks recorded.", "ok");
  }

  function doUnlistedPick() {
    if (!state) return;
    var schedule = FS.myPickSchedule(FS.LEAGUE.teams, state.draftPosition, FS.LEAGUE.totalRounds);
    var draftedByMe = FS.isUserPick(schedule, state.currentOverallPick);
    var position = draftedByMe ? window.prompt("Position for your unlisted pick (QB, RB, WR, TE, DST, or K):", "RB") : null;
    if (draftedByMe && position == null) return;
    if (position != null) position = position.trim().toUpperCase();
    var result = FS.applyUnlistedPick(state, draftedByMe, position);
    if (!result.ok) { toast("Draft is complete.", "error"); return; }
    state = result.state;
    saveState();
    renderApp();
    toast(draftedByMe ? "Unlisted pick drafted to you." : "Unlisted pick recorded.", "ok");
  }

  function doUndo() {
    if (!state) return;
    var result = FS.undo(state);
    if (!result.ok) {
      toast("Nothing to undo.", "error");
      return;
    }
    state = result.state;
    saveState();
    renderApp();
    toast("Undid last pick.", "ok");
  }

  function doReset() {
    var proceed = confirm("Start a new draft? This clears the current draft (you can Export first).");
    if (!proceed) return;
    clearState();
    renderSetup();
    toast("Draft cleared. Pick your slot.");
  }

  function doExport() {
    if (!state) { toast("No draft to export.", "error"); return; }
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "fantasysavior-draft.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("Draft exported.", "ok");
  }

  function doImportFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!isValidState(parsed)) {
          toast("Invalid draft file.", "error");
          return;
        }
        state = parsed;
        saveState();
        renderApp();
        toast("Draft imported.", "ok");
      } catch (e) {
        toast("Invalid JSON file.", "error");
      }
    };
    reader.readAsText(file);
  }

  // -------------------------------------------------------------------------
  // Event wiring
  // -------------------------------------------------------------------------
  function bindEvents() {
    $("slotPicker").addEventListener("click", function (e) {
      var btn = e.target.closest(".slot-btn");
      if (!btn) return;
      var slot = parseInt(btn.dataset.slot, 10);
      if (loadState() && !confirm("A draft is already in progress. Start over with slot " + slot + "?")) return;
      state = FS.createInitialState(slot);
      saveState();
      renderApp();
    });

    $("resumeBtn").addEventListener("click", function () {
      var existing = loadState();
      if (existing) {
        state = existing;
        renderApp();
      } else {
        toast("No saved draft to resume.", "error");
        renderSetup();
      }
    });

    $("undoBtn").addEventListener("click", doUndo);
    $("unlistedBtn").addEventListener("click", doUnlistedPick);
    $("resetBtn").addEventListener("click", doReset);
    $("exportBtn").addEventListener("click", doExport);

    $("importBtn").addEventListener("click", function () { $("importFile").click(); });
    $("setupImportBtn").addEventListener("click", function () { $("importFile").click(); });
    $("importFile").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) doImportFile(e.target.files[0]);
      e.target.value = "";
    });

    $("filters").addEventListener("click", function (e) {
      var btn = e.target.closest(".filter-btn");
      if (!btn) return;
      filter = btn.dataset.filter;
      renderBoard();
    });

    $("search").addEventListener("input", function (e) {
      searchQuery = e.target.value;
      renderBoard();
    });

    // Event delegation for both the board list and the copilot alternatives.
    $("boardList").addEventListener("click", function (e) {
      var btn = e.target.closest(".pick-btn");
      if (!btn) return;
      var row = e.target.closest(".player-row");
      if (!row) return;
      doPick(row.dataset.id, btn.dataset.action === "mine");
    });

    $("recommendation").addEventListener("click", function (e) {
      var btn = e.target.closest(".pick-btn");
      if (!btn) return;
      doPick(btn.dataset.id, btn.dataset.action === "mine");
    });
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  function boot() {
    loadData();
    bindEvents();

    var existing = loadState();
    if (existing) {
      state = existing;
      renderApp();
    } else {
      renderSetup();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

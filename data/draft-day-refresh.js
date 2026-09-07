/* FantasySavior — final draft-day data refresh overlay.
 * Snapshot: 2026-09-07 09:02 America/Phoenix.
 *
 * The baseline data/players.json remains the reproducible Sep 6 snapshot. This
 * small overlay captures only material late-breaking changes so the deployed
 * draft app can be refreshed safely without churning the whole board hours
 * before the live draft. Fold these changes into the next full dataset rebuild.
 */
(function () {
  "use strict";

  var data = window.FANTASY_SAVIOR_DATA;
  if (!data || !Array.isArray(data.players)) return;

  data.metadata = data.metadata || {};
  data.metadata.generatedAt = "2026-09-07T09:02:00-07:00";
  data.metadata.refreshBeforeDraft = false;
  data.metadata.refreshNote = "Final Sep 7 draft-day availability/role refresh; baseline ranks preserved except material late-breaking movers.";
  data.metadata.sources = [
    "FantasyPros 2026 standard overall/positional ECR and draft tiers; checked Sep 7 2026",
    "FantasyPros player news, injury monitor, sleepers and ADP; checked Sep 7 2026",
    "NFL.com injury/discipline updates; checked Sep 7 2026",
    "Reuters late-preseason injury reports; checked Sep 7 2026",
    "DraftSharks Week 1 injury update for TreVeyon Henderson; checked Sep 7 2026"
  ];

  var byId = {};
  data.players.forEach(function (p) { byId[p.id] = p; });

  function patch(id, values) {
    var p = byId[id];
    if (!p) return;
    Object.keys(values).forEach(function (key) { p[key] = values[key]; });
  }

  // MarShawn Lloyd's role changed materially after Josh Jacobs landed on the
  // commissioner's exempt list. Move Lloyd into the late-RB2/top-RB3 range
  // without creating duplicate ranks in the baseline board.
  data.players.forEach(function (p) {
    if (p.id !== "marshawn-lloyd" && p.rank >= 86 && p.rank < 104) p.rank += 1;
  });
  patch("marshawn-lloyd", {
    rank: 86,
    adp: 90,
    tier: 4,
    injuryStatus: null,
    availabilityRisk: "low",
    tags: ["sleeper", "upside", "market-riser", "starter-opportunity"]
  });

  // High-value availability corrections.
  patch("ja-marr-chase", {
    injuryStatus: "Knee - expected Week 1",
    availabilityRisk: "low",
    tags: ["elite", "injury-monitor"]
  });
  patch("breece-hall", {
    injuryStatus: "Groin - expected Week 1",
    availabilityRisk: "low",
    tags: ["injury-monitor"]
  });
  patch("malik-nabers", {
    injuryStatus: "ACL recovery - trending toward Week 1",
    availabilityRisk: "medium",
    tags: ["injury-monitor", "upside", "risk-medium"]
  });
  patch("rashee-rice", {
    injuryStatus: "Knee recovery - practicing 11-on-11; no NFL discipline",
    availabilityRisk: "low",
    tags: ["injury-monitor", "upside"]
  });
  patch("ashton-jeanty", {
    injuryStatus: "Ankle sprain - chance to return for Week 1",
    availabilityRisk: "medium",
    tags: ["injury-monitor", "risk-medium"]
  });
  patch("jeremiyah-love", {
    injuryStatus: "High ankle sprain - roughly 50/50 for Week 1",
    availabilityRisk: "medium",
    tags: ["injury-monitor", "landmine-at-cost", "risk-medium"]
  });

  // Chicago practice injuries from Sep 4.
  patch("d-andre-swift", {
    injuryStatus: "Core/midsection issue - status TBD",
    availabilityRisk: "medium",
    tags: ["injury-monitor", "risk-medium"]
  });
  patch("rome-odunze", {
    injuryStatus: "Right-leg issue - preliminary reports encouraging",
    availabilityRisk: "low",
    tags: ["injury-monitor"]
  });
  patch("kyle-monangai", {
    injuryStatus: "Knee issue - monitor",
    availabilityRisk: "medium",
    tags: ["injury-monitor", "risk-medium"]
  });

  // Week 1 trend changes.
  patch("treveyon-henderson", {
    injuryStatus: "Ankle - DNP; Week 1 trending doubtful",
    availabilityRisk: "high",
    tags: ["injury-monitor", "avoid-at-cost", "risk-high"]
  });
  patch("rhamondre-stevenson", {
    injuryStatus: null,
    availabilityRisk: "low",
    tags: ["sleeper", "week1-opportunity"]
  });
  patch("emeka-egbuka", {
    injuryStatus: "Toe sprain - Week 1 uncertain",
    availabilityRisk: "medium",
    tags: ["injury-monitor", "risk-medium"]
  });
  patch("george-kittle", {
    injuryStatus: "Achilles recovery - activated and practicing",
    availabilityRisk: "low",
    tags: ["injury-monitor"]
  });
  patch("sam-laporta", {
    injuryStatus: "Hip - returned to practice",
    availabilityRisk: "low",
    tags: ["injury-monitor"]
  });
  patch("alec-pierce", {
    injuryStatus: "Activated from PUP after ankle surgery; Week 1 goal",
    availabilityRisk: "medium",
    tags: ["injury-monitor", "risk-medium"]
  });
  patch("jonathon-brooks", {
    injuryStatus: "Knee soreness - coach optimistic for Week 1",
    availabilityRisk: "medium",
    tags: ["injury-monitor", "upside", "risk-medium"]
  });
  patch("patrick-mahomes", {
    injuryStatus: "Knee/ACL recovery - on track for Week 1",
    availabilityRisk: "low",
    tags: ["injury-monitor", "late-qb"]
  });
  patch("christian-watson", {
    injuryStatus: null,
    availabilityRisk: "low",
    tags: ["sleeper", "upside"]
  });

  // Players who should not be treated like ordinary healthy late-round darts.
  patch("josh-jacobs", {
    injuryStatus: "Commissioner's exempt list - cannot practice/play; court Sep 10",
    availabilityRisk: "severe",
    tags: ["availability-risk", "market-lag-risk", "avoid-at-cost", "risk-severe"]
  });
  patch("zach-charbonnet", {
    injuryStatus: "Reserve/PUP - knee; out at least first 4 games",
    availabilityRisk: "severe",
    tags: ["availability-risk", "pup", "avoid-at-cost", "risk-severe"]
  });
  patch("jordyn-tyson", {
    injuryStatus: "IR - hamstring; expected to miss roughly two months",
    availabilityRisk: "severe",
    tags: ["injured-reserve", "market-lag-risk", "risk-severe"]
  });
  patch("jadarian-price", {
    injuryStatus: null,
    availabilityRisk: "low",
    tags: ["sleeper", "upside", "starter-opportunity"]
  });

  // Small current positional-board corrections.
  if (byId["denver-broncos-dst"] && byId["los-angeles-rams-dst"]) {
    byId["denver-broncos-dst"].rank = 126;
    byId["los-angeles-rams-dst"].rank = 127;
  }
  if (byId["cam-little"] && byId["jason-myers"]) {
    byId["cam-little"].rank = 144;
    byId["jason-myers"].rank = 145;
  }

  data.players.sort(function (a, b) { return a.rank - b.rank; });
})( );

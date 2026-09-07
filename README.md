# FantasySavior

A mobile-first fantasy football draft copilot built to help make good picks quickly without needing to spend the offseason following every NFL storyline.

The immediate goal is simple: **be useful during a live fantasy draft on a Samsung Galaxy Z Fold 5**.

FantasySavior is intentionally starting as a focused, local-first draft assistant rather than a full fantasy platform. The first version should be fast, reliable, easy to operate with one hand, and useful even if league-platform integration is unavailable.

## MVP goal

For each pick, FantasySavior should answer two questions:

1. **Who should I take now?**
2. **Who can I probably wait on until my next pick?**

The user manually marks players as drafted. FantasySavior tracks the remaining player pool, the user's roster, positional tiers, roster needs, ADP/ECR value, and the number of picks until the user's next turn.

## Initial league preset

The first release is optimized for the league it is being built for:

- 8 teams
- Snake draft
- Standard / non-PPR scoring
- 1 QB
- 2 RB
- 2 WR
- 1 TE
- 1 FLEX (RB/WR/TE)
- 1 DST
- 1 K
- 7 bench spots
- 1 IR spot
- 16 drafted roster spots per team
- 128 total draft selections

Draft position is entered shortly before the draft and is **not** hard-coded.

Future versions may expose all league settings as configuration.

## Core MVP features

- Mobile-first responsive UI, designed around the unfolded Galaxy Z Fold 5
- Player board with search and position filters
- One-tap actions for:
  - Drafted by another team
  - Drafted by me
  - Undo last action
- Live user roster tracking
- Automatic snake-draft pick calculation after entering draft position
- Best-player recommendations tailored to current roster and league format
- Player tiers and tier-depletion warnings
- ADP and consensus-ranking value indicators
- Estimated chance a player survives until the user's next pick
- Position scarcity / replacement-value awareness
- Strong late-round bias toward upside rather than low-ceiling depth
- Kicker and DST suppression until late rounds unless the board creates an unusual value case
- Local persistence so an accidental refresh does not destroy the draft
- Export/import draft state as JSON for emergency recovery
- Offline-capable draft experience once player data is loaded

## Draft philosophy

FantasySavior should not blindly fill empty roster slots or simply sort by a single ranking list.

For an 8-team standard league:

- Elite difference-makers matter more than replacement-level depth.
- Early rounds should favor talent and value over rigid positional need.
- Standard scoring should favor touchdown and yardage production over reception-dependent value.
- QB and TE should distinguish true positional advantages from merely adequate starters.
- Bench selections should favor upside because usable replacement players should remain available in a shallow league.
- Kicker and DST should generally be delayed until the final rounds.

See [`docs/DRAFT_STRATEGY.md`](docs/DRAFT_STRATEGY.md) for the initial recommendation model.

## Proposed MVP architecture

Keep the emergency first build boring and dependable:

```text
/
├── README.md
├── AGENTS.md
├── ROADMAP.md
├── docs/
│   ├── ARCHITECTURE.md
│   └── DRAFT_STRATEGY.md
├── data/
│   └── players.json
├── index.html
├── app.js
├── styles.css
└── manifest.json
```

A small vanilla web app / PWA is preferred for the first usable version unless implementation proves that a framework materially reduces risk.

No backend is required for the MVP.

## Player data

The initial player dataset should be a static snapshot refreshed shortly before the draft and stored locally.

Minimum useful fields:

```json
{
  "id": "stable-player-id",
  "name": "Example Player",
  "team": "ARI",
  "position": "RB",
  "bye": 8,
  "rank": 20,
  "adp": 25.4,
  "tier": 3,
  "injuryStatus": null,
  "tags": ["upside"]
}
```

The app should never depend on a live network request to make a pick once the draft has started.

## Non-goals for the first draft-day release

Do **not** block the MVP on:

- ESPN/Yahoo/Sleeper authentication
- Automatic live draft synchronization
- User accounts
- Cloud persistence
- Season-long lineup optimization
- Waiver-wire tools
- Trade analysis
- AI/LLM chat
- Push notifications
- A backend service
- Supporting every possible league format

Those can come later if the draft assistant proves useful.

## Development priority

The order is intentionally ruthless:

1. Accurate player dataset
2. Draft-state tracking
3. Snake-pick math
4. Fast available-player UI
5. Recommendation ranking
6. Fold-friendly layout
7. Persistence + undo
8. Polish

If a feature threatens reliability during the live draft, cut it.

## Status

**MVP implemented (Phases 1–4).** The local-first vanilla web app is functional:
draft-state engine, snake-pick math, player board with search/filters, recommendation
engine, Fold-aware two-column layout, persistence, undo, and JSON import/export are all
in place. A small Node test suite covers snake picks (slots 1/4/5/8), undo, draft
exclusion, K/DST suppression, and a full 128-pick mock draft.

Remaining before the live draft: on-device verification on the Galaxy Z Fold 5 and a
final data refresh (rankings/ADP/injury) shortly before the draft (Phase 5).

The first real-world test is the 2026 family fantasy draft.
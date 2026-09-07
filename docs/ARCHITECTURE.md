# Architecture

FantasySavior's first release is intentionally a local-first mobile web app. The architecture should optimize for reliability during a live draft rather than long-term platform ambition.

## Design goals

1. **No network dependency during the live draft.**
2. **Fast enough to operate between picks.**
3. **Easy recovery from mistakes or refreshes.**
4. **Responsive layout that takes advantage of the Galaxy Z Fold 5 inner display.**
5. **Simple enough to implement and verify before the first live test.**

## Recommended stack for v0.1

- HTML
- CSS
- Vanilla JavaScript
- Local static JSON player dataset
- `localStorage` for draft state
- PWA manifest/service worker only if it can be added without risking the core workflow

A framework is not prohibited, but it should only be introduced if it clearly lowers implementation risk.

## Runtime model

The app can be thought of as four layers:

```text
Player dataset
    ↓
Draft state store
    ↓
Recommendation engine
    ↓
Responsive UI
```

### Player dataset

A static snapshot under `data/players.json`.

Responsibilities:

- Identity
- Team and position
- Standard-scoring rank / ECR
- ADP
- Tier
- Bye week
- Injury/status information when available
- Optional hand-curated tags

Player data is read-only during a draft.

`data/players.json` is the human-editable source of truth. It is embedded at build time
into `data/players.data.js` (via `scripts/embed-data.js`) as a browser global so the app
has no runtime fetch and works offline and from `file://` after load.

### Draft state store

The single source of truth for the active draft.

Suggested shape:

```js
{
  version: 1,
  league: {
    teams: 8,
    scoring: "standard",
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
  },
  draftPosition: 6,
  currentOverallPick: 1,
  picks: [
    {
      overall: 1,
      playerId: "player-id",
      draftedByMe: false
    }
  ],
  myPlayerIds: [],
  undoStack: []
}
```

Derived values should not be persisted when they can be recomputed cheaply.

Examples of derived state:

- Available players
- Current round
- Picks until user's next turn
- User roster slot assignment
- Remaining players per tier
- Recommendation scores

### Recommendation engine

The recommendation engine should be a pure function where practical:

```js
recommend({ players, draftState, leagueConfig })
```

This makes the logic easy to test independently from the UI.

The engine should output a ranked shortlist plus explanations, not just a number:

```js
[
  {
    playerId: "...",
    score: 93.2,
    reasons: [
      "Best value remaining",
      "Only 2 RBs remain in this tier",
      "Unlikely to return at your next pick"
    ],
    returnProbability: 0.18
  }
]
```

See `DRAFT_STRATEGY.md` for the initial scoring philosophy.

## Snake-draft math

For an `N`-team snake draft and draft slot `S`, each round's user pick can be calculated without storing a complete schedule.

For round `r` (1-indexed):

- Odd round pick within round = `S`
- Even round pick within round = `N - S + 1`
- Overall pick = `(r - 1) * N + pickWithinRound`

For the current league, `N = 8`.

Example for slot 6:

```text
Round 1: 6
Round 2: 11
Round 3: 22
Round 4: 27
Round 5: 38
Round 6: 43
...
```

Precompute all 16 user selections as soon as the draft position is entered.

## Draft actions

Every player selection in the UI should resolve to one of two mutations:

```text
DRAFTED BY OTHER
DRAFTED BY ME
```

Both actions:

- Remove the player from the available pool
- Append a pick record
- Advance the overall pick
- Persist state
- Recalculate recommendations

`DRAFTED BY ME` additionally adds the player to the user's roster.

### Undo

Undo is a first-class feature, not polish.

The easiest safe implementation is to preserve enough information for each mutation to be reversed exactly. A single-level undo is acceptable for the first live version; multi-step undo is preferable if trivial to support.

## Roster representation

Do not permanently assign players to starting slots when drafted. Store the user's players and derive an optimal display assignment.

Reason: a third RB might currently occupy FLEX, but later roster changes can alter the most sensible visual slot.

Suggested assignment order for display:

1. Mandatory QB
2. Mandatory RB slots
3. Mandatory WR slots
4. Mandatory TE
5. FLEX using best remaining RB/WR/TE
6. Bench

This assignment is visual only and has no effect on recommendation value except through roster composition calculations.

## Recommendation data flow

On every draft mutation:

```text
Draft action
  ↓
Update state
  ↓
Persist state
  ↓
Compute available players
  ↓
Compute current roster composition
  ↓
Compute positional tier depletion
  ↓
Compute next user pick
  ↓
Score available players
  ↓
Render shortlist + explanations
```

This should be fast enough to execute synchronously for a dataset of a few hundred players.

## Responsive UI

### Fold inner display

Primary layout: two columns.

**Left:** player board

- Search
- Position filters
- Rank / ADP / tier
- Draft actions

**Right:** copilot

- Current pick / round
- Next user pick
- Recommended player
- Alternatives
- Reasons
- User roster

### Narrow / outer display

Collapse to one column with the recommendation card above or sticky-near the available-player list.

The app should never require hover.

Touch targets should be large enough to use quickly during a timed pick.

## Persistence

Use a versioned storage key such as:

```text
fantasy-savior:draft:v1
```

Persist after every mutation.

At startup:

1. Load player dataset
2. Look for compatible draft state
3. Offer resume/new draft when previous state exists

## Import / export

Allow the complete draft state to be exported as JSON and imported later.

This protects against:

- Browser data loss
- Device switching
- Corrupt state after a bug
- Emergency recovery during the live draft

Validation is required before importing.

## Offline behavior

The core app must continue functioning if the network disappears after load.

At minimum, this means:

- No live API required for recommendation logic
- Player data shipped with the app
- No remote assets required for essential controls

A service worker can make startup offline-capable, but it is lower priority than core draft reliability.

## Testing priorities

Before the first live draft, test these paths manually:

1. New draft from each draft slot 1–8
2. Correct snake pick sequence
3. Drafted-by-other removes player
4. Drafted-by-me updates roster
5. Undo restores exact previous state
6. Refresh preserves state
7. Position filters never show drafted players
8. Recommendations update after every pick
9. K/DST are suppressed early
10. UI remains usable on unfolded Fold dimensions and a normal narrow phone viewport

## Future architecture

Only after the local draft workflow proves useful should the project consider:

- League provider integrations
- Backend services
- User accounts
- Live projections
- Season-long modules
- Cloud sync
- LLM-generated explanations

The local recommendation engine should remain usable even if those future services fail.
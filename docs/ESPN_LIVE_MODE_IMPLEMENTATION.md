# ESPN Live Mode — Last-Minute Implementation Plan

**Owner:** implementation engineer
**Priority:** draft-day enhancement, secondary to the known-good manual flow
**Target:** September 7, 2026 live ESPN family draft
**Mode:** read-only ESPN ingestion; FantasySavior never submits picks to ESPN

## Executive direction

Implement an **optional ESPN Live Mode** that reads completed picks from the user's ESPN draft and feeds them into the existing FantasySavior state engine automatically.

The user should be able to run the ESPN Fantasy app and FantasySavior side-by-side on the Galaxy Z Fold 5. ESPN remains the place where picks are actually made. FantasySavior is only a read-only copilot.

The existing manual draft path is the safety net and must remain fully functional. Do not refactor or replace the recommendation engine. Do not implement auto-pick. Do not introduce a service worker. Do not store ESPN credentials in GitHub, browser localStorage, the Pages bundle, or client-side JavaScript.

## Delivery rule

**Reliability beats completeness.**

If live ingestion becomes uncertain, stop the live sync and fall back to the already-working manual mode. A partially automated assistant that can desynchronize silently is worse than the current manual app.

---

# 1. Important ESPN constraint: validate before assuming

Current 2026 community evidence is conflicting:

- The current `Public-ESPN-Fantasy-API` documentation and at least one 2026 live-draft implementation report that `mDraftDetail` exposes the draft order pre-draft and updates `playerId` values as picks occur.
- Another current reverse-engineering project reports that `mDraftDetail` does not become useful until after the draft and that ESPN's live room uses a separate undocumented transport.

Therefore the implementation must treat `mDraftDetail` live behavior as a **runtime capability to prove**, not an assumption.

Primary endpoint to probe:

```text
GET https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/{LEAGUE_ID}?view=mDraftDetail
```

Private leagues require ESPN session cookies:

```text
espn_s2
SWID
```

Expected useful pick fields:

```text
overallPickNumber
roundId
roundPickNumber
teamId
playerId
```

A pre-draft board may contain placeholder entries with `playerId = -1`. Treat only positive player IDs as completed picks.

## Time-boxed capability spike

Do this **before building the UI integration**:

1. Implement the ESPN request helper and a probe command.
2. Confirm the league request authenticates.
3. Log only sanitized draft metadata: response status, `drafted`, `inProgress`, pick count, completed-pick count, and the first few pick shapes.
4. Never print `espn_s2`, `SWID`, the Cookie header, or the full private response.
5. If the pre-draft response contains ordered pick slots, confirm their `overallPickNumber` values are sane.
6. When a real/mock pick becomes available, confirm the endpoint reflects it within a few seconds.

**Go/no-go:**

- If `mDraftDetail` updates live: proceed with the plan below.
- If it does not: leave Manual Mode intact and stop. Do not burn draft-day time reverse-engineering ESPN's websocket/DOM protocol unless specifically directed.

The live feature must fail closed into Manual Mode.

---

# 2. Architecture

For draft day, use a **local same-origin Python bridge** running on the user's Ubuntu machine.

Do not make the GitHub Pages build talk directly to private ESPN endpoints. Browser auth/CORS/third-party-cookie behavior is unnecessary risk, and the ESPN session cookie must not be exposed to client code.

During the live draft the user will open FantasySavior from the local bridge URL instead of GitHub Pages:

```text
ESPN app on Fold
       │
       │ user makes picks
       ▼
ESPN live draft
       │
       │ read-only polling
       ▼
Ubuntu Python bridge
  ├─ serves FantasySavior static files
  └─ exposes sanitized /api/espn/draft
       │
       │ same-origin HTTP
       ▼
FantasySavior in Fold browser pane
       │
       └─ existing engine + recommendation UI
```

The user already proved that serving FantasySavior over the LAN works. Reuse that deployment model.

## Why this architecture

- ESPN credentials remain only on the trusted local computer.
- No GitHub secret handling or cloud backend is required hours before the draft.
- No mixed-content problem: static app and API come from the same local origin.
- No cross-origin credential logic in the browser.
- The current vanilla app remains deployable to Pages unchanged for Manual Mode.
- The bridge can disappear without corrupting the saved draft; the UI falls back to manual entry.

---

# 3. Required files

Implement the smallest possible surface area.

```text
server/
  espn_live_server.py
  .env.example

live-sync.js
```

Modify only as needed:

```text
index.html
app.js
styles.css
.gitignore
README.md or docs/ARCHITECTURE.md
```

Do not move the existing engine or convert the app to a framework.

## `server/espn_live_server.py`

Use Python 3 standard library only if practical. Avoid adding Flask/FastAPI/npm dependencies for this draft-day version.

Responsibilities:

1. Serve the repository's static files exactly like `python3 -m http.server`.
2. Read local ESPN configuration from `server/.env` or process environment.
3. Poll/fetch ESPN using server-side Cookie headers.
4. Return a **sanitized normalized draft payload** to the client.
5. Optionally cache the ESPN player directory for ID-to-name/position mapping.
6. Provide a simple health endpoint.

Recommended config:

```text
ESPN_LEAGUE_ID=123456789
ESPN_SEASON=2026
ESPN_S2=<secret>
ESPN_SWID={...}
PORT=8787
```

Add `server/.env` to `.gitignore`.

`server/.env.example` must contain placeholders only.

### Required server endpoints

```text
GET /api/health
GET /api/espn/draft
```

`/api/health` example:

```json
{
  "ok": true,
  "espnConfigured": true,
  "season": 2026,
  "leagueId": "123456789"
}
```

`/api/espn/draft` should return only what the browser needs:

```json
{
  "ok": true,
  "fetchedAt": "2026-09-07T17:05:00Z",
  "inProgress": true,
  "drafted": false,
  "picks": [
    {
      "overall": 1,
      "round": 1,
      "roundPick": 1,
      "teamId": 4,
      "espnPlayerId": 12345,
      "name": "Jahmyr Gibbs",
      "position": "RB"
    }
  ]
}
```

Do not return cookies, owner IDs, emails, authentication headers, or unrelated league payload.

---

# 4. ESPN player-ID resolution

FantasySavior uses its own string IDs; ESPN draft picks use numeric ESPN player IDs.

Do **not** hard-code 156 ESPN IDs by hand.

Preferred draft-day implementation:

1. The local bridge fetches ESPN's current player pool once at startup or first use.
2. Build an in-memory map:

```text
ESPN playerId -> fullName + default position + pro team metadata
```

3. Enrich draft picks before returning them from `/api/espn/draft`.
4. The browser maps the normalized ESPN name/position to FantasySavior's dataset.

For ordinary players, use conservative normalization:

- lowercase,
- normalize punctuation/apostrophes/hyphens,
- normalize whitespace,
- tolerate Jr./Sr./II/III suffix differences.

For D/ST, special-case team naming. ESPN may represent a defense as `Texans D/ST` while FantasySavior stores `Houston Texans`. Reduce both to a stable team nickname key before matching.

**Never fuzzy-match an ambiguous player automatically.**

If a completed ESPN pick cannot be matched with high confidence:

- record it as an unlisted pick,
- preserve its ESPN-reported position,
- continue syncing,
- show a non-blocking warning in the UI.

An unresolved opponent pick must not stall the draft.

---

# 5. Client-side live sync controller

Create `live-sync.js` as a small adapter. It must not own recommendation logic.

Conceptual interface:

```js
LiveSync = {
  start(),
  stop(),
  pollNow(),
  status(),
  isActive()
}
```

Polling policy:

```text
not yet in progress: every 10 seconds
active draft: every 3 seconds
transient error: retry with bounded backoff, max 10 seconds
```

Do not poll faster than necessary.

## Processing algorithm

Every poll:

1. Fetch `/api/espn/draft`.
2. Sort completed ESPN picks by `overall`.
3. Ignore placeholder rows where player ID is absent/negative.
4. Determine which picks FantasySavior has not processed yet.
5. Process missing picks strictly in ascending overall-pick order.
6. Require:

```text
incoming overall === state.currentOverallPick
```

before applying a new event.

7. Resolve the player into the FantasySavior pool.
8. Determine `draftedByMe` from the existing FantasySavior snake schedule and the user's configured draft slot.
9. For a resolved player, call the existing `applyPick()` path.
10. For an unresolved player, call `applyUnlistedPick()` with position metadata when required.
11. Persist after each applied event or after the complete batch.
12. Re-render once the batch is reconciled.

Do not bypass the engine and mutate `state.picks` directly.

---

# 6. Reconciliation and desynchronization rules

This is the most important correctness requirement.

ESPN is authoritative for Live Mode. FantasySavior is authoritative only when live sync is paused/manual.

## Starting Live Mode with an empty state

If FantasySavior has zero picks and ESPN already has picks:

- replay ESPN picks from pick 1 through the latest completed pick,
- use the existing engine mutations,
- then enter continuous polling.

## Starting Live Mode with an existing local draft

Compare local and ESPN picks by overall number before making any mutation.

If all existing local picks match the ESPN history, begin syncing after the last matched pick.

If a mismatch exists:

```text
SYNC CONFLICT AT PICK 34
FantasySavior: Player A
ESPN: Player B
```

Then:

- stop auto-sync,
- do not overwrite local state silently,
- show a visible conflict status,
- provide a simple `Return to Manual Mode` action.

Do not attempt clever automatic repair during the live draft.

## Undo behavior

While ESPN Live Mode is active, disable normal Undo or clearly explain that ESPN will reapply the authoritative pick on the next poll.

Preferred last-minute behavior:

- disable Undo while connected,
- allow `Pause Live Sync`,
- once paused, manual controls and Undo behave normally.

---

# 7. UI requirements

Keep the UI compact. The live feature is operational status, not a new dashboard.

Add a small status control near the existing draft status:

```text
ESPN LIVE: OFF
ESPN LIVE: CONNECTING…
ESPN LIVE: SYNCED · Pick 37
ESPN LIVE: DEGRADED · retrying
ESPN LIVE: AUTH FAILED
ESPN LIVE: CONFLICT
```

When the local bridge is not present, the feature should quietly show manual/offline mode rather than throw errors.

## User controls

Required:

```text
Connect ESPN
Pause Live Sync
Return to Manual Mode
```

Do not expose ESPN cookies in the UI.

## Manual controls while connected

When sync is healthy:

- disable `Mark drafted`, `Draft to me`, and `Unlisted / Skip Pick`, or visually move them behind a `Manual override` state,
- disable Undo,
- leave search/filter/recommendation interactions fully usable.

When sync is paused or failed:

- restore all current manual controls immediately.

The user must never be trapped waiting for ESPN sync while on the clock.

---

# 8. Failure behavior

Implement explicit failure classes.

## Network/transient ESPN error

Examples: timeout, DNS, 500.

Behavior:

- keep current state,
- show yellow/degraded status,
- retry,
- do not switch to manual automatically on a single failure.

## Auth failure

Examples: ESPN 401/403, expired cookies.

Behavior:

- stop live polling,
- show `ESPN AUTH FAILED — MANUAL MODE AVAILABLE`,
- restore manual controls,
- never clear existing picks.

## Unsupported ESPN response/live endpoint does not update

Behavior:

- stop live mode,
- log a sanitized diagnostic,
- return to manual operation.

Do not attempt screen OCR, Android Accessibility, or auto-pick as part of this task.

---

# 9. Security requirements

These are non-negotiable.

- `espn_s2` is equivalent to a session credential. Never commit it.
- Never put ESPN credentials in client-side JavaScript.
- Never put credentials in localStorage.
- Never include credentials in exported FantasySavior draft-state JSON.
- Never print credentials or Cookie headers to logs.
- `.env` must be gitignored before any local credential file is created.
- The bridge is read-only. It must issue only GET requests to ESPN.
- Do not implement pick submission.

If a secret is accidentally committed, stop work and rotate it immediately.

---

# 10. Tests

Do not rely on the live ESPN service for the unit suite.

Add deterministic fixtures representing at least these ESPN payloads:

```text
pre-draft placeholders with playerId = -1
first completed pick
multiple completed picks arriving in one poll
unmatched player
opponent pick
user pick
transient server error
401/403 auth error
out-of-order picks in response
local/ESPN conflict
```

## Required unit/integration assertions

- New ESPN picks are applied exactly once.
- Repeating the same ESPN response is idempotent.
- Multiple new picks in one poll apply in correct order.
- `currentOverallPick` ends at latest ESPN completed pick + 1.
- Resolved ESPN players are removed from availability.
- User ESPN pick enters the user's roster.
- Unresolved opponent pick advances the draft without consuming a listed player.
- Unresolved user pick carries ESPN position into roster math.
- A pick-number gap stops sync rather than silently skipping.
- A local/ESPN mismatch stops sync rather than overwriting local history.
- ESPN failures never erase draft state.
- Manual Mode still works when the bridge is unavailable.

Run the existing engine tests unchanged as part of the gate.

---

# 11. Implementation sequence

Follow this order. Do not parallelize into UI polish before the data path works.

## Step 0 — finish Issue #1

Fix the remaining current-build UI blockers and leave Manual Mode known-good.

## Step 1 — build and prove the ESPN probe

Implement bridge auth/request logic and verify the current league's `mDraftDetail` response.

Do not touch draft state yet.

## Step 2 — normalized bridge endpoint

Return sanitized completed picks and player metadata from `/api/espn/draft`.

Add fixture tests for response parsing.

## Step 3 — build `live-sync.js`

Implement polling, idempotency, strict pick sequencing, mapping, and conflict detection.

Test against mocked bridge responses.

## Step 4 — wire to existing state engine

Use `applyPick()` / `applyUnlistedPick()` only. Confirm recommendations update automatically after external picks.

## Step 5 — add minimal UI status and pause/manual fallback

Do not spend time redesigning the board.

## Step 6 — full mock replay

Feed a completed 128-pick fixture through LiveSync in irregular batches (1 pick, 3 picks, repeated response, etc.). Final FantasySavior state must equal a manual replay of the same draft.

## Step 7 — real-device smoke test

On the Galaxy Z Fold 5:

1. Open ESPN Fantasy app in one pane.
2. Open `http://<ubuntu-lan-ip>:8787/` in the other pane.
3. Confirm `ESPN LIVE: SYNCED`.
4. Verify FantasySavior remains usable while folded/unfolded.
5. Confirm no accidental horizontal overflow.
6. Confirm manual fallback is one tap away.

---

# 12. Draft-day go/no-go checklist

**GO with ESPN Live Mode only if all are true:**

- Issue #1 is closed.
- Existing engine tests pass.
- ESPN bridge authenticates without exposing credentials.
- `mDraftDetail` is proven to reflect a completed pick during the live draft lifecycle.
- Duplicate polls do not duplicate picks.
- A 128-pick fixture/replay passes.
- Conflict detection stops rather than corrupts state.
- Manual fallback works immediately.
- Phone can reach the Ubuntu bridge over LAN.
- Ubuntu machine is configured not to sleep during the draft.

**NO-GO / use Manual Mode if any of these occur:**

- ESPN live endpoint does not update reliably.
- Authentication cannot be made stable.
- Player mapping is removing incorrect listed players.
- Local state becomes more than one pick out of sync during testing.
- The local server cannot be reached reliably from the Fold.

Do not risk the actual draft to debug the live transport.

---

# 13. Explicitly out of scope for today

Do not implement any of the following before this draft:

- submitting ESPN draft picks,
- Android screen capture/OCR,
- Android Accessibility scraping,
- Chrome extension injection,
- websocket reverse engineering,
- cloud credential storage,
- account login UI,
- opponent roster strategy,
- auto-pick,
- provider abstraction beyond what is required to keep manual mode separate.

Those can become post-draft projects if Live Mode proves valuable.

---

# 14. Definition of done

The feature is complete when the user can make picks only in ESPN while FantasySavior, running beside ESPN on the Fold, automatically:

1. notices completed ESPN selections,
2. removes drafted players from its board,
3. records the user's own selections in its roster,
4. advances the overall pick correctly,
5. recomputes recommendations without manual draft-entry taps,
6. visibly reports sync health,
7. and can immediately fall back to the existing manual workflow without losing state.

That is the entire target for today.
# Release Blockers — 2026 Draft-Day MVP

**Status: BLOCKED for live draft use until all P0/P1 release gates below are resolved and verified.**

This document captures the draft-day correctness and resilience issues found during the pre-release review of the FantasySavior MVP. The codebase architecture is sound and does not need a rewrite; these are targeted blockers that should be fixed before trusting the app during a timed live draft.

## Release gate

Do not treat the MVP as draft-day ready until all four release blockers below are complete, tested, and verified on the deployed GitHub Pages build.

---

## P0 — Fix return-horizon logic when the user is on the clock

### Problem

The recommendation engine currently uses `nextUserPick(schedule, currentOverallPick)` as the horizon for the player's return probability.

`nextUserPick()` is inclusive: if `currentOverallPick` is one of the user's scheduled selections, it returns the current pick. That behavior is valid for answering "when am I next on the clock?" but wrong for answering "if I pass on this player now, will he still be there at my next opportunity?"

Example for draft slot 6:

```text
User picks: 6, 11, 22, 27, ...
Current overall pick: 11
Current implementation return horizon: 11
Correct return horizon: 22
```

This can make the app substantially overestimate the chance that a player will return and directly corrupt the MVP's primary recommendation feature.

### Required fix

Represent the two concepts separately:

- **Upcoming/current user pick** — useful for UI status and detecting whether it is the user's turn.
- **Following user pick** — the next opportunity after the current selection, used for "will this player return?" when the user is currently on the clock.

When `currentOverallPick` equals a scheduled user pick, the return-probability horizon must advance to the next scheduled user pick after it.

When it is not the user's turn, the horizon may remain the upcoming scheduled user pick.

### Acceptance criteria

- [ ] At slot 6, overall pick 11 uses pick 22 as the return horizon.
- [ ] At slot 6, overall pick 12 uses pick 22 as the return horizon.
- [ ] At slot 1, overall pick 16 uses pick 17 as the return horizon.
- [ ] At the user's final scheduled selection, the engine handles the absence of a later return horizon without NaN/Infinity or misleading guidance.
- [ ] The UI clearly distinguishes **YOUR PICK NOW** from **NEXT OPPORTUNITY** when appropriate.

### Required regression tests

Add tests that explicitly validate recommendation-horizon behavior at:

- a user's current pick,
- a non-user pick between turns,
- a turn at a snake corner,
- the user's final draft pick.

---

## P0 — Add an unlisted/unknown pick action

### Problem

The draft can only advance by selecting a player that exists in the local dataset.

The dataset is intentionally larger than the draft pool, but a casual family league can still draft a player outside the 156 included entries. If that happens, the app currently has no correct way to advance the overall pick.

Failing to record that pick desynchronizes:

- current overall pick,
- current round,
- user's next pick,
- return estimates,
- ADP-value calculations,
- roster timing.

Using an unrelated listed player as a placeholder is not acceptable because it falsely removes that player from the available pool.

### Required fix

Add a clear action such as:

```text
Unlisted / Skip Pick
```

It should record a reversible draft event without removing any listed player.

Suggested state shape:

```js
{
  overall: 84,
  playerId: null,
  draftedByMe: false,
  unlisted: true
}
```

The exact representation may differ as long as it is version-safe and undoable.

### Acceptance criteria

- [ ] An unlisted opponent pick advances `currentOverallPick` by exactly one.
- [ ] No listed player is removed from availability.
- [ ] Undo restores the exact previous state.
- [ ] Export/import preserves unlisted picks.
- [ ] A full 128-pick mock draft can include multiple unlisted picks without state corruption.

### Required regression tests

- [ ] Record one unlisted pick and undo it.
- [ ] Record several unlisted picks during a mock draft.
- [ ] Export/import a state containing unlisted picks.

---

## P1 — Make Mine/Other actions schedule-aware

### Problem

Every listed player currently exposes both `Other` and `Mine`, regardless of whether the known snake schedule says the current pick belongs to the user.

This makes a single mis-tap capable of corrupting both roster ownership and draft timing.

Examples:

- Pressing `Mine` on another manager's pick adds a player incorrectly to the user's roster.
- Pressing `Other` on the user's scheduled pick advances past the user's turn without warning.

Undo can recover the error only if the user notices immediately.

### Required fix

Use the precomputed snake schedule to make the UI aware of whose turn it is.

Recommended behavior:

**Opponent pick:**

```text
OTHER TEAM PICK
[Mark drafted]
[Unlisted / Skip Pick]
```

**User pick:**

```text
YOUR PICK #11
[DRAFT TO ME]
```

At minimum, contradictory ownership actions must require an explicit warning/confirmation rather than silently succeeding.

### Acceptance criteria

- [ ] The app can determine whether `currentOverallPick` belongs to the user.
- [ ] On the user's pick, `Mine` is the primary/only normal ownership action.
- [ ] On opponent picks, `Other` is the primary/only normal ownership action.
- [ ] Contradictory ownership cannot silently advance the draft.
- [ ] The current-turn state remains obvious on the unfolded Fold layout.

### Required regression tests

- [ ] Verify ownership state at all 16 scheduled user picks for at least one draft slot.
- [ ] Verify the two snake-turn corners for slot 1 and slot 8.
- [ ] Verify a contradictory ownership attempt is blocked or explicitly confirmed.

---

## P1 — Surface and verify player-data freshness

### Problem

The source dataset includes metadata such as `generatedAt` and `refreshBeforeDraft`, but the UI currently loads only the player list and does not show when the embedded data was generated.

The deployed app reads `data/players.data.js`, which is generated separately from `data/players.json` by:

```bash
node scripts/embed-data.js
```

A final rankings/injury refresh can therefore update `players.json` while accidentally leaving the deployed embedded dataset stale.

### Required fix

Expose the embedded dataset metadata in the UI, preferably near the draft status.

Example:

```text
2026 STANDARD · 8 TEAMS
DATA: Sep 7, 4:52 PM
```

If the metadata says a refresh is recommended or the snapshot is older than the intended draft-day snapshot, show a visible warning.

Also add a deterministic verification that `players.data.js` matches the current `players.json` source before deployment.

### Acceptance criteria

- [ ] The deployed UI visibly shows the embedded dataset timestamp.
- [ ] The timestamp comes from `window.FANTASY_SAVIOR_DATA.metadata`, not a hard-coded string.
- [ ] The final pre-draft player/injury refresh is embedded with `scripts/embed-data.js`.
- [ ] A test/script fails when the source JSON and embedded browser dataset are out of sync.
- [ ] The deployed GitHub Pages build is manually checked after the final refresh and shows the expected timestamp.

---

# Secondary fixes — not release blockers if time gets tight

These should be fixed if convenient while touching the same code, but they do not block draft-day use once the release gate above is satisfied.

## Comparable QB/TE guidance

`WAIT ON QB` / `WAIT ON TE` currently counts all remaining players at the position while describing them as comparable. Use same-tier or otherwise comparable players instead, or change the wording to avoid overstating equivalence.

## "Best value" labeling

The shortlist's current "best value" candidate is based on raw/base ranking rather than ADP value. Either calculate actual ADP value for this label or rename it to **Best Player Available**.

## Avoid mutating source player records

`recommend()` currently assigns `returnProbability` directly onto source player objects. Keep computed recommendation fields in the scored result wrapper so the engine remains genuinely pure/read-only.

## Roster UI cleanup

- Fix the stray quote emitted after the `Your roster (x/9 starters)` header.
- Render an explicit open FLEX slot when FLEX is not yet filled.

## Service worker

Do **not** rush a service worker into the draft-day release. GitHub Pages plus local state is sufficient for the first live test, and a poorly tested service worker could create stale-data/cache problems worse than the reliability benefit.

---

# Final release verification

After the blockers are fixed:

- [ ] Run the full automated engine test suite.
- [ ] Add the blocker-specific regression tests above.
- [ ] Simulate a full 128-pick draft containing at least two unlisted picks.
- [ ] Test from draft positions 1, 4, 6, and 8.
- [ ] Verify pick ownership at snake corners.
- [ ] Verify return horizon while actively on the user's pick.
- [ ] Verify undo after listed, unlisted, mine, and opponent picks.
- [ ] Refresh the browser mid-draft and verify exact recovery.
- [ ] Export and re-import a mid-draft state.
- [ ] Perform the final rankings/injury refresh.
- [ ] Regenerate `data/players.data.js`.
- [ ] Verify the correct data timestamp on the live GitHub Pages deployment from the Galaxy Z Fold 5.
- [ ] Run a short real-device mock draft on the unfolded Fold.

## Release decision

The 2026 draft-day MVP can be considered **READY** when:

1. all P0 and P1 blockers above are resolved,
2. blocker regression tests pass,
3. the final player-data timestamp is verified on the live Pages build, and
4. a real-device mock draft completes without desynchronization or unrecoverable state errors.

Everything else can wait until after the first live draft.
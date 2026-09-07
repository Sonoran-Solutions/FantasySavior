# AGENTS.md

This repository is currently in an emergency MVP phase ahead of its first live fantasy draft.

Treat the existing documentation as the product contract unless the user explicitly changes direction.

## Read first

Before making implementation changes, read:

1. `README.md`
2. `ROADMAP.md`
3. `docs/ARCHITECTURE.md`
4. `docs/DRAFT_STRATEGY.md`

## Current objective

Build the smallest dependable version of FantasySavior that can be used during a live 8-team standard-scoring snake draft on a Samsung Galaxy Z Fold 5.

The user will not know draft position until shortly before the draft, so draft slot must remain configurable from 1–8.

## Product priorities

In order:

1. Correct player data
2. Correct draft state
3. Correct snake-pick math
4. Fast manual draft entry
5. Useful recommendations
6. Fold-friendly UI
7. Persistence/recovery
8. Visual polish

Do not reverse that order.

## Hard MVP constraints

- 8 teams
- Standard / non-PPR
- Snake draft
- QB: 1
- RB: 2
- WR: 2
- TE: 1
- FLEX: 1 (RB/WR/TE)
- DST: 1
- K: 1
- Bench: 7
- IR: 1
- 16 actual drafted roster spots per team
- 128 total selections

IR is not an extra draft selection in the target setup.

## Implementation philosophy

Prefer boring, local, deterministic code.

For the first live version:

- No backend unless absolutely required
- No login
- No provider integration dependency
- No LLM dependency
- No live API dependency while drafting
- No unnecessary framework migration

A static player snapshot plus local state is acceptable and preferred if it produces a more reliable draft-day tool.

## Recommendation philosophy

Do not implement `sort by rank` and call it a recommendation engine.

The engine should consider:

- Standard-scoring player value
- ADP/value fall
- Position tier scarcity
- Current roster composition
- Draft round
- Positional advantage
- Approximate chance player returns at next user pick
- Upside, especially for bench picks
- Injury/status risk
- Strong penalty against early K/DST

Important league-specific behavior:

- This is only an 8-team league; replacement talent is deep.
- Do not force ordinary QBs early simply to fill QB.
- Do not force ordinary TEs early simply to fill TE.
- Elite QB/TE positional advantage is different from generic starter value.
- Early picks should tolerate roster redundancy when an elite value drops.
- Late bench picks should favor ceiling rather than stable replacement-level floor.

See `docs/DRAFT_STRATEGY.md` before changing scoring weights.

## UI requirements

The primary device is a Samsung Galaxy Z Fold 5.

Unfolded layout should intentionally use the extra width, ideally:

- Available player board on one side
- Recommendation + roster context on the other

The UI must also work at normal phone widths.

All important interactions must work by tap. Never rely on hover.

Critical actions should be difficult to fat-finger and easy to undo.

## Draft action model

Keep player-entry semantics simple:

- `Drafted by other`
- `Drafted by me`
- `Undo`

Do not require selecting an opponent team in the MVP unless the recommendation model explicitly starts using opponent roster state.

## State rules

Persist after every draft mutation.

Drafted players must never reappear in:

- Available list
- Search results
- Position filters
- Recommendations

A user-drafted player must be represented exactly once in the user's roster.

Undo must reverse state exactly.

## Snake draft rule

For `N` teams, slot `S`, round `r`:

- odd rounds: within-round pick = `S`
- even rounds: within-round pick = `N - S + 1`
- overall = `(r - 1) * N + withinRoundPick`

For this MVP, `N = 8` and `r = 1..16`.

Add tests for slots 1, 4/5, and 8 at minimum.

## Data quality

Data freshness matters more than scoring-model sophistication.

Before the live draft, ensure the dataset has current:

- Standard rankings/ECR
- ADP
- Team
- Position
- Injury/status
- Tier assignment

Record an update timestamp and source metadata with the dataset.

Never silently mix PPR rankings into the default board.

## Explanations

Recommendations should expose short reasons, for example:

```text
TAKE: Player A
- Best value remaining
- Only 2 RBs left in this tier
- Unlikely to return at your next pick
```

Prefer useful labels such as `Unlikely to return` over fake statistical precision unless a return model becomes properly calibrated.

## Before declaring draft-day readiness

At minimum, verify:

- Full mock draft can be recorded
- Correct picks for draft positions 1–8
- Refresh recovery works
- Undo works for both pick types
- Recommendations exclude drafted players
- Player filters exclude drafted players
- User roster is correct
- K/DST are not recommended stupidly early
- Fold and narrow layouts remain usable

## Scope discipline

Do not spend MVP time on:

- Accounts
- Cloud sync
- ESPN/Yahoo/Sleeper integration
- Waiver tools
- Start/sit
- Trades
- AI chat
- Fancy analytics dashboards
- Generic support for every fantasy format

Those are roadmap items after the first real draft.

## Documentation maintenance

If implementation materially changes an architectural assumption or product behavior, update the relevant documentation in the same change.
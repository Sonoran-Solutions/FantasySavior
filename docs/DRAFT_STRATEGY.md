# Draft Strategy

This document defines the initial recommendation philosophy for FantasySavior's first target league.

The goal is **not** to build a perfect fantasy projection model overnight. The goal is to turn a current player board into useful draft decisions for an 8-team standard-scoring league.

## Target league

- 8 teams
- Standard / non-PPR
- Snake draft
- 1 QB
- 2 RB
- 2 WR
- 1 TE
- 1 FLEX (RB/WR/TE)
- 1 DST
- 1 K
- 7 bench
- 1 IR

## Core principle

FantasySavior should recommend **marginal advantage**, not just the highest-ranked player.

A player is attractive when some combination of these is true:

- He is highly ranked overall.
- He has fallen below expected draft cost.
- His positional tier is about to disappear.
- He fills a meaningful roster need.
- He creates a real positional advantage.
- He has meaningful upside in a shallow league.
- He is unlikely to survive until the user's next pick.

## Why 8 teams changes the logic

An 8-team league has a deep replacement pool.

That means:

- Replacement-level QBs are easy to find.
- Replacement-level WR/RB depth is easier to find than in 12- or 14-team leagues.
- Mediocre floor plays are less valuable.
- Elite ceilings and positional edges matter more.
- Bench spots should be used aggressively on upside.

The engine should therefore avoid treating every roster hole as an emergency.

## Why standard scoring changes the logic

Non-PPR scoring removes the direct value of receptions.

The model should therefore lean more heavily on:

- Rushing / receiving yardage
- Touchdown equity
- Goal-line roles
- Big-play upside
- Workload quality

Players whose fantasy value is disproportionately driven by reception volume should not receive the same boost they would in PPR formats.

The MVP does not need a detailed stat projection system if the input ranking source is already standard-scoring aware.

## Recommendation score

Start with a transparent heuristic, not an opaque model.

Conceptually:

```text
recommendationScore =
    basePlayerValue
  + adpValue
  + tierScarcity
  + rosterNeed
  + positionalAdvantage
  + wontReturnBonus
  + upsideBonus
  - redundancyPenalty
  - injuryPenalty
  - earlyKDSTPenalty
```

All weights should live in one configuration object so they can be tuned after testing.

## Suggested normalized components

### 1. Base player value

Primary input: standard-scoring ECR/rank.

Convert rank into a descending normalized score.

Example concept:

```js
basePlayerValue = max(0, 100 - rank * rankWeight)
```

Exact shape can change later.

### 2. ADP value

Measure whether the player is available later than expected.

```text
valueDelta = currentOverallPick - ADP
```

Positive values mean the player has fallen.

Avoid over-weighting tiny ADP differences. A meaningful fall should matter; a one-pick difference should not dominate.

### 3. Tier scarcity

This is one of the most important MVP signals.

Examples:

```text
RB Tier 2: 2 players remaining
WR Tier 3: 8 players remaining
```

When otherwise comparable players exist at multiple positions, the engine should prefer the position whose current tier is disappearing.

Suggested tiers-left multiplier:

```text
1 left  -> very high scarcity bonus
2 left  -> high bonus
3 left  -> moderate bonus
4+ left -> low/no bonus
```

### 4. Roster need

Roster need matters, but should not overpower elite value early.

Need should increase as the draft progresses.

Example behavior:

**Rounds 1–4**

- Small penalty for redundancy
- Small/moderate bonus for useful roster fit
- Best-player/value can override empty slots

**Rounds 5–10**

- Stronger attention to incomplete starting roster
- FLEX construction matters
- QB/TE decisions become more context-sensitive

**Rounds 11–14**

- Starters should generally be filled
- Bench upside dominates redundant low-ceiling depth

**Rounds 15–16**

- K and DST become acceptable/default targets if still empty

### 5. Positional advantage

Not all starting slots deserve equal urgency.

#### QB

In an 8-team league, ordinary QB1s have low scarcity.

The engine should distinguish:

- Elite QB who meaningfully separates from replacement
- Large value fall
- Generic starting QB

If several comparable QBs remain and the next pick is close, recommend waiting.

#### TE

Similar principle:

- True elite / tier-break TE can deserve a premium
- Mid-tier TE should not be forced simply because the slot is empty

#### RB / WR

These should carry most early-round recommendation weight because they fill four mandatory slots plus FLEX and dominate bench upside opportunities.

### 6. Will-the-player-return estimate

The initial model can be intentionally simple.

Inputs:

- Current overall pick
- User's next overall pick
- Player ADP
- Optional ADP uncertainty/spread later

Basic interpretation:

```text
ADP well before next pick -> unlikely to return
ADP near next pick        -> toss-up
ADP well after next pick  -> likely to return
```

A simple logistic function is sufficient for v0.1.

Example:

```js
const distance = player.adp - nextUserPick;
const probability = 1 / (1 + Math.exp(-distance / 5));
```

This is not meant to be a statistically calibrated probability on day one. It is a useful comparison signal.

Label ranges instead of pretending false precision:

- `Very unlikely to return`
- `Unlikely to return`
- `Could return`
- `Likely to return`
- `Very likely to return`

If a numeric percentage is displayed, clearly treat it as an estimate.

## Round-aware weighting

Recommended initial behavior:

### Rounds 1–4: Acquire difference-makers

Priority order:

1. Elite overall talent
2. Value drops
3. Tier scarcity
4. RB/WR core
5. True elite QB/TE advantage
6. Roster balance

Do not force QB, TE, or even WR/RB balance solely to make the roster look complete.

### Rounds 5–8: Build the starting lineup

Priority order:

1. Strong remaining value
2. Missing starting RB/WR/FLEX
3. Tier scarcity
4. QB/TE if waiting no longer offers an advantage
5. High-upside depth

### Rounds 9–12: Attack upside

Priority order:

1. Breakout RB/WR paths
2. Handcuff / role-change upside when justified
3. Strong QB/TE value if still unresolved
4. Bench ceiling

Avoid bench players whose primary selling point is merely a stable low score.

### Rounds 13–14: Final upside swings

Continue selecting players with a plausible path to becoming a weekly starter.

Avoid carrying unnecessary backup K/DST and usually avoid a backup QB/TE unless the value or league context clearly justifies it.

### Rounds 15–16: Fill K and DST

Default behavior if those starting slots remain empty:

- Draft DST
- Draft K

Order can be tuned based on current strategy/data.

## Kicker and defense suppression

Before the late rounds, K and DST should receive a large penalty.

The UI can explicitly explain this:

```text
KICKER NOT RECOMMENDED
8+ viable starters remain. Use this pick on an upside RB/WR instead.
```

The penalty should be relaxed if the league's behavior produces an unusual run, but v0.1 can simply suppress both through a configurable round threshold.

## Bench strategy

The default bench should emphasize RB/WR upside.

Examples of useful upside profiles:

- Player one injury away from a major workload
- Young receiver with uncertain but substantial target ceiling
- Backfield role that could expand quickly
- Player with strong underlying usage but uncertain current rank

Avoid spending limited bench slots on low-ceiling veterans solely because their weekly projection is predictable.

## Bye weeks

Do not overreact to bye-week conflicts during the draft.

A small warning is enough.

Do not downgrade an elite player meaningfully just because another rostered player shares the same bye.

## Injury information

Player health should be visible and incorporated conservatively.

Suggested statuses:

- Healthy / none
- Questionable / minor concern
- Significant concern
- Expected short absence
- IR / long-term absence

Avoid inventing medical certainty. The data layer should store the source snapshot and timestamp when practical.

## Recommendation explanations

The engine should always produce short human-readable reasons.

Good:

```text
TAKE: Player A
• Best player remaining
• Only 2 RBs left in this tier
• Unlikely to survive to pick 38
```

Also good:

```text
WAIT ON QB
• 6 comparable QBs remain
• Your next pick is only 5 selections away
```

Bad:

```text
Player A score: 87.3642
Player B score: 86.9911
```

The number may exist internally, but the app should communicate decisions, not math trivia.

## Shortlist

Display at least:

1. Best recommendation
2. Best alternative at another position
3. Best pure value
4. Optional high-upside pick

This helps the user make the final judgment instead of pretending the model knows everything.

## Data quality rule

A sophisticated scoring formula cannot rescue stale or incorrect player data.

Before draft day, prioritize:

1. Current standard-scoring rankings
2. Current injuries/status
3. Current ADP
4. Correct team/position
5. Useful tiers

The player-data snapshot should include a generated/updated timestamp.

## Post-draft calibration

After the first real draft, record cases where:

- The recommendation felt clearly wrong
- The app overreacted to roster need
- The app ignored a tier cliff
- Return estimates were obviously misleading
- QB/TE timing felt poor
- The UI explanation was insufficient

Tune the weights from actual use rather than endlessly theorizing before the first test.
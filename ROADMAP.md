# Roadmap

FantasySavior is being built under an unusual but useful constraint: the first live test is imminent.

The roadmap therefore separates **draft-day survival** from everything that would be cool later.

## Phase 0 — Lock the MVP

**Goal:** make the project mechanically implementable without debating product scope.

- [x] Define initial league preset
- [x] Define local-first architecture
- [x] Define recommendation philosophy
- [x] Define mobile/Fold layout direction
- [x] Choose/confirm player ranking + ADP source for the first dataset
- [x] Create initial `data/players.json`
- [x] Add dataset timestamp/source metadata

Exit criteria:

> A developer can implement the first build without needing product-design decisions.

---

## Phase 1 — Draft state engine

**Priority: critical**

- [x] Create base application scaffold
- [x] Implement league preset
- [x] Input draft position 1–8
- [x] Generate all 16 snake-draft selections
- [x] Load static player dataset
- [x] Track overall pick number
- [x] Mark player `Drafted by other`
- [x] Mark player `Drafted by me`
- [x] Track user's roster
- [x] Exclude drafted players from all available-player views
- [x] Implement undo
- [x] Persist state after every mutation
- [x] Resume persisted draft after refresh
- [x] Reset/new-draft flow

Exit criteria:

> An entire mock 128-pick draft can be recorded without state corruption.

---

## Phase 2 — Usable live board

**Priority: critical**

- [x] Available-player list sorted by baseline rank
- [x] Search by player name
- [x] Filter by QB/RB/WR/TE/DST/K
- [x] Display team
- [x] Display standard rank/ECR
- [x] Display ADP
- [x] Display tier
- [x] Display bye week
- [x] Display injury/status marker
- [x] Large draft-action touch targets
- [x] Clear current overall pick
- [x] Clear current round
- [x] Clear next user pick
- [x] Compact user-roster view

Exit criteria:

> The app is already useful as a faster personal draft board even if recommendations are disabled.

---

## Phase 3 — Recommendation engine

**Priority: critical**

Implement a transparent heuristic using the model in `docs/DRAFT_STRATEGY.md`.

- [x] Base player value
- [x] ADP value
- [x] Tier scarcity
- [x] Round-aware roster need
- [x] Positional advantage
- [x] Redundancy penalty
- [x] K/DST early-round suppression
- [x] Upside bias for bench rounds
- [x] Injury penalty
- [x] Approximate return-at-next-pick likelihood
- [x] Top recommendation
- [x] Alternative recommendations
- [x] Human-readable reasons
- [x] `WAIT ON QB` / `WAIT ON TE` style guidance when appropriate
- [x] Tier-depletion indicator

Exit criteria:

> For every user pick, the app produces a plausible shortlist and explains why.

---

## Phase 4 — Galaxy Z Fold 5 pass

**Priority: high**

- [x] Two-column unfolded layout
- [x] Available players on primary side
- [x] Copilot + roster on secondary side
- [x] One-column narrow fallback
- [x] Verify no hover-only interactions
- [x] Verify touch targets
- [x] Verify no accidental horizontal page scrolling
- [ ] Verify recommendation remains visible/useful during rapid player entry
- [ ] Test browser refresh/relaunch during active draft

Exit criteria:

> The unfolded Fold feels intentionally supported rather than like a stretched phone website.

---

## Phase 5 — Draft-day hardening

**Priority: critical before live use**

- [ ] Simulate a complete draft from slot 1
- [ ] Simulate a complete draft from slot 4
- [ ] Simulate a complete draft from slot 8
- [ ] Verify snake picks for every draft position
- [ ] Verify undo after `other` pick
- [ ] Verify undo after `my` pick
- [ ] Verify refresh recovery
- [ ] Verify reset flow cannot trigger accidentally
- [ ] Verify recommendations never include drafted players
- [ ] Verify user roster never duplicates a player
- [ ] Verify K/DST suppression behaves as intended
- [ ] Refresh rankings/ADP shortly before the actual draft
- [ ] Refresh injury/status information shortly before the actual draft
- [ ] Export a known-good draft-state backup path

Exit criteria:

> The developer is comfortable trusting the app during a timed live pick.

---

## Phase 6 — Immediate post-draft cleanup

After the first real-world test:

- [ ] Write down every friction point while still fresh
- [ ] Record recommendation misses
- [ ] Record confusing UI behavior
- [ ] Record manual-entry mistakes
- [ ] Tune recommendation weights
- [ ] Add automated tests around bugs found during the live draft
- [ ] Decide whether the project remains personal-first or becomes a broader Sonoran Solutions product

---

# Post-MVP ideas

These are deliberately **not** prerequisites for the first draft.

## Better draft intelligence

- [ ] Track every opponent roster
- [ ] Position-run detection
- [ ] Opponent-needs-aware return probability
- [ ] Better ADP probability distribution
- [ ] Multiple ranking sources / consensus blending
- [ ] User-adjustable player queue
- [ ] Favorites / avoid list
- [ ] Custom tiers
- [ ] Handcuff relationships
- [ ] Stack awareness
- [ ] Bye-week visualization
- [ ] Draft grade / retrospective

## League support

- [ ] Editable team count
- [ ] PPR / half-PPR
- [ ] Superflex / 2QB
- [ ] Multiple FLEX
- [ ] Keeper leagues
- [ ] Dynasty formats
- [ ] Auction drafts
- [ ] Custom scoring

## Provider integration

Potential future integrations:

- [ ] Sleeper league import
- [ ] Sleeper live draft sync
- [ ] ESPN league import if practical
- [ ] Yahoo league import if practical
- [ ] Automatic roster/settings detection

The manual local workflow should remain available even after provider integrations exist.

## Season-long FantasySavior

If the draft experience proves valuable, the project could grow into:

- [ ] Start/sit helper
- [ ] Waiver-wire recommendations
- [ ] Free-agent opportunity alerts
- [ ] Trade analyzer
- [ ] Injury impact summaries
- [ ] Matchup view
- [ ] Rest-of-season roster health
- [ ] Playoff planning

## Data/backend evolution

Only introduce infrastructure when a concrete feature needs it:

- [ ] Scheduled data refresh pipeline
- [ ] Server-side normalized player IDs
- [ ] Cached projections
- [ ] User accounts
- [ ] Cloud draft sync
- [ ] Cross-device state sync

## AI features

Potential later layer, not a foundation:

- [ ] Natural-language explanation of recommendations
- [ ] Ask "why this player?"
- [ ] Ask "RB or WR here?"
- [ ] Draft recap
- [ ] News synthesis

Core recommendations must remain deterministic and usable without an LLM.

---

# Scope rule

Until the first live draft succeeds:

> If a task does not improve player data, draft tracking, recommendation quality, Fold usability, or failure recovery, it can wait.
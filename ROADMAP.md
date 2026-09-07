# Roadmap

FantasySavior is being built under an unusual but useful constraint: the first live test is imminent.

The roadmap therefore separates **draft-day survival** from everything that would be cool later.

## Phase 0 — Lock the MVP

**Goal:** make the project mechanically implementable without debating product scope.

- [x] Define initial league preset
- [x] Define local-first architecture
- [x] Define recommendation philosophy
- [x] Define mobile/Fold layout direction
- [ ] Choose/confirm player ranking + ADP source for the first dataset
- [ ] Create initial `data/players.json`
- [ ] Add dataset timestamp/source metadata

Exit criteria:

> A developer can implement the first build without needing product-design decisions.

---

## Phase 1 — Draft state engine

**Priority: critical**

- [ ] Create base application scaffold
- [ ] Implement league preset
- [ ] Input draft position 1–8
- [ ] Generate all 16 snake-draft selections
- [ ] Load static player dataset
- [ ] Track overall pick number
- [ ] Mark player `Drafted by other`
- [ ] Mark player `Drafted by me`
- [ ] Track user's roster
- [ ] Exclude drafted players from all available-player views
- [ ] Implement undo
- [ ] Persist state after every mutation
- [ ] Resume persisted draft after refresh
- [ ] Reset/new-draft flow

Exit criteria:

> An entire mock 128-pick draft can be recorded without state corruption.

---

## Phase 2 — Usable live board

**Priority: critical**

- [ ] Available-player list sorted by baseline rank
- [ ] Search by player name
- [ ] Filter by QB/RB/WR/TE/DST/K
- [ ] Display team
- [ ] Display standard rank/ECR
- [ ] Display ADP
- [ ] Display tier
- [ ] Display bye week
- [ ] Display injury/status marker
- [ ] Large draft-action touch targets
- [ ] Clear current overall pick
- [ ] Clear current round
- [ ] Clear next user pick
- [ ] Compact user-roster view

Exit criteria:

> The app is already useful as a faster personal draft board even if recommendations are disabled.

---

## Phase 3 — Recommendation engine

**Priority: critical**

Implement a transparent heuristic using the model in `docs/DRAFT_STRATEGY.md`.

- [ ] Base player value
- [ ] ADP value
- [ ] Tier scarcity
- [ ] Round-aware roster need
- [ ] Positional advantage
- [ ] Redundancy penalty
- [ ] K/DST early-round suppression
- [ ] Upside bias for bench rounds
- [ ] Injury penalty
- [ ] Approximate return-at-next-pick likelihood
- [ ] Top recommendation
- [ ] Alternative recommendations
- [ ] Human-readable reasons
- [ ] `WAIT ON QB` / `WAIT ON TE` style guidance when appropriate
- [ ] Tier-depletion indicator

Exit criteria:

> For every user pick, the app produces a plausible shortlist and explains why.

---

## Phase 4 — Galaxy Z Fold 5 pass

**Priority: high**

- [ ] Two-column unfolded layout
- [ ] Available players on primary side
- [ ] Copilot + roster on secondary side
- [ ] One-column narrow fallback
- [ ] Verify no hover-only interactions
- [ ] Verify touch targets
- [ ] Verify no accidental horizontal page scrolling
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
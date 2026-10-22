# Grovebound: the next five increments (2026-10-22, 15:20Z)

Read-only plan from `dsschiff/grovebound` `origin/main` at `183f82e` (PR #19), the 18 PRs merged today (#1–#15, #17–#19), the six open draft PRs (#16, #20–#24), GOAL.md, ROADMAP.md, WORKLOG.md, and the committed pilot reports (`reports/pilot-matrix/`: pilot-matrix, commands-note, resonance-split-note, resonance-split-9seeds, weak-pilot). No game code was changed; no tests were run. The same text is on draft PR branch `claude/local/fable-grovebound-next-increments` as `reports/next-increments-20261022.md`.

## Result in two lines

The live site still serves the 2026-10-03 build. Everything merged today is unreleased, so the first increment is a Pages release; the second is Daniel's 45-minute phone session on that release, which is the only thing that can close Milestones 3 and 5. Three agent increments follow that do not need the phone: locate the Ember Quarry 5:00–6:30 difficulty spike the weak pilot found, prove the loss path on a current build, and settle four small accessibility calls.

## State of play (what the evidence says)

- **Live = `docs/` = Oct 3 bundle.** `npm run check:pages` in a fresh worktree at `183f82e` printed `LIVE == DOCS (index-BmFohTP2.js, index-Bkdln4ig.css)`. `docs/index.html` last changed in `6bf7590` (Oct 3). Since then `src/` changed in 9 files (+426/−92): accessibility label and contrast fixes (#4), OS reduced-motion default (#8), HUD backplates (#15, #19), the GroveScene split (#6), pilot-only code (#9, #10, #17). None of it is on the phone-reachable URL. The phone checklist's own step 0.2 warns that `check:pages` cannot detect this case.
- **Difficulty now has a lower bound.** Default pilot: 108/108 wins across all 36 hero × route cells, median lowest HP 74%, one run below 50%, three Ranger runs took zero damage. Weak pilot (PR #17, 900 runs): 250 ms reaction + every 2nd chance loses 5 of 180 and drops 43% of runs below half health; 500 ms + every 4th chance loses 14 of 180 with 39 runs below 25% HP. **22 of 23 losses are in Ember Quarry between 5:03 and 6:24.** Ember and Ranger fall lowest (median lowest HP 62% and 65% over all arms); Warden keeps the most HP while taking the most damage.
- **Commands matter, resonance barely.** With commands on, damage taken falls 123 → 54 (−69 ±20). Plain commands account for −41; resonance and focus about −12 to −17 each with intervals that touch zero. The 4 s window is a small part of the payoff.
- **Route choice barely moves anything.** Quarry and Moonfen mission choice changes neither damage nor clear time by much; the Verge contract does (Stag 65 damage vs Waylight 132). Clear time is fixed by stage timers (3:00 / 3:30 / 4:00 floors), so the clock says nothing about difficulty.
- **Loss path is unproven on any current build.** The only recorded natural losses are stationary heroes at 0:21–1:19 on Sep 26 dev builds; the defeat dialog test calls `finish(false)` instead of dying. GOAL.md's final-release line asks for a complete loss.
- **Everything device-related is open**: Android FPS, the 2 s crash bound on a real process kill, TalkBack, HUD plate feel, and all four Milestone 3 feel questions. The checklist (`PHONE-SESSION-CHECKLIST.md`) and the feel-evidence appendix (draft PR #16) are written and waiting.

## The five increments, in order

### 1. Release today's main to Pages (agent, about 45 min, no phone)

**What.** Stage `docs/` from `183f82e` (or whatever main is after #20–#24 merge), commit source and `docs/` together, push, read the live URL back, and write the WORKLOG release lines. Open PR #20 (today's WORKLOG section) should merge first or be folded in.

**Evidence.** Live-vs-docs check above; decision 1 of the Milestone 3 packet recommended "release now, before any device or feel session, so the phone tests the build players get." Pages size at #15 was 3,576,905 of 5,000,000 bytes; `profile:budget` passed on seeds 24/88/144; 100+ unit and 18 a11y browser tests passed on the PRs.

**Gate.** ROADMAP release gate: `npm test`, `npm run build`, `npm run stage:pages` (size-gated), commit, push, then `npm run check:pages` must print the **new** bundle name, Pages status `built`, and a live readback that the existing saved run is retained.

**One visible behaviour change to name in the WORKLOG line.** PR #8 turns Reduced effects on for players whose OS asks for reduced motion and who never touched the option; a player who earlier left it off with OS-reduce on will see it come on, because a stored `false` cannot be told apart from the old default.

**Under marathon rules this is a draft PR carrying the restaged `docs/`; Daniel (or the orchestrator) merges.** The release is not done until the live readback is recorded.

### 2. Daniel's phone session on the released build (Daniel, 45 min; agent 30 min after)

**What.** Run `PHONE-SESSION-CHECKLIST.md` end to end on a midrange Android Chrome phone: section 0 (confirm the new bundle), 1A/1B force-stop and Recents-swipe resume, 2 FPS readout (`?debug=1`) during the Moonfen Wild Surge and Briar King, 3 TalkBack over camp and one dialog, 4 HUD plate legibility over bright ground, 5 two full feel runs answering the four questions (one run as Warden, one as Ranger or Ember if unlocked; chain two commands on purpose in one run). Skip 1C (adb) unless A or B loses more than 2 s.

**Evidence.** Every "needs-device" row of the close-out report and GOAL.md L10–12 depend on this one session. Nothing automated can answer feel: the bot never renders a frame and wins every default run. The weak pilot gives a calibration: if Daniel's lowest HP in a run looks like the 250:2 arm (about 50%, an occasional Quarry death), the game is where the bot says; if it feels much easier, the bot's handicaps are harsher than a thumb; if harder, look at Quarry first.

**Before the session (agent).** Merge or carry draft PR #16 (feel-evidence appendix, docs only) so the checklist's section 5 links to it; merge #22 (README tooling sync) and #24 (check:pages content hash) if the orchestrator wants a hash check rather than a filename check in step 0.

**After the session (agent).** Copy results into WORKLOG, then decide the ROADMAP boxes: item 3 can be checked only if Daniel calls the run balanced and the resume test passed; item 5 only if FPS held and TalkBack had no unlabeled control. If either fails, increments 3–5 inherit the target.

**Needs the phone: yes, entirely. This is the only increment that does.**

### 3. Find what kills a slow player in Ember Quarry at 5:00–6:30 (agent, 2–3 h, no phone for the analysis; tuning waits for 2)

**What.** Three steps, each a small change to `scripts/pilot-matrix.mjs` and `src/game/pilot.ts` (debug-only paths, default pilot unchanged, identical-run check against `resonance-split-9seeds.json` as the guard):
1. Split the two handicaps: `--skill 250` (reaction only) vs `--skill 0:2` (action rate only) on the same 180-run slice, to learn whether lateness or inaction is what dies.
2. Add a per-second damage-taken trace by source (wisp lance, Thornback charge, vent, melee, boss strike) for the Quarry window, and a per-route breakdown (the Per-route table from #18 only counts routes reached; it does not yet say where damage lands). The Wild Surge starts in the back half of Quarry, which is exactly 5:00–6:30 into a run, so the first hypothesis is the surge ramp plus wisp count, not Thornback.
3. Propose one tuning knob with a before/after weak-pilot sweep as the regression gate: no cell unwinnable for the 250:2 arm, default-pilot results unchanged byte for byte. Do **not** commit a balance change until Daniel's own run from increment 2 says whether the game should get harder or easier; the packet's decision 3 made this ordering explicit.

Also guard `--skill` against `--focus restore` (the two interact: restore taps would be counted as command chances), noted in today's ideas file.

**Evidence.** 22 of 23 weak-pilot losses in Quarry 5:03–6:24 (`weak-pilot.md` short version; PR #17 body); Ember 500:4 arm lowest HP 39%, 18 of 60 runs below 25%; Warden 500:4 damage taken +318 per run against +195/+204 for the other heroes, yet Warden still wins most. WORKLOG said "weak combat pressure" three times for the strong pilot; this is the first evidence of too much pressure anywhere, and it is concentrated in one 90-second window.

### 4. Prove the loss path on a current build (agent, about 2 h, no phone)

**What.** A Playwright spec that plays a natural late-run loss through the real death path (not `finish(false)`): pick a seed + arm that the weak pilot already lost (one of the 23 rows in `weak-pilot.json`, Quarry around 5:30, 500:4 arm) and assert the defeat dialog, seeds awarded, saved run cleared, no stale RESUME button on the camp, and a clean new run start. Add one boss-phase loss if a reproducible seed exists (one weak-pilot loss is late Moonfen). Record the first natural loss on a production build in WORKLOG.

**Evidence.** Close-out report "Loss path": the defeat dialog is only opened by calling `finish(false)`; no test or report plays a loss; the three recorded losses are stationary heroes at 0:21–1:19 from Sep 26 dev builds. GOAL.md requires "a complete win and loss". Until today there was no reproducible way to make the bot lose; the weak pilot provides one, and runs are deterministic at fixed 60 Hz, so the loss is replayable.

### 5. Settle the four small accessibility calls (Daniel: four one-line answers; agent 1–2 h, no phone except as noted)

Each has been carried as "listed, not fixed" since PR #4 and needs a ruling, not a session:

| Call | Evidence | Recommendation |
|---|---|---|
| Weapon-slot screen-reader name | axe `label-content-name-mismatch` is skipped on slot buttons because the live damage counter sits in their visible text (#4) | Announce "Axe, rank I, focused. Crescent Sweep ready." and move damage to `aria-describedby`. Wait for the TalkBack result from increment 2 before wording it. |
| Region-start toast over an open dialog | At 320 × 568 the 2.5 s toast covered the growth dialog title at contrast 1.23 (#4) | Hold the toast while any dialog is open; show it on close. No phone needed. |
| Dialog close sends focus to the canvas, not the opener | Checklist section 3 lists it as a known gap; reviewer note on PR #12 | Return focus to the opener for Pause and Settings; keep canvas for dialogs opened by gameplay (route, growth, result). No phone needed. |
| `pagehide` save listener | `e2e/tabhide-save.spec.ts` asserts that `pagehide` does not save today and will fail on purpose when one is added | Add it only if phone test 1A or 1B loses more than 2 s; otherwise leave the spec as the record. |

## What needs a phone session, in one table

| Item | Phone? | Who |
|---|---|---|
| 1 Pages release | No | agent (merge by Daniel/orchestrator) |
| 2 Checklist session: resume, FPS, TalkBack, HUD plates, feel | Yes, all of it | Daniel, 45 min |
| 3 Quarry spike analysis | No for the analysis; the tuning direction comes from 2 | agent |
| 4 Loss path spec | No | agent |
| 5 Accessibility calls | Slot wording waits for 2's TalkBack result; the other three do not | Daniel four answers, then agent |

## Considered and left out of the five

- **Sound tuning (ROADMAP item 5).** `src/game/audio.ts` is 39 lines of oscillator cues with a mute option; no listening check exists. Real assets would eat into the 1.4 MB of transfer headroom and a listening pass needs the phone anyway. Fold a "did the cues read as hits, pickups, danger?" question into a later phone session rather than building assets blind.
- **Android memory with the 12.4 MiB floor texture.** Unmeasured; nothing in the repo can measure it without a device. Add a `chrome://` memory glance to the next phone session if the FPS check passes but the game stutters on region load.
- **Run-snapshot version bump path.** The parser accepts only `version: 1` and has no migration test; it becomes urgent at the first schema change, not before.
- **Wider resonance window.** The data says resonance is a small part of the payoff and Conductor already gives 6 s; change nothing until Daniel answers question 3.

## Rules observed

No canonical checkout edited; worktree `F:/grovebound-workspaces/grovebound-fable-grovebound-next-increments` on branch `claude/local/fable-grovebound-next-increments` from `origin/main`; draft PR only, never merged. No game run, no audio, no network data collection beyond the repo's own `check:pages` readback of the public page. No Airtable, Zotero, email, Slack, or story-os edits.

# Phone session checklist (Milestone 3 and 5)

Date: ________  Device / Android / Chrome version: ________________  Build bundle (assets/index-....js): ________________

Time: about 45 minutes. Needs the phone, a desktop with this repo, and two full runs (about 10.5 minutes each).

## 0. Open the live build and confirm it is current

1. On the desktop, in the repo on `main`, run `npm run check:pages`. It prints `LIVE == DOCS (assets/index-....js, ...)` when the live site serves the bundle in `docs/index.html`. Exit 1 prints `LIVE != DOCS`: stop, the phone would test an old build. Exit 2 is a fetch error. Paste the `bundle:` line from `npm run check:pages` into the header.
2. Make sure the release you want tested is in `docs/` on `main` (see ROADMAP.md L32-34, "Release gate"). `check:pages` only compares live to the repo, so it cannot tell you a newer source change was never staged.
3. On the phone, open `https://dsschiff.github.io/grovebound/` (README.md L3) in Chrome. Close the tab and reopen it so Chrome does not show a cached copy. Optional: add `?debug=1` for the FPS readout (README.md L36).

Pass: step 1 says `LIVE == DOCS` and the game loads to the camp screen with the ENTER THE GROVE button. Fail: anything else.
Result: ________

## 1. Save and resume (GOAL.md L10: "an abrupt crash loses no more than the latest two seconds")

The game saves every 2 s while a run is active (`GroveScene.ts` L752) and whenever the tab is hidden (`visibilitychange`, `src/main.ts` L667-670; README.md L68). Opening Android Settings or swiping Chrome out of Recents hides the tab, so A and B test only the tab-hide save. Only C tests the 2 s periodic save, which is what GOAL.md L10 is about.

A. Settings force stop (tab-hide save). Start a run. Play about 10 s. Read the HUD clock (`#timer`, shown as m:ss) and write it down. Go to Android Settings > Apps > Chrome > Force stop. Reopen Chrome and the game. Tap RESUME SAVED RUN. Read the clock.
Pass: resumed clock is no more than 2 s behind the one you wrote down, and region, health and weapon slots match. Fail: loss over 2 s, no RESUME button, or a different run.
Last clock ____  Resumed clock ____  Loss ____ s  Result: ________

B. Recents swipe (tab-hide save). Start a run, play about 10 s, note the clock, swipe Chrome away from Recents, reopen, tap RESUME SAVED RUN. Same pass and fail.
Last clock ____  Resumed clock ____  Loss ____ s  Result: ________

C. True crash (2 s periodic save). Needs adb with USB debugging on, which is not installed on the desktop (packet decision 2, packet.md L29). With the game on screen and the phone unlocked, play about 5 s, note the clock, then run `adb shell am force-stop com.android.chrome` without touching the phone first. Reopen Chrome and the game, tap RESUME SAVED RUN. Same pass and fail. If you skip adb, mark C "not run": GOAL.md L10 stays unproven.
Last clock ____  Resumed clock ____  Loss ____ s  Result: ________

## 2. Frame rate in a late fight (GOAL.md L11: smooth 60 fps, no sustained drop below 30 in a dense encounter)

Do this during feel run 1 in section 5, not as a separate run. Load the game with `?debug=1`. The readout `NN FPS · NN KILLS` appears on screen and updates every 0.5 s (`src/main.ts` L695-696). Stage-skip buttons only show on localhost, so reach Moonfen by playing: Verdant Verge, Ember Quarry, then Moonfen (README.md L11). Watch the readout during the Wild Surge (second half of each later region) and the Briar King fight (README.md L11, L23).
Pass: mostly near 60, never sustained below 30 for more than a few seconds. Fail: sustained below 30.
Lowest sustained ____ FPS  Typical ____ FPS  Where: ________  Result: ________

## 3. TalkBack on camp and one dialog (ROADMAP.md L9: accessibility pass)

Turn on TalkBack. On the camp screen, swipe through every control. Then open one dialog: Pause (the Ⅱ button labeled "Pause game", `src/main.ts` L61), or, when one appears in a run, the route dialog titled "Enter Ember Quarry" or "Enter Moonfen" (`src/main.ts` L555; its default heading "Choose your route" is replaced) or the "Choose your growth" dialog (L118).
Pass: every control is announced with a meaningful name (no "unlabeled button"), focus stays inside the open dialog, and after closing it focus lands on the game field (announced as "Game field. Drag to move...", `src/main.ts` L276-281). Fail: an unlabeled control, focus escapes the dialog, you cannot close it, or focus lands nowhere. Known gap, not a fail: focus does not return to the control that opened the dialog. Nothing inside the game canvas is expected to be readable.
Unlabeled or confusing controls: ________________  Result: ________

## 4. HUD legibility over bright terrain (optional, decision 4 in the packet)

During any run, look at the timer, health numbers and the "AUTO WEAPONS / TAP SLOT FOR COMMAND" heading over the lightest ground.
Pass: readable at arm's length. Fail: you have to squint.
Result: ________

## 5. Feel review

Play two full runs on the live build (run 1 with ?debug=1, doing the section 2 FPS check). Tap weapon commands and chain two within 4 s on purpose in at least one. After a run, answer the four questions below.

Before you play, read `reports/pilot-matrix/m3-feel-evidence.md` (one page): what the pilot runs already show for each question, what they cannot, and one recommendation each.

ROADMAP.md L38 names the target: "human feedback on the Expedition art, command timing and mission variety". ROADMAP.md does not contain the four questions as written. They come from the Milestone 3 decision packet (decision 5, agentic-workflow `outputs/marathon/g4-gb-m3-decision-packet/packet.md`), quoted here:

1. "Is each Expedition hero readable at phone size mid-fight?" Answer: ________
2. "Is an 8 s command recharge worth tapping, or ignorable?" (Recharge: ROADMAP.md L17.) Answer: ________
3. "Does the 4 s resonance window feel reachable?" (Window: ROADMAP.md L21.) Answer: ________
4. "Do the Quarry and Moonfen mission choices feel different enough to matter?" (Choices: ROADMAP.md L16; the picker is the "Enter Ember Quarry" / "Enter Moonfen" dialog, `src/main.ts` L555.) Answer: ________

Run 1: hero ________ result (win/loss, time) ________  Run 2: hero ________ result ________

## Afterward

Copy results into WORKLOG.md. Boxes this can close: GOAL.md L12 (real-device play) and ROADMAP.md milestones 3 and 5, only after the live build is verified (ROADMAP.md L3).

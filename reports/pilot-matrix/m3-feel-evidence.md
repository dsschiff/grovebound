# Milestone 3 feel questions: what the bot already shows (2026-10-22)

For the feel review in `PHONE-SESSION-CHECKLIST.md` section 5. For each of the four questions: what the pilot runs show, what they cannot show, and one recommendation. No new runs. Every number below is quoted from a committed file in this folder, or computed from one where marked.

## Read this first: the bot is a strong player

- It never loses. 108/108 wins in the route matrix (`pilot-matrix.md` L6) and 270/270 in the command-split runs (`resonance-split-9seeds.md` L6).
- Without commands its lowest point across 108 runs was 49% HP, median 74% (`pilot-matrix.md` L7). In the 54 command-off runs of the split it was 50.1% (`resonance-split-9seeds.json`, `cells["ember/waylight/coolantRun/moonflame@w11"].minHealthFraction` = 0.501). One command run did drop to 3% HP and still won (`resonance-split-9seeds.md` L71), so it can get hurt, but rarely.
- With commands on it taps almost as soon as a command recharges. Sunbow fired 77-80 times a run against a limit of about 79 (`commands-note.md` L37). Every command-on number is an upper bound for an attentive player, not what a typical player gets.
- It runs headless on desktop Chrome without drawing the screen (`stepping` = "game.scene.update (no render)" in every row of `pilot-matrix.json` and `commands-slice.json`). It sees nothing and feels nothing.

For difficulty, read `weak-pilot.md` in this folder (landed as #17): a slower bot with human-like reaction delays loses some runs (5 to 14 of 180), nearly all in Ember Quarry around 5:00 to 6:30, and weapon commands help less once the player is slow. Expect the Quarry to be harder than the numbers below suggest.

## 1. Is each Expedition hero readable at phone size mid-fight?

Bot evidence: none. The pilot runs never render a frame (see above).

What the bot cannot tell: everything this question asks.

Recommendation: answer it during the Moonfen Wild Surge in run 1, the same moment as the section 2 FPS check, because that is one of the most crowded screens in a run.

## 2. Is an 8 s command recharge worth tapping, or ignorable?

Bot evidence:
- Tapping commands roughly halves damage taken. Over 54 paired runs, mean damage taken was 123 without commands and changed by −69 ±20 with them. Lowest HP rose 6.6 points (`resonance-split-note.md` L97-98). The 18-pair first slice found the same direction: 129 to 68 (`commands-note.md` L18). All command runs used the Waylight contract and the Moonflame route (`resonance-split-note.md` L4-5).
- Plain commands, with no chains and no focus shift, account for −41 ±20 of that −69 (`resonance-split-note.md` L97).
- Runs get only 10 s shorter out of about 636 s (L99). Region timers fix the run length, so a faster clear will not feel like a reward (`commands-note.md` L25).
- The payoff differs by hero. Plain commands: Ranger −60 ±45, Ember −41 ±28, Warden −21 ±25, the last not clearly different from zero (`resonance-split-note.md` L100, L103, L106). Most of Warden's gain comes from focus moving to the bow, not from the command shot (L15, L113-115).

What the bot cannot tell: whether you notice a command is ready, and whether you can tap it on a phone while dodging. The bot also wins every run without commands, so it can show that commands cut damage, not whether they are needed to survive.

Recommendation: play one run as Warden and one as Ranger or Ember, and answer question 2 separately for each. If Warden's commands feel ignorable and Ranger's do not, that matches the bot and is a Warden tuning question, not a reason to change the 8 s recharge. Ranger and Ember unlock through run rewards (README.md L15), so on a fresh phone profile only Warden may be available; then answer for Warden and note that.

## 3. Does the 4 s resonance window feel reachable?

Bot evidence:
- The bot lands 63.8 resonances a run, 0.40 per command (`resonance-split-9seeds.md` L368).
- It opens a chain only when it already knows the partner weapon will recharge inside the window (`commands-note.md` L31-33). It reads the recharge timers exactly. You get each slot's bar and countdown and a combat cue naming the second slot and time left (README.md L9).
- Resonance adds a small and uncertain part of the benefit: −12 to −15 damage taken of the −69 total, not firmly established at this sample size (`resonance-split-note.md` L9-12, L97).
- Chaining also lets the bot fire about 17% more commands. Without chains it fires 131-136 a run instead of 158-164, because it waits out the window (`resonance-split-note.md` L81-83).

What the bot cannot tell: whether you notice that cue mid-fight and can tap the second slot within 4 s on a phone.

Recommendation: in the run where you chain on purpose, count the resonances you land. If you land none, or only by staring at the HUD, call it unreachable. The bot data says resonance is a small part of the payoff, so a wider window (the Conductor kit already gives 6 s, `commands-note.md` L32) is unlikely to change difficulty much.

## 4. Do the Quarry and Moonfen mission choices feel different enough to matter?

Bot evidence, computed here from `pilot-matrix.json` (108 runs, `cells.*` grouped by `quarry`, `moon` and `contract`; mean `damageTaken` and `gameSeconds`). The bot never taps commands in this file.
- Quarry: flask delivery (`coolantRun`) 109 damage taken, 634.8 s; pump-to-forge assault (`forgeAssault`) 101, 634.1 s.
- Moonfen: altar rite (`altarRite`) 110, 634.4 s; Moonflame pursuit (`moonflame`) 100, 634.5 s.
- For comparison, the Verge contract moves damage taken more: Stag 65, Seedheart 119, Waylight 132.
- Every route was won by every hero, with no softlocks (`pilot-matrix.md` L6).

What the bot cannot tell: whether the objectives play differently. It takes whichever route its matrix cell names and does not read the mission text.

Recommendation: judge question 4 on whether the objective changes what you do, not on how hard it is. The bot shows route choice barely changes damage or time, so difficulty will not separate them. If they feel the same, the fix is in the objectives, not the numbers.

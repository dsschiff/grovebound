# Grovebound worklog

## 2026-09-26 — Expansion started

- Baseline: playable shell at commit `60abfba`, public GitHub Pages, one hero and forest arena.
- Active objective: execute the milestones in `ROADMAP.md` as small playable releases.
- Next: finish combat foundation, run automated and browser checks, and publish the result.

## 2026-09-26 — Three-region playable release

- Source and Pages build: `f02290947a7f8610582873c77d641572c7b3e4a2` on `origin/main`.
- GitHub Pages reported `built` for that commit; the live game at https://dsschiff.github.io/grovebound/ displayed the new hero selector, six-stat model, and enabled start button.
- Validation: 9 Vitest cases passed, TypeScript and Vite Pages build passed, and `docs/` was staged from the Pages build. Total staged site size was 1,654,926 bytes.
- Local browser QA at 390 × 844 verified the menu, six-stat HUD, upgrade choices, damage on a wardstone, special cooldown, all three region transitions, simulated boss victory and hero unlocks, and reload/resume of both a pending upgrade and a paused Ranger run with matching health, time, and kills. Browser logs showed no errors.
- Caveat: QA stage controls fast-forwarded gate encounters and the boss. A normal 10–12 minute run and a real Android Chrome device have not yet been tested. These are the next release gates.

## 2026-09-26 — Public games hub

- https://dsschiff.github.io/games/ launched from the separate public `dsschiff/games` repository at commit `44230a596499d1d3237feb82c92122b3fe2ac77b`.
- Pages reported `built`, and the live page showed the Grovebound play/source links and a Planetfall in-development card without a private repository link.
- The hub was visually checked at 390 × 844 and desktop widths. Grovebound now links back to it from the camp menu.

## 2026-09-26 — Objective pressure and navigation pass

- Area weapon attacks and hero specials now damage nearby attackable objects while fighting enemies. Ambient waves end when a gatekeeper appears, so the fight can resolve rather than accumulating endless minor enemies.
- Added a circular region minimap with the hero, live enemies, wards, shrine/relic, and gate. It is drawn with the existing HUD update, without extra image downloads or save data.
- Local browser QA at 390 × 844 showed the minimap and a ward shattering during an active fight; the HUD changed from two wards to one. A stationary Warden lost naturally at 1:19 with 35 kills, then received three seeds and returned to camp with the run save cleared. Survival and full-run balance still need active play testing.
- Ten Vitest cases and the Pages production build passed. A real Android Chrome performance check remains open.
- Published source and `docs/` at `328582fac43885e61a31fe618ebd188da87b4db0`. GitHub Pages reported `built`, and the live page loaded `/grovebound/assets/index-DwjQFlJX.js` with the start button enabled.

## 2026-09-26 — Run breakdown pass

- Added per-run foe and object damage, damage taken, stat caches, blessings, wardstones, equipped weapons, and time in each region to the result screen. These values are included in exact run snapshots; older version-1 snapshots load with empty metrics rather than being discarded.
- Local browser QA at 390 × 844 displayed the full breakdown after a fast-forwarded three-region victory. The result panel remained scrollable at 375 × 667. Fast-forwarded region times reflect encounter minimums and do not validate ordinary play pacing.
- Ten Vitest cases passed, including legacy snapshot normalization and malformed metric rejection. TypeScript and the GitHub Pages production build passed. Initial staged site size remains below the 5 MB target.
- Still open: a complete ordinary win around 10–12 minutes and performance/accessibility testing on an actual Android Chrome phone.
- Published source and Pages build at `ff5523ddf9e431ae240d68bda57c9911b04b48b7`; Pages reported `built`, and the live game served `/grovebound/assets/index-CmTGr7Hr.js` with an enabled start button.

## 2026-09-26 — Weapon and hero identity pass

- Thorn darts now pierce one aligned enemy, Sunbow shots can crit, and staff bursts apply short burn damage. Projectiles and synthesized attack cues differ by weapon; reduced effects suppresses extra trails and flares.
- Warden starts with extra health and defense. Whirlwind knocks foes back and heals when it connects; Ranger's volley draws long-range trails and Ember's nova ignites survivors. Camp descriptions now explain the distinct play styles. Weapon rank III is labeled correctly when offered.
- Burn timers and damage are included in exact run snapshots; older snapshots without burn fields still load. Thorn geometry and malformed burn-save validation have automated coverage.
- Local browser checks at 390 × 844 showed the new camp descriptions, ranged combat, Solar Nova and Whirlwind cooldowns, and no browser errors. A 375 × 667 menu kept the start button visible. A stationary Warden still lost after 1:09; this does not establish active-play balance.
- Eleven Vitest cases and the Pages production build passed; staged site size was 1,665,219 bytes. Source and Pages build landed at `f9f6dc70c02d0475a7efc81ec2dd561892e3f95f`. GitHub Pages reported `built`, and the live game served `/grovebound/assets/index-V5sRr1JX.js` with an enabled start button.
- Still open: ordinary full-length win and midrange Android Chrome performance/accessibility check.

## 2026-09-26 — Normal-timer full-run pilot

- Added a localhost-only `?debug=1` pilot that steers toward wards, shrine steps, gate encounters, and enemies, chooses upgrades, and uses the hero special. It does not advance timers, teleport, or heal.
- In a fresh browser origin at 390 × 844, a rank-0 Warden with the starter axe completed a normal-timer run in 10:42. Region splits were Verge 3:03, Quarry 3:32, Moonfen 4:06; six wards and the Briar King fell. The result recorded 466 kills, 23,423 foe damage, 2,340 object damage, 71 damage taken, four stat caches, 17 blessings, and +8 seeds. Browser error logs were empty.
- This validates a complete progression path and its intended duration for one automated play style. The low damage taken suggests Warden kiting may be easy. Human-play balance, other heroes, and real Android Chrome performance remain open.
- Twelve Vitest cases and the production Pages build passed; staged site size was 1,667,571 bytes. Source and build landed at `8bfcb7c124fe8e06b21d7fb4ce3481bf8c29dbd6`. Pages reported `built` for that commit, and the live URL served `/grovebound/assets/index-DJz-vKq-.js` with an enabled start button and no browser errors.

## 2026-09-26 — Phone-size accessibility pass

- Removed the viewport zoom restriction, enlarged the pause target to 44 × 44 CSS pixels, and made the games hub link a 44-pixel-high target. The camp now states keyboard controls alongside touch controls.
- The upgrade, pause, and result panels now expose named dialogs. Opening one focuses its heading; Tab stays within its controls; leaving it returns focus to the labeled game canvas or the camp start button. Rebuilding hero and weapon buttons keeps keyboard focus on the selected option. The objective live region changes only when its text changes.
- At a 320 × 568 browser viewport, the camp scrolled to an enabled start button and the in-run HUD remained visible. Keyboard focus was verified through hero selection, game entry, pause, both Tab directions, resume, an upgrade choice, a loss result, and return to camp. A stationary Ranger lost at 0:21 with no browser errors. This is a desktop browser viewport check, not Android device or assistive-technology validation.
- Twelve Vitest cases and the production Pages build passed; staged site size was 1,669,111 bytes. Source and build landed at `691a550d410a1d7fb8cc6be8458e27a6c8432470`. Pages reported `built` for that commit; the live page served `/grovebound/assets/index-C8MIBRxW.js`, had no zoom restriction, displayed an enabled start button, and logged no browser errors.

## 2026-09-26 — Distinct region hazards

- Added two deterministic Ember Vents along Quarry routes and two Mist Blooms along Moonfen routes. Vents display a warning ring before a short damaging pulse; blooms visibly slow the hero within their rings. Both are optional attackable objects, disappear when destroyed, and grant experience. Their positions, health, and active state save with the run. Older run snapshots with no hazard metric still parse with zero hazards cleared.
- The minimap distinguishes vents and blooms. The result breakdown shows the number cleared. Localhost debug controls can approach or shatter a hazard for reproducible visual checks.
- Browser QA showed an intact Quarry vent, a sealed vent with its ring removed, and an intact Moonfen bloom with the slowed cue. A paused Moonfen run reloaded with its timer, health, position, and bloom intact. Debug skips into later regions at level 1 caused quick losses and were not used for balance conclusions.
- A fresh rank-0 Warden pilot completed a normal-timer run in 10:38 without advance or heal controls. Region splits were 3:02, 3:30, and 4:06. It cleared six wards and one hazard, defeated the Briar King, took 105 damage, and earned eight seeds. The 390 × 844 result panel remained readable; browser error logs were empty. This validates one automated route, not human balance or real Android performance.

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

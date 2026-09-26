# Grovebound

A portrait-first wilderness roguelite for short phone sessions. [Play the current build](https://dsschiff.github.io/grovebound/).

[All games](https://dsschiff.github.io/games/) provides a public landing page for Grovebound and future projects.

Drag on the field to move, or use WASD/arrow keys. Basic weapons attack automatically. Tap the large special button, or press Space, to use a hero ability. Pause at any time; the browser saves the run and offers Resume after a reload. Progress stays on this browser and does not sync between devices.

## The run

Cross Verdant Verge, Ember Quarry, and Moonfen. Each region has two attackable wardstones; breaking both and surviving until the gate encounter opens the path forward. A two-part optional shrine chain rewards a Glowfox companion or another temporary weapon slot. Ordinary attacks prioritize nearby enemies, then active objects. Follow the floating arrow to the next required ward, optional shrine, or gate. The Briar King has three escalating phases in Moonfen.

Speed, regeneration, attack, defense, maximum health, and reach can be upgraded through pickups and level choices. Axe and staff can gain wider splash; darts and the bow favor single targets. Three heroes have different starting stats and specials. Run rewards unlock the Ranger and Ember, while per-hero mastery adds choices, a small health bonus, a golden hero and weapon kit, a second weapon slot, and optional automatic specials. Seeds from the original release and a purchased Thorn Dart are preserved.

## Develop and publish

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
npm test
npm run build
```

The dev server prints a local address. `?debug=1` displays FPS; on localhost only, it also shows stage controls for QA. Original SVG artwork lives in `public/art`; matching PNGs are Phaser textures. `scripts/generate-heroes.py` regenerates the Ranger and Ember vectors and PNGs from the Warden design using CairoSVG.

GitHub Pages serves committed `docs/` on `main`. For a Pages build in PowerShell:

```powershell
$env:GITHUB_PAGES = 'true'
npm run build
npm run stage:pages
Remove-Item Env:GITHUB_PAGES
git add src public scripts tests docs README.md GOAL.md ROADMAP.md WORKLOG.md
```

The staging command replaces `docs/` with the verified `dist/` build and adds `.nojekyll`. Commit source and `docs/` together, push, then verify the live page. The current GitHub token cannot push workflow changes, so this repository uses `main:/docs` instead of a Pages workflow.

## Project state

`GOAL.md` is the long-term charter, `ROADMAP.md` gives the next implementation increment, and `WORKLOG.md` records releases. The browser save format is versioned (`grovebound-progress-v2`, `grovebound-run-v1`). A normal reload restores the current run; the two-second periodic snapshot limits loss after an abrupt browser crash. The first broad build still needs a real Android Chrome playtest, full-length balance work, and a performance pass before its 10–12 minute target is considered verified.

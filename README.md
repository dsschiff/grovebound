# Grovebound

A portrait-first wilderness roguelite for short phone sessions. [Play the current build](https://dsschiff.github.io/grovebound/).

[All games](https://dsschiff.github.io/games/) provides a public landing page for Grovebound and future projects.

Drag on the field to move, or use WASD/arrow keys. Basic weapons attack automatically. Tap an equipped weapon slot to focus it for 25% more damage while your other weapons deal 10% less. Tap the large special button, or press Space, to use a hero ability. Pause at any time; the browser saves the run and offers Resume after a reload. Progress stays on this browser and does not sync between devices.

## The run

Cross Verdant Verge, Ember Quarry, and Moonfen. Break two root totems in the Verge, stand in the coolant pump's ring for four cumulative seconds to expose the Quarry forge, and clear Moonfen's slowing mist blooms to unseal the moon altar. Survive until each guardian appears to open the path forward. A two-part optional shrine chain rewards a Glowfox companion, an extra weapon slot, or a focused weapon rank. Ordinary attacks prioritize nearby enemies, then attackable objects. Follow the floating arrow to the next required objective, optional shrine, or gate. The Briar King has three escalating phases in Moonfen.

Speed, regeneration, attack, defense, maximum health, and reach can be upgraded through pickups and level choices. Axe and staff can gain wider splash; darts and the bow favor single targets. A new run has two weapon slots and can find all four weapons; mastery or a relic opens a third slot. Three heroes have different starting stats and specials. Run rewards unlock the Ranger and Ember, while per-hero mastery adds choices, a small health bonus, a golden hero and weapon kit, an early third weapon slot, and optional automatic specials. Seeds from the original release and a purchased Thorn Dart are preserved.

Weapon ranks now change behavior as well as damage. The axe grows a wider cleave and eventually knocks back smaller foes; thorns pierce farther through a line; the Sunbow gains critical chance and a ricochet; the staff spreads a longer, stronger burn over a wider blast. Upgrade choices reliably include current weapon ranks while they can still grow. Each card names the next effect, each loadout slot shows its current trait and foe damage this run, and the result screen compares weapon damage with special and companion damage.

Each region also has two optional terrain fields that change nearby fights: Verge brambles slow you and enemies, Quarry ore protects enemies, and Moonfen moonstones hasten them. Attack a field to clear its effect and reveal a stat cache. The HUD names the effect when you approach, and the minimap marks each field separately.

## Develop and publish

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
npm test
npm run build
```

The dev server prints a local address. `?debug=1` displays FPS; on localhost only, it also shows stage controls for QA. Optimized transparent WebP characters and world objects live in `public/art`, with SVG weapon icons. The earlier SVG/PNG art remains in the repository as a reference.

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

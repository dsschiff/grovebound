# Grovebound

A portrait-first wilderness roguelite for short phone sessions. [Play the current build](https://dsschiff.github.io/grovebound/).

[All games](https://dsschiff.github.io/games/) provides a public landing page for Grovebound and future projects.

Drag on the field to move, or use WASD/arrow keys. Both starting weapons attack automatically. **Tap an equipped slot** to fire its named command at a target and focus that weapon. Crescent Sweep cleaves and knocks back foes in front of you; Root Volley fans out and binds them; Dawnshot reaches distant enemies with a guaranteed critical hit and extra elite damage; Ember Field leaves burning ground for four seconds. Each slot has its own eight-second command recharge; the label, bar, and countdown show when it is ready again. Fire a different slot within four seconds to trigger a **weapon resonance**. The camp previews the pair's effect; the combat cue names the second slot and time remaining. All six weapon pairs have a different payoff: roots, elite damage, knockback and fire, multi-target strikes, root and burn, or a wide fire burst. The focused weapon also gains 25% damage on automatic shots while other weapons deal 10% less. Tap the large special button, or press Space, to use a hero ability. Pause at any time; the browser saves the run and offers Resume after a reload. Progress stays on this browser and does not sync between devices.

## The run

Cross Verdant Verge, Ember Quarry, and Moonfen. Choose an Escort, Defend, or Hunt contract for the Verge before each run; the camp shows each mission's illustration and name. Guide the Waylight Moth through an ambush, defend the Seedheart while it charges, or hunt the Briar Stag across three clearings. Quarry then selects either a pump-to-forge assault or a three-flask delivery under a twelve-second carry timer. Moonfen selects either a bloom-clearing altar rite or a three-catch Moonflame pursuit. The larger illustrated mission card names the current action, explains how to advance, and shows progress; the run clock separately counts down to the guardian. The minimap uses the objective's artwork, and the floating arrow leads to the required objective. Survive until each guardian appears to open the path forward. An optional shrine chain rewards a Glowfox companion, an extra weapon slot, or a focused weapon rank. The Briar King has three escalating phases in Moonfen.

Speed, regeneration, attack, defense, maximum health, and reach can be upgraded through pickups and level choices. Axe and staff can gain wider splash; darts and the bow favor single targets. A new run starts with a chosen primary and support weapon. The axe and Sunbow are available immediately; further weapons unlock through progress. Mastery or a relic opens a third slot. Three heroes have different starting stats and specials. Run rewards unlock the Ranger and Ember, while per-hero mastery adds choices, a small health bonus, a golden hero and weapon kit, an early third weapon slot, and optional automatic specials. Seeds from the original release and a purchased Thorn Dart are preserved.

Each hero has separate running and signature action illustrations alongside their idle frame. Movement alternates the running and ready poses, with attack frames taking priority. Small weapon crests follow the hero: a bright crest shows the focused weapon and each crest flashes when its weapon fires. A ground shadow and directional recoil anchor movement and attacks. The Waylight, Seedheart, Moonflame, and mist blooms move gently in the world, and the mission card gives its own motion to escort, defense, charging, and boss states. The Reduced effects option stops decorative motion and holds a steady running frame while moving.

Weapon ranks change behavior as well as damage. The axe grows a wider cleave and eventually knocks back smaller foes; thorns pierce farther through a line; the Sunbow gains critical chance and a ricochet; the staff spreads a longer, stronger burn over a wider blast. Focusing the axe widens the cleave, thorns gain one more pierce, the Sunbow fires faster with more critical hits, and the staff burns longer over a wider area. Once a weapon reaches rank II, an upgrade offer presents two named techniques together; choosing one changes its attack behavior for the rest of that run. Upgrade cards name the next effect, each loadout slot shows its trait, command name, recharge, and foe damage this run, and the result screen compares weapon damage with special and companion damage. The run report counts resonances. An active command chain, burning fields, and their damage clocks survive pause and reload.

Each region has three optional terrain fields, including one visible from the start: Verge brambles slow you and enemies, Quarry ore protects enemies, and Moonfen moonstones hasten them. **Tap a field** to mark it for your equipped weapons (or press **F** for the nearest field); tap it again to clear the mark. Weapons do not automatically mine unmarked terrain. Breaking brambles roots nearby foes, ore explodes into a damaging shockwave, and moonstone damages nearby foes and gives six seconds of faster movement. Each field also reveals a stat cache and instantly refills all equipped weapon commands. A field mark, rooted foes, command charge, and Moonflow's remaining time survive pause and reload.

The two starting weapon commands now occupy two large buttons; both weapons keep attacking automatically. A button shows its weapon, rank, technique, run damage, focus, command name, and recharge. Tap one to fire and focus it, then tap the other within four seconds for a pair resonance. On a keyboard, 1–3 fire equipped slots. If a command has no target, the hero shows a clear range message.

Quarry and Moonfen wisps now aim a visible lance across the ground before firing. Step out of its marked lane to evade it; the result screen counts successful sidesteps and hits. The second half of each later region brings a Wild Surge with faster waves and more wisps. The warning lane and its remaining windup survive a paused run and reload.

## Develop and publish

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
npm test
npm run build
```

The dev server prints a local address. `?debug=1` displays FPS; on localhost only, it also shows stage controls for QA. Add `&seed=24` on localhost to reproduce the Briar Stag hunt. Optimized transparent WebP characters, weapons, and world objects live in `public/art`. The earlier SVG/PNG art remains in the repository as a reference.

### Browser regression and profiling

`npm run test:browser` starts a local server on port 4178 and uses installed desktop Chrome. To use Playwright's Chromium instead, install it with `npx playwright install chromium` and set `PLAYWRIGHT_CHANNEL=chromium`. The suite checks exact mission/combat continuation, real page reloads, all nine terrain clears, keyboard controls, and 390 × 844 / 320 × 568 layouts. JSON results and screenshots are written under `test-results/`.

With `npm run dev -- --port 4178` running, use `npm run profile:browser -- profile.json`. The profiler runs 600 fixed 60 Hz steps through the real scene and renderer for seed 24 Verge, seed 88 Quarry surge, and seed 144 Moonfen boss scenarios. Its JSON includes frame/render CPU timings, HUD mutations, browser identity, errors, and full final snapshots for gameplay comparison. These are desktop CPU measurements, not mobile FPS or GPU completion timings.

The static floor uses one replaceable 1800 × 1800 texture instead of redrawing its geometry each frame. Its uncompressed RGBA payload is about 12.4 MiB; browser/GPU overhead is additional. A regression checks that repeated region loads do not accumulate floor textures. Real Android memory and performance testing remains open.

Keyboard users can Tab between the field and HUD controls. Space activates the focused button; movement and the special shortcut apply while the field has focus. Weapon focus changes retain the selected button's keyboard focus. Escape opens or closes Pause, whose controls support Tab, Shift+Tab, Enter, and Space.

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

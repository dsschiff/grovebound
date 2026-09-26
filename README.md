# Grovebound

A short, portrait-first forest survival game. Move with a thumb drag (or WASD/arrow keys on desktop), collect experience and stat caches, choose blessings, and defeat the Briar King. Runs earn seeds that unlock a second starting ability.

## Play

Hosted game: https://dsschiff.github.io/grovebound/

Drag anywhere on the game field to move. Attacks fire automatically at nearby enemies. Collect the colored caches for speed, regeneration, attack, and defense. The Briar King arrives after five minutes; defeating him wins the run. The pause button stops the game, and the run also pauses when the browser tab is hidden.

Progress is stored in this browser's local storage. It does not sync between devices.

## Develop

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
npm test
npm run build
```

The dev server prints a local address. Open it on the same computer or use the hosted link on a phone. Add `?debug=1` to display the frame rate while checking phone performance.

Static output goes to `dist/`. The GitHub Pages build sets `GITHUB_PAGES=true` so Vite uses the `/grovebound/` base path. Original SVG artwork lives in `public/art`; the matching PNGs are the textures loaded by the game canvas.

GitHub Pages publishes the committed `docs/` folder on `main`. To update it on Windows PowerShell:

```powershell
$env:GITHUB_PAGES = 'true'
npm run build
npm run stage:pages
Remove-Item Env:GITHUB_PAGES
git add docs
```

The staging command replaces `docs/` with the verified `dist/` build and adds `.nojekyll`. Commit and push the source changes and `docs/` together.

## First release boundary

This build has one hero, one forest arena, three ordinary enemy behaviors, a boss, four stats, and one persistent ability unlock. More characters, maps, equipment, and unlocks belong to later iterations after the movement and combat loop has been played on a real phone.

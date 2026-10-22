# Is Warden's command effect real? 30 seeds per hero (2026-10-22)

**Yes.** Over 30 Waylight seeds per hero (w1-w23, w33-w55, w65-w75; Quarry coolantRun, Moonfen moonflame), pilot
commands cut Warden's damage taken by 56 (95% CI 31 to 82), from 113 to 57. The small Warden effect in the 3-seed
slice (-4) was noise. Ranger is now the hero whose effect is uncertain: -24 (CI -52 to +5, includes zero).

| Hero | Damage taken, on - off | Clear time, s | Lowest HP, pts |
|---|---|---|---|
| Warden | -56 [-82, -31] | -11.4 [-13.9, -8.9] | +6.7 [+2.2, +11.1] |
| Ranger | -24 [-52, +5] | -7.7 [-10.0, -5.5] | +7.2 [+2.4, +12.0] |
| Ember | -66 [-92, -39] | -6.0 [-7.5, -4.5] | +12.8 [+6.0, +19.6] |
| All (90 pairs) | -49 [-64, -33] | -8.4 [-9.6, -7.1] | +8.9 [+5.8, +12.0] |

All 180 runs were wins with both forks taken naturally, so win rate does not separate the arms. Ranger's off-arm
damage is already the lowest (87), which leaves less to cut. Full tables: hero-30seed-ci.md; raw runs:
hero-30seed.json (pilot-matrix summary in hero-30seed.md). CIs are paired Student t on (on - off) for the same hero
and seed, computed by hero-30seed-ci.mjs.

Same caveat as earlier slices: the pilot fires 128-181 commands per run, so this is an attentive player, not a
typical one. Headless Chrome with --mute-audio, scene-update stepping; no game code changed.

Reproduce: `node scripts/pilot-matrix.mjs --out reports/pilot-matrix/hero-30seed.json --contracts waylight --quarry
coolantRun --moon moonflame --seed-set w1,w3,...,w75 --commands off|on --concurrency 8`, then
`node reports/pilot-matrix/hero-30seed-ci.mjs`.

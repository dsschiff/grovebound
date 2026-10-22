# Pilot weapon commands: on vs off (2026-10-22)

Slice: 3 heroes (warden, ranger, ember) × 2 Quarry routes (coolantRun, forgeAssault), Verge contract waylight, Moonfen route moonflame, seed sets A/B/C (seeds 101, 7, 2021). 18 cells, each run twice: commands off and commands on. Same seeds and 60 Hz fixed steps; the only difference is `--commands`. Full per-run table and the per-hero summary are in `commands-slice.md`; raw rows in `commands-slice.json`.

Reproduce:

```
node scripts/pilot-matrix.mjs --out reports/pilot-matrix/commands-slice.json --baseline reports/pilot-matrix/commands-base-4c47f93.json \
  --heroes warden,ranger,ember --contracts waylight --moon moonflame --seed-set A --commands off   # then B, C; then --commands on
```

## Result

With commands on, all 36 runs still won (18/18 each side). Commands made the runs safer and slightly shorter:

| | Off | On |
|---|---|---|
| Mean damage taken | 129 | 68 |
| Mean lowest HP (fraction of max) | 72.7% | 80.1% |
| Mean full-run clock | — | 8.6 s shorter (region splits −4.1 / −1.6 / −2.8 s) |
| Mean foe damage dealt | 42,303 | 42,183 |
| Commands per run | 0 | 161 (warden 129, ranger 184, ember 170) |
| Resonances per run | 0 | 65 (0.40 per command) |

Per hero, mean change in damage taken: ember −92, ranger −89, warden −4. Damage taken fell in 15 of 18 pairs, rose in 2, and was unchanged in 1. Clock is bounded by region timers and guardian countdowns, so commands cannot shorten a run by much; damage taken and lowest HP are the measures that move. Total foe damage is unchanged because kills are bounded by spawns. Commands move damage earlier and onto groups, which matters for how much damage the hero takes, not for how much damage is dealt.

## What the pilot does

`pilotCommand` in `src/game/pilot.ts` decides per frame. In order:

1. If a chain is open and a different ready slot has a foe in command range, tap it, which lands the resonance.
2. If a slot is ready with a foe in range and a partner slot will recharge inside the chain window (4 s, or 6 s with the Conductor kit), tap the slot that has the most foes in range. This opens a chain.
3. If no partner can follow, tap only on a cluster of 3 or more foes in range, or when an elite is in range.

The scene calls `focusWeapon`, the same entry point as a slot tap or Space press. A tap therefore also focuses that weapon, which gives +25% to its auto attacks and −10% to the other weapons. That matches what a player gets.

In practice this policy fires almost on cooldown. Sunbow, the longest-range command, fired 77–80 times per run, close to the 8 s recharge limit of about 79 over 10.5 minutes. The result is an upper bound for an attentive player who uses commands well. It does not show what a typical human will do.

## Default game unchanged

- Commands-off rows match the pre-change baseline `commands-base-4c47f93.json` exactly on all 18 runs. The baseline was recorded from base `4c47f93` before any edit. The comparison covers outcome, clock, splits, damage taken and dealt, kills, level, forks, lowest HP and its timing, weapons, and step count. The per-run table is in `commands-slice.md`, section "Commands-off runs vs baseline".
- Pilot commands are off unless `setDebugPilotCommands(true)` is called. Only the pilot matrix calls it, and only with `--commands on`. The in-game PILOT debug button is unchanged. The new scene code runs only inside `updateDebugPilot`, which runs only while the debug pilot is enabled.

## Limits

This is one decision policy on desktop Chrome with scene-only stepping and 18 pairs. It is automated route evidence. It is not human balance, and it is not Android evidence. To isolate what resonances add on top of plain commands, run a variant policy with pairing disabled (see the track ideas file).

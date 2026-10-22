# Pilot commands split into plain commands, resonance, and focus (2026-10-22)

PR #9 found that pilot commands cut damage taken roughly in half. That arm mixed three things: the commands
themselves, resonance chains, and focus moving to the last commanded weapon. Two new pilot-only switches separate
them. Result over 54 paired runs (3 heroes × 2 Quarry routes × 9 Waylight seeds, Moonfen route fixed to moonflame):

- **Plain commands do most of it.** They account for about 60% of the drop in damage taken (−41 of −69) and about
  two thirds of the shorter clear time (−6.5 of −10 s). Both are clearly non-zero.
- **Resonance and focus each add about a fifth of the damage-taken drop** (−12 to −17 each). Each excludes zero in
  only one of the two subtraction orders, and only just: focus −17 ±14 in order 1 (−14 ±16 in order 2), resonance
  −15 ±13 in order 2 (−12 ±14 in order 1). The intervals are also likely too narrow (see Decomposition), so neither
  part is firmly established at this sample size.
- **Lowest HP does not move with plain commands alone** (+1.0 pts, ±3.7). Most of the +6.6-point gain comes from
  resonance and focus together; how it splits between them depends on the order of the subtraction.
- **By hero, the parts differ.** Warden's gain is mostly focus (−31 to −33 damage taken; plain −21, not significant).
  Ranger's is mostly plain commands (−60) plus some resonance (−18 to −24), with no focus part. Ember is mostly plain
  (−41), with the remainder split between focus and resonance in a way that depends on the order. Each hero has 18
  pairs, so per-hero parts are rough.

The 3-seed slice the track asked for (seed sets A–C, 18 pairs) points the same way overall: plain −56 of −62 damage
taken. But it is too small to split by hero. In that slice warden's total change was −4, against −64 over nine seeds.
The nine-seed numbers are the ones to use.

Caveat that applies to every number here: the pilot taps a command almost as soon as it recharges (in PR #9's arm, 128–178
commands per run on average by hero). The parts describe an attentive player who uses commands well. They do not describe a typical player.

## The three effects inside PR #9's commands-on arm

Line numbers are at base e7318d3.

- **Plain command.** A slot tap goes through `GroveScene.focusWeapon` (GroveScene.ts:332). If that weapon's command is
  recharged and `autoAttack(weapon, true)` finds a target, it fires a commanded attack (2× damage, 2.35× for the bow,
  longer reach; :1269, :1297) and starts an 8 s recharge (7 s with the Conductor kit; :338).
- **Resonance.** Every command opens a chain for 4 s (6 s with Conductor; :340). A command from a different weapon
  inside that window fires a pair resonance instead of opening a new chain (`commandChainResult`, resonance.ts:42;
  `fireResonance`, GroveScene.ts:1468). All six distinct weapon pairs have a resonance (resonance.ts:27-30).
- **Focus.** `focusWeapon` sets `focusedWeapon` before it tries to fire (:336), and focus stays there until the next
  tap. With two or more weapons the focused weapon's auto attacks deal +25% and the others −10% (:1295). A focused bow
  also gets a 0.78 auto-attack cooldown (:1285) and +12% crit chance (:1294). A relic found with all slots full ranks
  up the focused weapon (:1765). Without commands, focus stays on the starting weapon all run.

## The new pilot arms

Both switches live only in the debug pilot and default to off. The normal game and the PR #9 arms do not change.

| Arm (matrix flags) | What the pilot does |
|---|---|
| `off` (`--commands off`) | Never taps a command. |
| `cmd` (`--commands on`) | PR #9 policy: opens and lands chains; focus follows the last command. |
| `cmd-solo` (`--pairing off`) | Same firing rules, but never lands a chain. Since every pair resonates, it taps nothing while a chain is open. |
| `cmd-restore` (`--focus restore`) | PR #9 policy, then taps the starting weapon again to move focus back. |
| `cmd-solo-restore` (both) | Solo commands with focus restored: the plain-command arm. |

How the restore works: the only player path that changes focus is `focusWeapon`, so the pilot taps the starting
weapon (`pilotShouldRestoreFocus`, src/game/pilot.ts). That tap fires a command if the starting weapon is recharged and
has a target in command range. The pilot therefore restores only when the starting weapon is recharging or has no
target (a debug-only copy of `autoAttack`'s commanded targeting), and otherwise waits. It runs before the frame's auto
attacks. The matrix counts restore taps that fired a command (`restoreFires`, 0 in every run) and game seconds with
focus away from the starting weapon (off-focus seconds).

Focus could not be isolated completely without changing game code. The commanded shot itself is always fired with focus
on the commanded weapon, so it gets the +25% (or the bow's 0.78 cooldown on its next auto attack). That part stays in
"plain".

## Did each arm do what it claims?

Nine-seed file, 54 runs per arm. All 270 runs won, with no softlocks and no page errors. Every run got the Waylight
contract.

| Arm | Commands per run | Resonances per run | Off-focus s per run | Restore taps that fired |
|---|---|---|---|---|
| cmd (PR #9) | 158.0 | 63.8 | 408 | — |
| cmd-restore | 163.5 | 67.8 | 0.3 | 0 |
| cmd-solo | 130.9 | 0.0 | 382 | — |
| cmd-solo-restore | 136.4 | 0.0 | 0.6 | 0 |

- In PR #9's arm, focus was away from the starting weapon for about 408 s of a ~636 s run (64%). The restore arms bring
  that under 1 s per run.
- The solo arms land no resonances at all, by construction. The DoD allowed for incidental resonances. There are
  none, because every weapon pair resonates and the pilot taps nothing while a chain is open.
- **The solo arms fire about 17% fewer commands** (131–136 per run against 158–164). They must wait out the 4 s window
  after each command. The resonance part therefore also includes about 27 extra commands per run. It is "pairing,
  plus the extra commands pairing allows", not resonance damage alone.

## Decomposition (54 pairs, nine seeds)

Mean of (arm − off) per run, with 95% intervals of ±1.96·SD/√n of the per-run paired differences. Two caveats on
those intervals. They treat every run as independent, although the same seeds are shared across heroes and routes, so
they are likely too narrow. And the per-hero rows (n = 18) use 1.96 rather than t(17) ≈ 2.11, which makes them about
7% narrower still. The Moonfen route is fixed to moonflame in every run. Plain = cmd-solo-restore − off. The two orders subtract the remaining arms differently and both sum to the total:

- **Order 1:** resonance = cmd-restore − cmd-solo-restore; focus = cmd − cmd-restore.
- **Order 2:** focus = cmd-solo − cmd-solo-restore; resonance = cmd − cmd-solo.

| Hero | Metric | Off mean | Total (cmd) | Plain | Resonance (1) | Focus (1) | Focus (2) | Resonance (2) |
|---|---|---|---|---|---|---|---|---|
| all (54) | Damage taken | 123 | −69 ±20 | −41 ±20 | −12 ±14 | −17 ±14 | −14 ±16 | −15 ±13 |
| all (54) | Lowest HP (pts) | 73.7 | +6.6 ±3.2 | +1.0 ±3.7 | +0.8 ±4.6 | +4.7 ±4.1 | +1.8 ±4.2 | +3.8 ±3.4 |
| all (54) | Clear time (s) | 636.5 | −10.0 ±1.6 | −6.5 ±1.4 | −2.2 ±1.3 | −1.3 ±1.2 | −2.5 ±1.1 | −1.0 ±1.2 |
| warden (18) | Damage taken | 129 | −64 ±36 | −21 ±25 | −12 ±20 | −31 ±27 | −33 ±29 | −10 ±24 |
| warden (18) | Lowest HP (pts) | 78.0 | +5.0 ±5.0 | −1.0 ±4.4 | +2.3 ±4.8 | +3.7 ±5.2 | +3.8 ±4.1 | +2.2 ±3.9 |
| warden (18) | Clear time (s) | 640.7 | −12.6 ±2.9 | −7.8 ±2.7 | −2.1 ±2.6 | −2.7 ±2.4 | −4.3 ±1.9 | −0.5 ±2.7 |
| ranger (18) | Damage taken | 129 | −77 ±40 | −60 ±45 | −24 ±23 | +7 ±22 | 0 ±28 | −18 ±25 |
| ranger (18) | Lowest HP (pts) | 74.0 | +5.5 ±5.3 | +2.2 ±5.6 | −1.6 ±8.0 | +4.9 ±7.8 | −0.1 ±5.8 | +3.4 ±3.6 |
| ranger (18) | Clear time (s) | 636.6 | −9.9 ±3.0 | −6.0 ±2.9 | −3.5 ±2.2 | −0.4 ±2.0 | −2.7 ±2.0 | −1.1 ±1.8 |
| ember (18) | Damage taken | 110 | −67 ±26 | −41 ±28 | +1 ±26 | −27 ±22 | −9 ±23 | −17 ±17 |
| ember (18) | Lowest HP (pts) | 69.1 | +9.5 ±6.3 | +1.9 ±8.8 | +1.8 ±10.3 | +5.7 ±8.2 | +1.6 ±10.6 | +5.9 ±8.8 |
| ember (18) | Clear time (s) | 632.3 | −7.6 ±1.6 | −5.8 ±1.4 | −1.0 ±1.8 | −0.8 ±1.5 | −0.4 ±1.3 | −1.4 ±1.6 |

Where the two orders disagree (ember's damage taken, lowest HP everywhere), the effects interact: resonance helps more
when focus is not restored, or the reverse. Treat those parts as a joint resonance-and-focus effect.

Warden starts with the axe and later carries the bow. Commanding the bow moves focus onto it, so the bow's auto
attacks get +25%, a 0.78 cooldown and +12% crit for the rest of that stretch. That is the likeliest reason focus
matters most for warden. The runs show it is consistent with the data; they do not prove that mechanism.

## Default game and PR #9 arms unchanged

`reports/pilot-matrix/resonance-split.md`, section "Runs vs baseline": the off and cmd arms rerun on this branch match
`commands-slice.json` (PR #9's slice) on all 36 runs, across every outcome field plus commands, commands by weapon and
resonances. "Identical to baseline: 36/36." The new switches are reachable only through `setDebugPilotCommands`, and
only the pilot matrix calls it. The A–C rows in the nine-seed file are copied from that A–C run, not rerun.

## Files and reproduce

- `resonance-split.md`: summary of the requested slice (seed sets A–C, five arms × 18 runs), including the baseline
  check. Its JSON is not committed, because its 90 rows are identical to the A–C rows of `resonance-split-9seeds.json`.
- `resonance-split-9seeds.json` / `.md`: the A–C rows plus Waylight seeds 11, 13, 41, 43, 77, 99 (`--seed-set wN`),
  five arms × 54 runs. The tables above come from this file. The intervals were computed from its rows; the `.md`
  decomposition table has the same means.

```
# per arm: --commands off | --commands on | on --pairing off | on --focus restore | on --pairing off --focus restore
# A-C slice with the baseline check (regenerates resonance-split.md; the json it writes is a scratch file):
node scripts/pilot-matrix.mjs --out reports/pilot-matrix/resonance-split.json --baseline reports/pilot-matrix/commands-slice.json \
  --heroes warden,ranger,ember --contracts waylight --moon moonflame --seed-set A --commands on --pairing off --focus restore
# repeat for --seed-set B, C; for the nine-seed file use --out reports/pilot-matrix/resonance-split-9seeds.json
# with --seed-set A B C w11 w13 w41 w43 w77 w99
```

## Limits

This is one decision policy, run headless on desktop Chrome with scene-only stepping. It is automated route evidence.
It is not human balance and not Android evidence. The solo arm's lower command rate is built into how resonance works
(every weapon pair resonates), so a pure "resonance damage only" part cannot be measured with this pilot. A
rate-matched control is listed in the track ideas file.

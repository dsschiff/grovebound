# Pilot commands split into plain commands, resonance, and focus (2026-10-22)

PLACEHOLDER-RESULT

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

PLACEHOLDER-TABLES

# Grovebound roadmap

Check off a milestone only after its live build is verified. The next unchecked item is the next implementation target.

- [x] **1. Combat foundation:** six core stats, weapon-specific reach and splash, readable damage/gain feedback, optional special, reduced effects, typed progression migration, and a playable release.
- [x] **2. World objectives:** deterministic clearing layouts, attackable wards, optional shrine chain, gatekeeper and wave pacing, first region, and a playable release.
- [ ] **3. Complete run:** Ember Quarry and Moonfen, final phased boss, victory flow, versioned exact run resume, and a balanced 10–12 minute run.
- [x] **4. Roster and mastery:** three distinct heroes, four weapons, per-hero mastery, pet relic, temporary third slot, skins, and richer animation.
- [ ] **5. Polish and hub:** sound and visual tuning, Android Chrome performance pass, accessibility pass, and a separate public games hub.

## Design decisions

- Main input is thumb drag and automatic basic attacks. A large optional special button can become automatic at mastery rank 5.
- Verdant Verge has two root totems. Ember Quarry asks the player to stand inside a coolant-pump ring for four cumulative seconds to expose its forge core. Moonfen asks the player to clear two slowing mist blooms to unseal a moon altar. Each region then has a gate encounter and an optional shrine chain. Auto attacks hit nearby enemies before attackable objects; splash attacks and specials can damage both. Ambient waves stop when the gatekeeper appears, leaving its phase reinforcements as the encounter pressure.
- The Warden starts with an axe, Ranger with thorns, and Ember with a staff. A Sunbow is the fourth weapon. Every run starts with two weapon slots and can find all four weapons. Mastery rank 4 starts with a third slot; a later relic can open it otherwise. Tapping an equipped weapon focuses it for 25% more damage while other equipped weapons deal 10% less damage.
- The axe cleaves clusters, thorns pierce one aligned foe, the Sunbow can land critical hits, and the staff leaves a short burn. Warden starts tougher and uses Whirlwind for knockback and healing; Ranger's volley reaches distant foes; Ember's nova ignites survivors. Burn state survives run resume.
- Ember Quarry has optional attackable vents that warn before short eruptions. Moonfen's mist blooms slow movement inside their rings and are required for the altar sequence. Their object state survives run resume.
- The Briar King periodically marks the ground ahead of the hero's current movement. A visible ring gives time to change direction before the strike lands; later phases widen the strike and shorten its cooldown. The marker and countdown survive run resume.
- Browser storage remains local. Migrate `grovebound-progress-v1` to `grovebound-progress-v2` without consuming old seeds or removing the Thorn Dart unlock.
- Keep Grovebound and Planetfall separate. Build `dsschiff/games` as a later public Pages hub; do not link a private Planetfall URL from it.

## Release gate

Run `npm test` and the production build; stage the Pages build into `docs/`; commit source and `docs/` together; push; verify the live URL and commit; record findings in `WORKLOG.md`.

## Next unfinished increment

Milestone 3 systems are implemented, including all regions, a phased boss, victory, and exact local resume. A localhost playtest pilot completed a fresh Warden run under normal timers in 10:42; human-play difficulty and other heroes still need validation before calling it balanced. The public games hub is live; keyboard navigation and dialog semantics have been checked in a desktop browser at phone size, but milestone 5 still needs a real Android Chrome performance and assistive-technology check.

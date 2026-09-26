# Grovebound roadmap

Check off a milestone only after its live build is verified. The next unchecked item is the next implementation target.

- [x] **1. Combat foundation:** six core stats, weapon-specific reach and splash, readable damage/gain feedback, optional special, reduced effects, typed progression migration, and a playable release.
- [x] **2. World objectives:** deterministic clearing layouts, attackable wards, optional shrine chain, gatekeeper and wave pacing, first region, and a playable release.
- [ ] **3. Complete run:** Ember Quarry and Moonfen, final phased boss, victory flow, versioned exact run resume, and a balanced 10–12 minute run.
- [x] **4. Roster and mastery:** three distinct heroes, four weapons, per-hero mastery, pet relic, temporary third slot, skins, and richer animation.
- [ ] **5. Polish and hub:** sound and visual tuning, Android Chrome performance pass, accessibility pass, and a separate public games hub.

## Design decisions

- Main input is thumb drag and automatic basic attacks. A large optional special button can become automatic at mastery rank 5.
- Each region has two required wardstones, a gate encounter, and a two-part optional shrine chain. Auto attacks hit nearby enemies before objects; wave breaks allow objective work.
- The Warden starts with an axe, Ranger with thorns, and Ember with a staff. A Sunbow is the fourth weapon. Mastery rank 4 gives a second permanent weapon slot; a rare run relic grants a third.
- Browser storage remains local. Migrate `grovebound-progress-v1` to `grovebound-progress-v2` without consuming old seeds or removing the Thorn Dart unlock.
- Keep Grovebound and Planetfall separate. Build `dsschiff/games` as a later public Pages hub; do not link a private Planetfall URL from it.

## Release gate

Run `npm test` and the production build; stage the Pages build into `docs/`; commit source and `docs/` together; push; verify the live URL and commit; record findings in `WORKLOG.md`.

## Next unfinished increment

Milestone 3 systems are implemented, including all regions, a phased boss, victory, and exact local resume. Validate ordinary full-length runs and tune enemy density, objective health, pickups, and boss difficulty until real runs land near 10–12 minutes. Then complete milestone 5 with a real Android Chrome performance check and the public games hub.

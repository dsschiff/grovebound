# Grovebound goal

Build a polished, portrait-first roguelite that can be opened quickly on an Android phone at https://dsschiff.github.io/grovebound/. A complete run crosses three connected wilderness regions in about 10–12 minutes. Players move with a thumb, collect meaningful stats, choose weapons and relics, destroy environmental wards to open gates, and defeat a final boss. Repeated runs unlock heroes, choices, cosmetics, and a small capped mastery bonus.

## Quality bar

- Every release remains playable from the public link and preserves existing browser progress.
- Combat gives readable feedback for damage, gains, danger, and objectives, with a reduced-effects option.
- Three heroes have distinct starting play styles and specials. Four weapons and optional relics support different builds without requiring permanent power grinding.
- A normal phone reload resumes the same run state; an abrupt crash loses no more than the latest two seconds of play.
- Target smooth 60 fps on a midrange Android Chrome phone and no sustained drop below 30 fps in a dense encounter. Keep the initial transfer below 5 MB.
- The final release is verified by a complete win and loss, real-device play, and live Pages readback.

## Working agreements

Use `ROADMAP.md` for the next unfinished increment and `WORKLOG.md` for commit, tests, live deployment, and remaining risks. Publish small verified releases from `main:/docs`; the current GitHub token cannot push workflow changes. Keep Planetfall in its own private repo. A separate public `dsschiff/games` hub may link to Grovebound and describe Planetfall as in development without exposing the private repo.

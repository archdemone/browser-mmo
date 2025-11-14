# Warrior Skill QA Checklist

This checklist should be completed for each build before shipping the Warrior kit.

## Geometry & Timing
- [ ] Heavy Strike hit geometry matches gizmos for stationary and moving dummies.
- [ ] Cleave cone angles and range match visuals; dedupe group prevents double hits.
- [ ] Ground Slam initial impact and ring damage align with visuals and timing delays.
- [ ] Sweep multi-hit window respects per-target cooldown (200 ms) and tick rate.
- [ ] Leap Slam and Shield Charge movement components respect collision and stop on heavy targets.

## Supports & Derived Skills
- [ ] Increased Area support modifies cone/line skills and highlights op trace correctly.
- [ ] More Melee Damage support applies base multiplier and cooldown penalty without validation errors.
- [ ] Invalid supports (e.g., Pierce on melee skills) show disabled state with reason in Skill Lab.
- [ ] Export/import round-trips retain applied supports and variants.

## Sandbox & Performance
- [ ] Low-visibility toggle hides heavy VFX and gizmos as expected.
- [ ] Profiles (Early, Mapping, Bossing) change dummy stats and toggles correctly.
- [ ] FPS remains stable while repeatedly casting each skill in Low-visibility and normal modes.
- [ ] Particle, status, projectile, and gizmo counts stay within documented guardrails.

## Unlock Flow
- [ ] Level gates (1,5,10,15,20,25) unlock correct skills.
- [ ] Choice panel at level 25 offers Shield Charge vs Lunge and binds chosen skill.
- [ ] Keybind bar updates visual assignments after unlocking skills.

## Regression Checks
- [ ] Autosave/commit workflow persists Warrior presets.
- [ ] Undo/redo functions correctly after component edits.
- [ ] Dummy spawner formations (single/pack/line) spawn without errors.

Document findings in this file before marking Phase 7 complete.

# Leadership 101 — Phase 5: Eight immersive story conversions

Eight existing scenario library entries (l101-02 through l101-09) now have authored 15-scene branching story assets here. This is an addition to the existing checkpoint/conversation modes, not a replacement.

Each story includes three outcomes driven by the existing server-side trust/pressure engine, scenario-specific ethical/leadership tradeoffs, stage imagery using existing site-owned backgrounds, immediate reactions with coaching, live instructor challenge decisions, and scenario-aware reporting. Each graph includes an opening, three initial consequences, attempts to repair, distinct middle-stage tensions, a final crisis, three routes into calculated endings, and three reflections. Student join stays name + class code; no identity tracking added.

## Publishing rules
- Keep original payload fields `moments`, `characters`, `injects`, `briefing` and `mission` unchanged.
- Set only the `story` JSON property on each matching master scenario payload; update the master scenario for **future** classrooms only.
- Do not rewrite `l101_live_classes.scenario_snapshot` or `l101_live_participants.assigned_scenario_snapshot`. Active and past cohorts retain locked snapshots.
- A new classroom will default to Interactive Story Journey and can switch to Original Decision Checkpoints.
- Test every graph using `node --test scripts/test-leadership101-phase5.mjs` and existing Phase 4 source checks.
- In-person acceptance testing and a multi-device classroom pilot still remain release gates for full-scale instruction.

## Scenario mapping
- l101-02 — The Deadline and the Team
- l101-03 — The Conflict Crossroads
- l101-04 — Team Northstar
- l101-05 — A Vision Worth Following
- l101-06 — The Integrity Test
- l101-07 — When Excellence Plateaus
- l101-08 — The Leader Everyone Fears
- l101-09 — The Obstacle Course

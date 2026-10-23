# Leadership 101 Live — Phased Product Upgrade

Owner: Mayne Leadership. Student enrollment **remains name + classroom code**, without requiring a student account. Instructor authorization stays authenticated and scoped.

## Phase 1 — Reliability, feedback, retraining (implemented in this branch)
- Resume at the earliest ungraded checkpoint; keep saved progress across sessions.
- Instructors can reopen graded checkpoints and all subsequent decisions, giving the student another attempt. Previous responses and evaluations are recorded in a server-side audit trail.
- Scenario snapshots are frozen at classroom creation. Updating the scenario library will affect future classrooms without silently altering an active cohort's story.
- Instructor competency feedback provides five optional behavior dimensions: Communication, Empathy, Accountability, Judgment, Integrity. Existing Positive / Neutral / Negative remains available.
- Students see actual authored situation consequences (character reaction, organizational signal, leadership insight) after a prepared choice rather than generic feedback.
- Students can complete and save recovery plans for weaker decisions.
- Student print/PDF reports and instructor class exports include competency feedback, recovery plans, authored character dialogues, and decision history.
- Performance: detailed instructor reports are loaded on demand, not on every notification refresh.

## Phase 2A — Restore authored character interactions (implemented pilot foundation in this branch)
- Four actors per scenario (36 across nine scenarios), with authored two-turn dialogue (72 total authored turns).
- Student picks whom to talk to and selects dialogue options. Each response produces an individual character reaction, coaching insight, and relationship effect. Progress is saved online.
- Optional conversation practice does not block the existing three graded observation decisions.

## Phase 2B — Immersive branching stories (pilot delivered)
- **The First-Time Leader** now supports 15 authored branching scenes, three alternative endings, scene imagery with character expressions, persistent outcome decisions, and instructor injects that alter the story before resuming.
- Instructor progress, completion notifications, student print/PDF path export, and server-side choice validation are implemented.
- All eight remaining scenarios keep their original checkpoint engine. The next content rollout will use the pilot as the reference implementation.
- See `docs/leadership101-phase2b-branching-story.md` for activation and testing.

## Phase 3 — Instructor Studio and course operations (next)
- Visual scenario editor (scenes, characters, dialogue choices, branches, assessment and rubric preview), draft/publish/version workflows.
- One class roster assigning different scenarios to individual students or groups without separate join codes.
- Assignment scheduling, cohorts, bulk actions, individualized pacing, instructor intervention and simple timed injects.
- Cohort analytics by behavior and competency, common decision patterns, repeated attempt growth and response turnaround, plus export formats.

## Phase 4 — Quality / scalability / interoperability (next)
- WCAG 2.2 AA keyboard, focus-management, contrast and screen reader review.
- Connectivity and idempotency tests, classroom load tests (start with 30–60 concurrent students across four scenarios), live cross-device usability pilots and mobile QA.
- LMS integration hooks and LTI 1.3/grade return study for CREASY. Student identity remains optional for practice deployments.
- Usage monitoring, privacy/retention controls, error recovery, role-appropriate audit logs.

## Verified on Phase 1 backend
1. A new name-and-code learner joins a class and receives their private scenario.
2. Existing authored conversations save two choices and reactions; secrets are excluded from student state.
3. Original written response awaits human rating; a competency rubric and recovery plan are stored and returned in student state.
4. Instructor-authorized reopen removes active graded work but keeps history records.
5. Database test work is wrapped in transaction + rollback, leaving live class data intact.
6. Vercel branch previews build to READY.

## Manual release smoke test
Use one signed-in instructor browser and one or more student browsers. Reopen a checkpoint while a learner has the scenario open, then verify the learner returns to the correct step and can submit again. Grade using the notification center with competency descriptors, save a recovery plan, try all character dialogue options, download a report, and test print. Verify an existing classroom continues to use its original story if an instructor updates the scenario library. No need to create student login credentials.

# Leadership 101 Online — Phase 2B Branching Story Pilot

## Delivered
The new `The First-Time Leader — An Unfolding Story` pilot uses the same online student and instructor portals at `/leadership101-live.html`. It ships with:
- 15 authored scene nodes, 3 distinct endings (strong, fragile, damaged), and multi-step decisions that change the next scene and leadership consequences.
- A full-screen-style scene treatment with existing site-owned workplace imagery, reusable vector character portraits, scene titles, actor emotional expressions, and responsive decision cards.
- Immediate consequence and coaching insight after each decision.
- A per-student state machine, outcome indicators (trust, operational pressure), a private immutable decision/event trail, and deterministic resume after browser close/reopen.
- Instructor-released injects that interrupt the storyline, require the student to choose a response, affect trust/pressure, and return to the paused story scene.
- A story-completion notification in the existing instructor bell, student/teacher printable decision path reports, story progress displayed in the instructor class roster.
- Original fixed checkpoint mode and two-turn character conversations remain available under **Original Decision Checkpoints**, so the new pilot does not remove existing content.
- No student account requirement; name + class code is unchanged.

## Starting a pilot classroom
1. Sign into MayneLeadership.com Leadership 101 Live **Instructor Command Center**.
2. Create a **new** class, choose **The First-Time Leader**. New classes capture the current authored story snapshot.
3. Share the class QR code or joining link. Students enter names as before.
4. Students default to **Interactive Story Journey**. They can switch to **Original Decision Checkpoints** if desired.
5. To introduce a real change, use **Release change injects** during the student's journey. The injected challenge appears on their screen and requires an answer. Instructors can monitor story status and receive a completion alert.
6. When a student reaches an ending, review the student report or print/export the path from the instructor roster.

## Compatibility
- Existing classrooms retain their locked scenario snapshot. Older classes started before Phase 2B do not automatically acquire the new story. Create a new class to pilot it.
- The other eight scenarios remain on the previous checkpoint + character dialogue engine. No hidden automatic migration was performed.
- New branch story design source is tracked in `data/leadership101-first-time-leader-story.json`. The database stores the authored story on the master `l101-01` scenario. The build process does not serve the `data/` directory publicly.
- Student client only receives the **current** story scene and visible options via a token-scoped RPC; other paths and scoring rules are server-controlled.
- Story score and decision events are private and instructor-readable through RLS.

## Verified
- Server-side transactions (rolled back): reached strong, fragile, and damaged endings through distinct decision paths.
- Verified instructor inject interrupts the narrative, accepts a decision and resumes the paused path.
- Stale/duplicate scene choices are rejected; legitimate progress resumes to the exact node.
- Unrelated authenticated account sees zero rows in story-run table.
- Branch Vercel previews reached READY with the bundled character portrait module.
- Existing classroom and learner records remain intact.

## Follow-up
A true two-device browser acceptance test, keyboard/screen-reader review, and 30–60-person classroom load test remain necessary before formal large-class grading. The next development phase is the visual scenario authoring interface and scaling the branching engine to more scenarios.

# Leadership 101 — Phase 3: Visual Authoring and Multi-Scenario Classrooms

## Delivered
- **Instructor Visual Scenario Builder**: `/leadership101-builder.html`, accessible to signed-in authorized Leadership 101 instructors from the Instructor Command Center.
- **Private drafts and deliberate publishing**: Save multiple iterations without changing live content, validate the authored story graph, publish into the instructor's scenario library when ready, and retain the published version count. The publisher checks required title, character/inject/checkpoint arrays, scene links, and ending references.
- **Visual content editing**: Scenario briefing and mission, scene cards, branching decision choices with consequences and trust/pressure effects, act-grouped route map, character profiles and scripted dialogue turns, prepared decision checkpoint actions and ratings, inject templates, local story preview, and JSON import/export.
- **Per-student scenario assignments**: One class link and code can serve multiple simultaneous scenarios. The instructor assigns a scenario to each participant; a locked scenario snapshot is attached to that student's enrollment. The assignment is restricted to the instructor and denied after the participant has started a decision, story run, character dialogue, or recovery plan.
- **Teams**: The instructor can give each participant a team label and assign a whole team a scenario in one database transaction. Bulk assignments fail if any team member has started, preventing partial reassignment.
- **Optional classroom hold mode**: Choose "Wait for instructor assignment" when creating a new class. Participants can join using a name and class code as before, but they see a welcoming waiting room and can message the instructor until assigned. Instructor assignment opens the student scenario on subsequent refresh.
- **Scenario-specific injects**: Release a prepared change request only to participants assigned a particular scenario; does not interrupt students in unrelated scenarios sharing the class.
- **Classroom analytics**: Counts by assigned scenario, started/completed status, pending reviews, and a summary of Communication, Empathy, Accountability, Judgment and Integrity ratings.
- **Reports/notifications**: Review and individual reports resolve the student's assigned scenario, rather than assuming every student is in the classroom default.

## How to start
1. Open `https://mayneleadership.com/leadership101-live.html` and sign in to **Instructor Command Center**.
2. Click **Open Visual Scenario Builder**. Pick a published scenario to begin a private draft, or create a new story.
3. Edit **Scenes & Choices**. Open **Branch Map** to inspect destinations, **Try the Story** to check a pathway, and **Save Draft**. The student experience is unchanged until you click **Publish to Classroom Library**.
4. Back in the Instructor Command Center, create a classroom. For group rotation sessions, check **Wait for instructor assignment**.
5. Share the class code/QR link. Students enter names, no user account needed.
6. Assign individual scenarios or type **Team** names on roster cards and use **Assign team scenario**. Students automatically receive the matching learning activity. Scenario assignments become locked as soon as the student starts.
7. Use the grouped progress/competency dashboard and scenario-specific inject library while facilitating; send messages and evaluate unique responses in the existing instructor notification center.

## QA and safety notes
- Changes to master scenarios never mutate active classroom or student assignment snapshots.
- The existing nine published scenarios are preserved; previously running classes retain their prior snapshot.
- Drafts are restricted by Supabase Row Level Security. The publish and assignment RPCs authenticate the instructor and check classroom/scenario ownership.
- Server-side simulations used temporary test classrooms, rolled-back transactions, and verified hold state, scenario isolation, team assignment and broken-link rejection.
- Vercel preview builds reached READY. Full live two-device browser acceptance, keyboard/screen reader audit and classroom concurrency testing remain open.
- No student identity verification or student account was introduced.

## Remaining improvements / next phase
- Phase 4: two-device browser end-to-end test, WCAG 2.2 AA keyboard/focus checks, connectivity/offline-handling tests, 30–60 concurrent student load evaluation, privacy/retention controls, and LMS interoperability.
- Visual editor can continue to evolve with graphical drag-to-connect links, better built-in artwork selection, reusable scenario templates, dynamic character expressions, and team-aware reporting.

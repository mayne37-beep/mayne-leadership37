# Leadership Impact Lab — facilitator guide

**Location:** Classroom Tools → Leadership Impact Lab, or `/leadership-impact-lab.html`.

Leadership Impact Lab is a live, peer-powered leadership assessment center for Leadership 101. The active team receives an ambiguous scenario; all other teams observe, ask questions, and anonymously rate the **perceived** impact of the team’s response. There is no answer key, automated win/loss outcome, or simulation-imposed ethical score.

## Launching a session

1. Sign in through the existing MayneLeadership.com site PIN and open the instructor console.
2. Name the session, select **2 to 6 teams**, and create it. Share the displayed student QR / link. Participants choose their assigned team and are issued a pseudonymous, device-local participation token; **names are never collected**.
3. Open the clean **Presentation View** in another browser window. In Teams, share **only the Presentation View**; keep the facilitator dashboard private. The presentation does not show raw comments.
4. Select the active team and a scenario; use **Random (avoid repeats)** or choose a specific one. Launch the round. Each case is a 190–210-word workplace narrative with genuine uncertainty, competing priorities, and no prescribed correct answer.
5. During discussion, students can ask for more information and observers may submit up to two anonymous questions. The facilitator can click **Release evidence 1**, **Release evidence 2**, and **Release evidence 3** at appropriate moments. Each new perspective is then shown simultaneously in the student view and the comment-free Teams presentation, but not before. The facilitator console also has private cues suggesting leadership behaviors to observe, rather than an answer key. Questions remain private to the instructor until read aloud.
6. As soon as a new round starts, students on **non-presenting teams** see the **Your feedback on the presenting team** card at the top of their response page, including three 0–100 sliders and an anonymous written feedback/question box. They can **prepare** their responses while they observe and discuss; submitting stays disabled until the facilitator clicks **Open observer ratings**. Once voting opens, students submit or update their personal ratings and comments. The presenting team never rates itself. The instructor dashboard now has an **Open student feedback page** shortcut for checking the student view.
7. Click **Reveal peer feedback**. The average/range is shown only with at least **three responses**. Discuss disagreements and ask the active team whether to defend, revise, or clarify its response.
8. Start the next round and rotate the active team. At the end, click **Export all rounds** for a CSV report including per-round aggregate scores, anonymous written feedback, and questions.

## Included scenario topics

Twelve expanded, approximately one-page student cases, each with three optional perspective/evidence cards and private facilitator observation cues: high-performing disruptive employee; supervisor priority conflict; unpopular change; inaccurate reporting; factional team conflict; excluded remote colleague; contested promotion; burnout; disengaged employee; questionable shortcut; broken leadership promise; knowledge bottleneck. Random selection avoids repeats until all scenarios are used. A manual scenario picker is also available.

## Assessment recommendations

- **Peer slider averages are perceptions**, not objective correctness or ethics scores. Different observers can reasonably respond differently.
- Use a separate behavioral competency rubric for summative grading: leadership diagnosis, listening/inquiry, respectful communication, ethical reasoning, inclusivity, accountability, and adaptation.
- Individual reflections and observable contributions remain essential; group averages alone cannot determine an individual's competence.
- Peer written comments are anonymous, so discourage identifying details and moderate before reading any aloud.
- Six teams require additional final-assessment time compared with the four-team / 20-student example.
- Use fictional, non-sensitive scenario details; do not solicit real employee names or private operational information.

## Current boundaries

- Classroom participation uses a per-device random credential, **not verified learner identity**. Clearing browser storage or using additional devices can permit extra anonymous entries. Do not use as a high-stakes exam or claim mathematically verified one-person-one-vote.
- Anonymous ratings can still be influenced by interpersonal dynamics, cohort composition, small samples, and social desirability.
- Student response pages are intentionally publicly accessible from the unguessable invitation link. The facilitator dashboard and its aggregate/comment API are protected by the existing site PIN.
- The facilitator console polls every 3.5 seconds; this is near-live updating, not websocket streaming.
- Default scenarios live in the app code. Scenario editing, moderation queues, detailed histograms, instructor scoring rubrics, and detailed per-participant longitudinal evaluation are planned enhancements.
- Sessions do not auto-expire; close completed sessions explicitly. Reports omit participant IDs. Comments remain in the session database until a future deletion/retention feature is provided.
- Browser and multi-device end-to-end QA is still required before using this for formal summative grading. The database create/join/question/vote/aggregation/export workflow was verified in a rolled-back transaction. Frontend and API files pass syntax checks, and the Vercel preview build status was successful.

## Case design and evidence reveals

- The initial case includes an organizational setting, people involved, tensions, an unclear underlying cause, realistic operational constraints, and a leadership assignment. Cases are deliberately **ambiguous but sufficiently detailed** for defensible analysis.
- Three evidence cards for each case represent employee viewpoints, leadership perspectives, documentation, or operational information. The facilitator releases them in order, and can choose not to release every card. There is no automatic reversal of a team's decisions or fixed correct response.
- Unreleased evidence is stored server-side with each case. The case library lives in a PIN-protected instructor script; the public student API is additionally filtered to show **only the evidence cards released so far**, with no facilitator notes.
- Release a card during the discussion or while voting remains open. It is intentionally disabled after peer results are revealed or when the session is closed, to avoid changing the evidence after final feedback.
- Suggested teaching sequence for a 27-minute team round: 2 min read/orientation, 6 min initial discussion, 2–3 strategically timed evidence reveals, 5 min response, 2 min voting, 5 min interpretation/revision. Adjust based on case complexity and cohort size.
- If teams already started a round before this upgrade, its older brief will remain intact in that session. Start a **new round** to use a newly expanded case. Old sessions without evidence cards continue to work.

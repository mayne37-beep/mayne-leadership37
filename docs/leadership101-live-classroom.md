# Leadership 101 Live Classroom — Mayne Leadership

## Pages
- `/leadership101-live.html`: online Student Studio and authenticated Instructor Command Center.
- The homepage and Classroom page link to the new route.
- Existing standalone Leadership 101 HTML files remain unchanged.

## Deployment
- Static page at repository root is copied to `public/` by `scripts/build-pdf-studio.mjs`.
- Client source `src/leadership101-live.js` is compiled into `public/assets/leadership101-live.js` using pinned dependencies from `package.json`.
- Preview uses Vercel Git integration; merge into main publishes production.

## Backend
Supabase project: the existing MayneLeadership classroom project (`vteamreihsunsllwcphw`).
Instructor authorization: `public.l101_live_instructors`, seeded for the existing account associated with MayneLeadership.
Tables:
- `public.l101_live_instructors` — approved instructor IDs.
- `public.l101_live_scenarios` — the nine original workplace scenarios (instructor-owned JSON payloads).
- `public.l101_live_classes` — class codes and assigned scenarios.
- `public.l101_live_participants` — class joins with unguessable per-participant tokens.
- `public.l101_live_responses` — scripted or typed decisions, reviews, and feedback.
- `public.l101_live_injects` — instructor-released developments.

Student-facing RPCs: `l101_join`, `l101_state`, `l101_submit`, and `l101_reflect`. All use strict scoped lookup. The student-state function explicitly omits confidential character details and stored scoring outcomes. Anonymous browser clients cannot directly select instructor, scenario, class-roster, response, or inject tables. Only enrolled teachers authenticated and explicitly approved by `l101_live_instructors` can access instructor operations using Row Level Security.

## Instructor walkthrough
1. Open `https://mayneleadership.com/leadership101-live.html`.
2. Select Instructor Command Center.
3. Sign in with the approved Supabase instructor account.
4. Create a class, select a scenario, and copy/display the QR link and join code.
5. Learners join from Student Studio with a name and code.
6. Review submitted original responses, pick Positive / Neutral / Negative, leave feedback and save.
7. Release injects as needed, view the roster, export data or print a student report.

## Student walkthrough
1. Follow the link / scan the QR code and provide a name.
2. Review the assigned case and respond to successive leadership situations.
3. Scripted choices receive built-in instructional feedback. Written responses wait for human review.
4. Receive observer feedback, continue, add final reflection, and Print/Save PDF or Export JSON.
5. Use **Leave this device** on shared classroom computers.

## Safety and pilot limitations
- Class codes are convenience join links, not proof of student identity; use private distribution for classroom pilots.
- Student session tokens persist in the local browser; shared-device users must leave their session.
- Instructor logins are server-authorized. Switching tabs is not authorization.
- Near-live updates currently poll every ~4.5 seconds; WebSocket subscriptions are not yet implemented.
- Peer observers and detailed character expression artwork have not yet been migrated into this hosted version. The original standalone Studio retains those.
- Classrooms can be closed for new joins. Students already joined can still submit.
- The existing nine scenarios and their confidential scripts are stored in the instructor-protected database, not published as a static library on the website.
- Supabase schema was installed through authorized SQL changes. Preserve a database backup before significant revisions.

## Verification performed
- Vercel preview builds reached READY.
- The student RPC chain returned correct scenario records, accepted a scripted choice and a typed reply, and displayed instructor ratings and released injects.
- An anonymous role could not directly read instructors or scenarios.
- The authorized instructor identity could see all nine scenarios; an unrelated identity could not.
- Test classroom and participant data were deleted after QA.
- A manual two-browser live classroom interaction test should still be completed before grading real students.

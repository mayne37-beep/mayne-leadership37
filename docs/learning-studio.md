# Mayne Learning Studio — pilot

Open `/lms.html?demo=1` for the fictional preview or `/lms.html` for live accounts. The Learning Library has a Learning Management Studio card. Your existing authorized instructor account is reused. Students sign up with an individual email/password and must be enrolled with the same verified email. The main site PIN is not student identity or LMS authorization.

## Instructor workflow

1. Open the unpublished Critical Thinking pilot, or create a class from the dashboard.
2. Edit Modules and activities. Lecture content accepts text, a reading URL, and a YouTube or video URL. Worksheets use prompts; essays use text entry or upload. Discussions support post-first visibility and required peer replies. Quizzes support choice, true/false, short answer, and written response.
3. Configure passing score, point-based or weighted grading, and publish the course in Settings. Publish individual activities from their editor.
4. Enroll up to 20 active learners in People. Set an external student ID that matches your target database. Share `/lms.html` with students; enrollment does not send an invitation email.
5. Select a gradebook cell to review a submission alongside the rubric. Enter the score and feedback. Keep grades held or select Release grade. Saving immediately updates the gradebook.
6. Review Completion and export CSV or JSON. The instructor can also export the gradebook.

Student view acts on the chosen learner's real records and is explicitly labeled. Use the fictional pilot preview for unrestricted experimentation. Duplicate class copies content only; enrollments and learner work are not copied.

## Completion

Required published lectures must be marked viewed. Required assignments and quizzes must be submitted, graded, and released. Required discussions must include an initial post and the configured number of replies to someone else's posts, plus a released grade. Excused graded activities satisfy their completion requirement and are excluded from score denominators. All published graded activities, including optional ones, affect the final grade. Final grade must meet the configured passing threshold.

Statuses are `not_started`, `in_progress`, `awaiting_grading`, `not_passed`, and `completed`. Only completed learners receive `completed_at`. Changes to requirements, grades, or submissions recompute completion and clear that date when requirements are no longer met. Published courses should be duplicated for new offerings rather than rewriting an already completed class.

Current score considers released graded activities only; final score treats all ungraded published activities as zero. Weighted categories with no applicable activities are excluded and remaining weights are normalized. Instructor gradebook cells can show held scores; completion calculations use released grades.

## Export schema 1.0

CSV is UTF-8 with BOM; fields are quoted, embedded quotes escaped, spreadsheet formulas neutralized. JSON exports raw values. Dates are ISO 8601 UTC. Both active and inactive enrollments are included with explicit enrollment status. Completion exports omit submission text and discussion content.

| Field | Meaning |
| --- | --- |
| schema_version | Export schema version |
| student_id | Account UUID when linked; enrollment UUID until first student sign-in |
| external_student_id | Instructor-supplied ID for joining to the destination database; recommended import key |
| student_name, email | Learner identity |
| course_id, course_code, course_title | Course/template identity |
| class_id, class_name | Unique offering identity |
| enrollment_status | active or inactive |
| completion_status | One of the five states above |
| required_items, completed_items, completion_percent | Requirement progress |
| current_score_percent, final_score_percent | Released-score calculations |
| passing_score_percent | Class passing threshold |
| enrolled_at, completed_at, updated_at, exported_at | UTC timestamps |

Import using `class_id + external_student_id` to upsert offering records in your destination database. The integration is currently downloadable exports; it does not push into an unspecified external database.

## Canvas research used

Primary sources (Instructure instructor documentation):
- https://community.instructure.com/en/kb/articles/662761-what-are-modules
- https://community.instructure.com/en/kb/articles/660897-how-do-i-add-requirements-to-a-module
- https://community.instructure.com/en/kb/articles/660912-how-do-i-use-modules-to-view-the-progress-of-students-in-a-course
- https://community.instructure.com/en/kb/articles/664280
- https://community.instructure.com/en/kb/articles/664303-how-do-i-grade-a-graded-discussion-in-speedgrader-with-performance-and-usability-upgrades
- https://community.instructure.com/en/kb/articles/660866-how-do-i-export-grades-in-the-gradebook

The pilot implements the requested central classroom workflows with original Mayne branding. It does not claim full Canvas feature parity, Canvas course-package import, QTI/SCORM import, document annotation, proctoring, SIS synchronization, or institution-wide administration.

## Validation and operation

`npm run build` produces the existing site and LMS browser bundle. `npm run test:lms` runs grade/export rules and a DOM interaction journey (not a visual browser test). `node tests/lms/sql-fixture.mjs` prepares transaction-only database acceptance SQL at `/tmp/lms-integration.sql`. `tests/lms/api-live.mjs` accepts temporary QA credentials on stdin and exercises real Auth → API handler → database → completion exports. It must be run only with disposable QA accounts; never use real students.

The Vercel function validates each bearer token with Supabase Auth, checks the existing instructor registry, and calls a narrow private database gateway with a server-only LMS_GATEWAY_KEY. Private schema tables have RLS enabled and no direct API grants. Quizzes hide keys and score on the server; timers use database deadlines. Uploaded submissions are private and limited to 2 MB; the pilot stores files in the private database, suitable for small classes. No plaintext passwords or gateway secrets are stored in source.

Quiz answers save every 15 seconds and on Save answers. A server-expired quiz submits its last saved answers when the student returns or submits. Essay/worksheet drafts save when Save draft is selected. The most recent submitted quiz attempt counts. Written responses require manual grading. Sequential modules enforce view/submit requirements within a module.

Production student registration depends on the existing Supabase email confirmation and reset redirect configuration. Confirm these flows and email delivery capacity before enrolling a full real cohort. No unrelated Auth configuration was changed.

Validation performed during implementation: rule tests, DOM-level instructor/student journey, live transactional database tests, and real Supabase account/API integration. The managed environment did not provide the required browser-control capability, so a visual browser QA pass was not performed.

# College Critical Thinking

CT-201 is installed as an unpublished eight-week offering in Learning Studio. Course content, official quiz keys, and private grading guidance live in the protected LMS database. They are not included in the static website bundle.

- Offering: College Critical Thinking · Eight-Week Course
- Class ID: `28ebc897-4290-4305-a611-8ac73f9d33d2`
- Stable course template ID: `04ec7128-b8a5-422b-a35c-00db9c3a3a05`
- 8 modules, 8 full lectures, 8 discussions, 8 assessments, 8 quizzes, 80 questions
- 32 required activities, 1,000 possible points, 70% completion threshold
- Instructor review remains necessary before publishing, including cohort dates, timezone, contact details, and institutional policies.

| Week | Focus | Assessment |
| --- | --- | --- |
| 1 | Claims, bias, and intellectual habits | Reasoning journal and baseline audit |
| 2 | Argument structure, language, assumptions | Argument reconstruction and capstone question |
| 3 | Deduction, conditionals, tables, class relations | Logic laboratory |
| 4 | Induction, sampling, causation, probability | Study appraisal and probability worksheet |
| 5 | Fallacies, rhetoric, fair criticism | Fallacy analysis and argument repair |
| 6 | Sources, data, digital and AI claims | Source dossier, data check, simulated-output audit |
| 7 | Ethical comparison and uncertainty | Ethical comparison and capstone plan |
| 8 | Integrated argument, objection, revision | Researched capstone and reasoning reflection |

Weeks 1–7 assessments carry 60 points each; the capstone carries 180. Discussions carry 20 points each and require an initial post plus two substantive replies. Quizzes carry 30 points each, use ten original four-option questions, allow two 30-minute attempts, and count the last submitted attempt. Point-based grading yields assessments 60%, discussions 16%, and quizzes 24%.

Lectures contain approximately 970–1,060 words of original instruction each, assigned-reading links, four practice checks with explanatory reveals, and a completion action. Assessments include task steps, word ranges, rubrics, and private instructor notes. The capstone is scaffolded from Week 2 through Weeks 6–8. A student syllabus is available in course navigation; the private teaching guide is editable in Settings.

The syllabus gives relative weekly deadlines. Calendar cutoffs are unset until the instructor sets the cohort schedule. Completion exports use the existing CSV/JSON workflow, with external student IDs for matching the receiving database.

## Curriculum sources

Topic coverage was informed by the following published curricula, reviewed on 13 October 2026. Lectures, fictional scenarios, assessments, and quiz questions were written originally; this course does not represent a source institution's endorsement or credit equivalency.

- [Youngstown State University PHIL 1565, Fall 2026](https://www.catalog.ysu.edu/syllabi/2026-fall/phil-1565-03-41241/index.html)
- [Butte College PHIL 6, 2026–2027 course outline](https://www.butte.edu/student-resources/academic-resources/curriculum-tools/course-outlines/2026-2027/html/PHIL-6-course-outline.html)
- [Southern Utah University COMM 1270 online, Spring 2026](https://my.suu.edu/syllabus/202610/COMM-1270-30I/)

Publisher-hosted readings link to OpenStax's *Introduction to Philosophy* and *Introductory Statistics 2e* and the Civic Online Reasoning resource site. The course does not redistribute textbook content or require a paid AI account.

## Verification

`npm run test:lms` covers author validation, grading, completion exports, discussion participation, announcements, syllabus display, and instructor guidance privacy in the demo flows. `tests/lms/sql-fixture.mjs` generates rollback-only database integration checks, including student and preview privacy. `scripts/check-college-course.mjs <private-course-snapshot.json>` verifies the course allocation, renders all eight lectures through the shared player, checks completion actions, and exercises the 32-item gradebook and export model. No official quiz keys are tracked in this document or the static bundle.

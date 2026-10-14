# Escape Room Studio

Instructor workspace: `/escape-room-studio.html`, linked from Classroom Tools. It uses the existing website PIN and authoring gateway. Learner entry: `/escape-room-play.html?room=<published-token>`; published play links work without the site PIN.

## Workflow

1. Open a website room or create a new blank/example room.
2. Edit scene backgrounds, clickable clues, images, collectible items, answer locks, drop targets, doorways, and finish puzzles. Move and resize objects directly on the scene.
3. For 360-degree scenes, upload a full equirectangular panorama, normally a 2:1 JPG/PNG. Drag empty space to look around, place anchored clues, and save the starting view.
4. Configure accepted items, placement/consumption behavior, prerequisites, hidden-object reveals, scene transitions, progressive hints, and learning/debrief text.
5. Play the entire room. The sample Evidence Protocol mission uses a code, key-to-door puzzle, lid-to-container puzzle, and final evidence decision.
6. Publish and copy the learner link. Later edits remain a draft until another publication.
7. Use Export → Saved session reports to review completion, attempts, hints, times, and notes; export completion statuses as CSV. Reports reflect client-reported learning activity.

## Saving and media

Website drafts are stored in the existing Supabase project in private `ml_escape` tables. A device draft remains available when saving fails. Optimistic version checks reject overwrites from stale devices. Export a project before reloading a conflicting draft.

Uploaded images are deduplicated by SHA-256 and transferred in 512 KiB parts. Large images are compressed when necessary. Draft JSON stores asset references, avoiding function request/response size limits. Published links can read only assets referenced by their published snapshot; completed assets cannot be overwritten.

Editable JSON backups and standalone learner HTML embed images for portability. Standalone files run independent sessions without a server. Published website players save their own sessions and completion reports. There is no live multiplayer synchronization in this release.

## Access model

- The authoring page uses the existing PIN middleware.
- The API verifies the signed site cookie for authoring, publishing, uploads, and reports, plus the request origin for POSTs.
- Learners receive a random published-room token and a separate session proof. They cannot use either to authorize editor operations or access another room's assets/session.
- The database wrapper is SECURITY INVOKER. Its narrow private gateway verifies the existing server-only key and accepts only server-gateway sessions. The key is never sent to browsers.
- All new tables have RLS enabled and direct browser roles have no grants. Supabase's informational [RLS-enabled/no-policy notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) is expected for these private, default-deny tables.

## Verification

`npm run test:escape` covers the sample puzzle sequence, prerequisites, incorrect items/answers, reusable items, projection math, API access/origin checks, unfinished draft saving, publication checks, website save/reopen, image uploads and backups, standalone export, independent learner gameplay, and completion reporting.

`tests/escape/sql-check.sql` exercises the real database gateway inside a rolled-back transaction, including stale-save rejection, upload completion, published snapshot retrieval, asset scoping, session-proof enforcement, reports, and unpublishing. No fixture credentials or test records remain.

The full existing site build passed. Live browser visual/GPU verification remains unavailable; in particular, 360-degree rendering needs a live-device check. Private authoring was verified through API/DOM tests and its live access gate; a real instructor PIN session was not used during automated checks.

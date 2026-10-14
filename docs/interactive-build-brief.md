# Interactive Course Studio

Web authoring foundation for Mayne Leadership. The complete product specification is maintained separately as a user-facing deliverable; the full supplied feature inventory is tracked in interactive-feature-catalog.json.

## Foundation release

- A dedicated protected authoring page: /interactive-course-studio.html.
- Scene/slide outline with slide creation, duplication, reordering, and starting-slide selection.
- Direct text editing; draggable/resizable text, shapes, buttons, and uploaded images; numeric geometry; stacking; position locks.
- Editable states, modal feedback layers, ordered triggers, one variable condition per trigger, and typed persistent project variables.
- Object start/duration, slide timing preview, timed triggers, and reset/resume revisit behavior.
- A shared engine for course preview and self-contained HTML export, including a live variable/trigger debugger in author preview.
- Website project saves, optimistic version checking, 20 previous source revisions, device recovery draft, and JSON source import/export.
- A fully editable original leadership decision example.

The complete Storyline inventory remains the end-state scope. Advanced typography, masters, animation paths, rich media editing, drag-and-drop assessments, question banks, all LMS packages, review/localization/AI services, offline editor installation, and the Windows software-simulation recorder are later releases. This release exports HTML; it does not claim SCORM or Learning Studio gradebook integration.

## Integration

The existing build copies root HTML pages and the assets directory. No change to that build is needed. A new Classroom Tools card launches the page. Existing PIN middleware protects the editor and API. Student entry routes remain governed by their existing rules.

The new API reuses the existing authoring PIN-verification helper and server-only LESSON_STUDIO_GATEWAY_KEY. Source records live in the dedicated private ml_interactive schema in the current storage project. The gateway checks the existing key registry; editable projects are never exposed through a learner endpoint. All PIN-authorized instructors share this first-release project library. Per-author permissions require a later identity migration, rather than interpreting the shared PIN as individual identity.

## Modules

| File | Responsibility |
| --- | --- |
| assets/interactive-model.js | Source schema, structural validation, safe images, duplication, original example |
| assets/interactive-engine.js | Ordered events, conditions, variables, states, layers, timeline, navigation, bookmarks |
| assets/interactive-player.js | Accessible DOM rendering and learner controls |
| assets/interactive-export.js | Independent HTML generation and instructor-note removal |
| assets/interactive-author.js | Editor, project operations, recovery, website synchronization |
| api/interactive-studio.js | Site authorization, origin checks, validation, database gateway |
| supabase/interactive-studio.sql | Dedicated source and revision storage |

Source schema: format mayne-interactive-course, schemaVersion 1. Stable UUIDs identify every entity. Upgrades must use explicit migrations and preserve older source backups.

## Storage activation status

The source-storage SQL passed a rollback-only integration test. Permanent installation was blocked by an invalid/expired connector request-state error. Until the SQL is applied, the API reports that website storage is awaiting activation; editing, device recovery, source downloads, and HTML export remain usable. Do not report cross-device saves or version history as live until the database installation and a signed-in save/reload pass.

## Current operating limits

- 3 MB source request limit; individual uploaded images up to 1.5 MB.
- Up to 50 scenes, 200 slides, 30 layers per slide, 150 objects per layer, 300 triggers per slide, and 100 variables.
- PNG/JPEG/WebP/GIF uploads and HTTPS image addresses. Uploaded images are included in HTML output; remotely addressed images retain that dependency.
- The editor currently provides a single recovery draft for the active project on the device, plus independently downloadable source files.
- Browser-installed offline authoring and native Windows capture are planned; they are not supplied by the device recovery draft.
- Structural checks do not establish accessibility conformance or full LMS interoperability.

## Verification

Run npm run test:interactive. Tests cover source integrity, ordered conditional navigation, typed values, timed-trigger replay protection, bookmark/revisit behavior, duplication remapping, loop protection, output escaping, instructor-note exclusion, API authorization boundaries, and a simulated DOM edit/resize/move/undo/export flow.

Real browser layout, pointer fidelity, screen-reader operation, and live signed-in HTTP saving need end-to-end browser verification on the deployed site. A successful DOM test does not replace those checks.

# Systems Mapping Studio

Entry: https://www.mayneleadership.com/systems-mapping-studio.html

The Thinking Tools card opens a blank, editable workspace. Website projects are shared among instructors with the existing site PIN. No new identity system is introduced. Student invitation links open `systems-mapping-join.html` without the instructor PIN.

## Building a map

- Click or drag one of 11 element types: variable, stock, flow/rate, stakeholder, resource, event, decision, outcome, leverage point, assumption, or observation/note.
- Click element text and type directly. Drag the header to move it. Select it and drag the gold corner to resize. Shift-click for multiple selection or Shift-drag a canvas region. Boundaries can hold a named subsystem; assign elements in Inspect to move them with that boundary.
- Drag a gold connection dot onto an effect, or choose Connect and click a cause followed by its effect. Select an arrow to change its direction, polarity, curve, qualitative strength, confidence, evidence, or delay. Causal, stock/flow, and information links are distinct.
- Pan with right-drag, Space-drag, or Pan. Zoom with the wheel and toolbar. Fit and the minimap navigate larger maps. Grid snapping is optional. Presentation hides editing panels.
- Ctrl/Cmd+S saves, Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z redoes, Ctrl/Cmd+D duplicates. Delete removes selected items and connected arrows. Arrow keys nudge elements. Undo is disabled in live sessions to avoid replaying another participant's work.

The Guided workflow covers framing, elements, relationships, feedback, delays, leverage, review, and reflection/export. Freeform permits any order. The Help button includes an in-app guide.

## Analysis and tools

The engine enumerates elementary directed causal cycles once per rotation, preserving distinct opposite-direction cycles and self-loops. Even negative-link parity produces a reinforcing classification; odd parity produces balancing. An unknown sign makes a cycle uncertain. Delays do not alter sign parity. Information links, stock/flow links, notes, and assumptions do not enter causal-cycle analysis.

Loop search stops at 200 cycles, 60,000 traversal steps, or 30 variables per cycle. The UI and reports disclose incomplete search results. Supported source limits are 250 elements, 600 relationships, 40 boundaries, and 1.5 MB. A map may contain more cycles than the displayed search finds.

Loop cards highlight the relevant variables and arrows. Review prompts identify isolated elements, missing issue/evidence/delay descriptions, and uncertain polarity. Connectivity rankings are discussion prompts, not a calculated measure of intervention effectiveness. Three-link consequence tracing propagates known/unknown signs along simple paths and shows delays; it does not calculate a net effect across conflicting paths.

Tools include iceberg exploration, a behavior-over-time chart from entered values, potential leverage markers, recommendations, an action plan, and reflection. Nine editable templates cover engagement/performance, burnout, limits to growth, fixes that fail, shifting the burden, escalation, tragedy of the commons, stock/flow, and iceberg exploration. Templates are teaching hypotheses, not empirical models.

The stock/flow illustration uses explicit constant rates and Euler steps (20 steps, delta-t=1). Stock -> Flow subtracts from a stock, and Flow -> Stock adds to it. Units need to be consistent; negative stocks are permitted and require review. Causal arrows do not drive the illustration. Equation-driven system dynamics, calibration, optimization, and causal effect estimation are outside this implementation.

## Saving and exports

Save creates a website project and enables debounced website autosave. Device recovery copies are also kept. My Maps combines website and device versions, supports search across names/folders/tags, duplication, website archiving, and device-copy removal. Projects start blank; older drafts open through My Maps. A full device store blocks switching away from unsaved work.

Website saves compare revision numbers. A conflict halts automatic saving and retains the device draft. Reload website version preserves that conflict draft as a separate local project before opening the current website source. The latest 20 prior website revisions can be restored as editable drafts. This is revision-based collaboration, not automatic concurrent text merging.

Exports:

| Format | Content |
| --- | --- |
| Project JSON | Complete editable source; imported as a new project identity |
| SVG | Entire map as a scalable vector image |
| PNG | Browser-rendered map image; longest side capped at 6000 pixels |
| PDF | Vector map page and multipage text report with loops, evidence, review, worksheets, actions, reflection |
| HTML report | Self-contained map and report, also printable from the browser |
| CSV | Elements and relationships; spreadsheet formula-leading strings escaped |
| Collaboration Canvas JSON | Layout, boundaries, text, and connectors; systems-specific metadata omitted |
| Participation CSV | Self-reported participant/team names, successful save counts, reflections, last seen |

PDF uses built-in standard fonts and substitutes unsupported non-Latin characters. SVG, HTML, and JSON preserve Unicode. Long labels can be clipped in visual map exports; the complete labels remain in the reports and source. Collaboration Canvas has smaller coordinates, size limits, and its own color palette, so transferred items can be clamped or recolored. Its drawing/image objects are not converted into system variables.

## Classroom use

Save a map, then start Classroom. Copy the student link or show its QR code. Choose collaborative editing or view-only, lock/unlock editing, set a 1–180 minute shared timer, collect reflections, and download participation CSV. End session revokes its link. One active classroom session is supported per map; use duplicated projects for separate team maps. Each link expires after 24 hours and allows up to 60 participant identities. Tab-session storage resumes a participant after reload.

Student links grant access to the shared map to anyone holding the link; share them with the intended class. Participants receive a separate proof for saving/reflection. Roster/proof hashes and the server gateway key are never returned in student map reads. Names are self-reported; successful saves are not an LMS completion or identity-verification record.

Synchronization polls every 3.5 seconds. Conflicting whole-map edits require reviewing/exporting the device draft and reloading the latest source. No CRDT text merging, live cursor display, video, automatic grading, or LMS roster synchronization is included. Large-class load and cross-device touch behavior need a classroom pilot.

## Infrastructure and verification

Uses repository `mayne37-beep/mayne-leadership37`, existing Vercel project `mayne-leadership37`, and classroom Supabase project `vteamreihsunsllwcphw`. The existing server-only `LESSON_STUDIO_GATEWAY_KEY` and signed PIN cookie are reused. No service-role key is exposed. `api/systems-studio.js` validates payloads, origins, instructor access, student tokens, and participant proof; the database checks authority and version again. An additive security-invoker wrapper converts serialization conflicts into explicit results before PostgREST can retry them; the API returns HTTP 409 promptly.

Migration `supabase/migrations/20261015023719_systems_mapping_conflicts.sql` adds the conflict wrapper. Migration `supabase/migrations/20261015022021_systems_mapping_studio.sql` creates isolated `ml_systems` tables and a private fixed-search-path gateway with a public security-invoker wrapper. Every new table has RLS enabled and direct `anon`/`authenticated` table privileges revoked. The [RLS-enabled/no-policy informational notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) is expected for these default-deny private tables. No existing database tables, functions, credentials, or authentication rules were changed.

The studio adopts direct-text, header-drag, resize, right-drag pan, and selection patterns from Collaboration Canvas. It adds a compatible JSON transfer in both directions. Collaboration Canvas source, CSS, and existing entry routes remain unchanged; its interactive regression test passed.

Run `npm run test:systems` for graph, API, middleware, export, authoring DOM, and participant DOM tests. `tests/systems/sql-check.sql` is a rollback-only database integration test using an ephemeral test gateway credential. Tests cover source save/reopen, stale-save conflicts, token/proof rejection, student save, locking, timer, reflection, roster, revisions, revoke, and archive. Production verification also checks the Vercel API against the existing server gateway and deployed student modules. QA fixture maps are archived and their classroom links revoked afterward.

Verified before deployment: model/API tests; actual authoring DOM text/move/resize/connection/undo/redo events; live loop updates; save/reopen; offline device recovery; conflict backups; worksheet editing; JSON/SVG/CSV/HTML downloads; native PDF parsing, text extraction, and rendered map inspection; participant join/edit/save/lock/view/reflection; live database integration; full production build. Regression suites passed for Collaboration Canvas, Escape Room Studio, Interactive Course Studio, Learning Studio, and Leadership Challenge Studio.

Browser-control support was unavailable in this environment. DOM tests do not establish browser layout quality, pointer hit-testing, browser PNG rasterization, mobile/touch behavior, clipboard permissions, or multi-device concurrency under classroom load. Those remain pilot checks. The full prior blueprint was not retrievable: prior-chat retrieval returned its opening and feature summary. This implementation covers those recovered requirements and the explicit implementation request; exact coverage of unavailable blueprint sections remains unverified.

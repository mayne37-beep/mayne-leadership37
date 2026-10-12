# Collaboration Canvas Studio — 2026-10-12 functional expansion

Website: https://mayneleadership.com/collaboration-canvas.html
Student join: an invitation link copied from an instructor's live board.

## Implemented

- Direct editing of sticky notes, text boxes, shapes, and frame headings.
- Eight-point resizing, drag handles, object colors, rotation, right-drag pan, zoom, and grid movement.
- Select multiple objects via Shift-click / Shift-drag, group and ungroup, move together, align, distribute, rotate, copy and paste, bulk delete, lock individual objects.
- Native drawing, highlighter, straight-line pen, freehand stroke eraser, and local laser pointer.
- My Boards library for locally saved board snapshots and recovery by JSON import/export.
- Six-stage facilitation journey; original templates plus extended leadership analytical templates.
- Working weighted three-option decision matrix, ranking, CSV export, publish results to the canvas, color clustering.
- Presentation navigation across frames; instructor view-focus, fullscreen.
- Facilitation report in Markdown, voting and action CSV, printable summary/PDF via browser Print, canvas PNG, editable JSON.
- Instructor command center: board lock enforced by the server, open/close voting, voting caps per browser identity, reset vote round, follow instructor view, and configurable facilitator timer.
- Live sessions with student invitation links and browser-generated QR codes (QR code library vendored locally under MIT).
- Presence heartbeat and instructor roster/attendance CSV with voluntarily supplied participant display names.
- Private brainstorming inbox: submissions hidden from student API, instructor-only list/reveal/clear.
- Separate breakout rooms, team join links, instructor switching, and manual merge back into main canvas.
- Room data stored in Supabase with unguessable owner and guest capabilities and RPC validation.
- The standard site PIN remains required for the instructor page, while student join pages work without it.

## Important current limits

- The My Boards list is stored **on this browser/device**, not in a cross-device authenticated cloud account. Back up important boards with JSON export.
- Live updates currently synchronize by periodic polling. Two people editing the **same object** simultaneously can overwrite each other's edits. Different objects synchronize more safely. Do not describe this as conflict-free multiplayer or true websocket presence.
- Voting is enforced against a random browser identity, not a verified student account; someone using a different browser can receive another vote allocation.
- Names are participant-entered rather than validated against organization accounts.
- Owner and guest access are capability links; anyone who has a valid link can use that role. Careful sharing and account-bound authentication are future security work.
- Board creation is publicly callable at the Supabase RPC level and needs production anti-abuse controls and rate limiting for a large public audience.
- Breakout rooms require the facilitator to distribute links and manually merge; there is no automatic participant assignment or continuous merge.
- The advanced thinking templates are editable whiteboard layouts, except the weighted decision matrix which includes live scoring. Other analytical tools still need purpose-built computations.
- PDF output is provided via the printable **report**; high-fidelity whiteboard-as-PDF and placing PDF pages directly onto the board are not yet implemented.
- Image support uses compressed embedded images and size caps; there is no multimedia/embedded video pipeline yet.
- No authenticated account-level organization workspace, role-based audit trail, object comment threads, or robust version-history/recovery system yet.
- Automated tests check JavaScript syntax, page wiring, selected geometry, and database authorization. A real browser, mobile, and multi-device classroom test pass is still required.

## Test instructions

From the repo root:
    node tests/collaboration-canvas-smoke.cjs

Classroom QA:
1. On the instructor page, add a note. Type directly, resize using each corner, pan with right drag, and use the eraser.
2. Select two objects with Shift-click, group them, move them together, and undo locally.
3. Run the weighted decision matrix and insert the results.
4. Create a live room, scan the QR invitation using a separate device.
5. Lock editing. Confirm student typing/movement are refused while an open vote still works.
6. Run private brainstorming: students submit, instructor sees private inbox, instructor reveals notes.
7. Create team rooms, distribute team links, edit in a separate device, return to main room, and merge.
8. Verify print/save-to-PDF report, PNG, CSV, JSON backup and restore.
9. Verify a second device does not accidentally receive an instructor capability link.

This file documents current capabilities and test obligations, not a guarantee of zero defects.

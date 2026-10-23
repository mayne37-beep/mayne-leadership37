# Leadership 101 — Instructor Notification Center

The Instructor Command Center at `https://mayneleadership.com/leadership101-live.html` shows a persistent bell with the number of items requiring review (plus unread completion updates).

## Notifications across all classrooms
All notifications belong to an authorized instructor, independently of the selected classroom. They are generated from actual database events and remain in the instructor's notification feed until read or resolved:
- **Written response needs review:** When a student submits original wording, an alert shows the full response. Rate it Positive, Neutral, or Negative and optionally comment **right inside the inbox**. Saving the rating resolves the alert and allows the learner to continue.
- **Student needs help:** Students can use Request Instructor Assistance and add an optional note. The instructor can inspect the request and mark it handled.
- **All decisions evaluated:** A completion update is created when every observation in a student's assigned scenario has been evaluated (this is not a guarantee their final personal reflection is submitted).

Both **Supabase Postgres Changes** and periodic data refresh (roughly 4.5 seconds) keep the bell synchronized. The periodic refresh works when Realtime transport is temporarily unavailable. The Instructor Center must remain open in a browser tab to receive pop-up and desktop alerts; this is **not** a system-level push service that runs after the tab is closed.

## Controls
1. Open Instructor Command Center, sign in with your approved instructor account.
2. Click the **bell** to open the unified notifications panel.
3. Use **Needs attention**, **All activity**, or **Completed / resolved**.
4. Choose Positive / Neutral / Negative and click **Save evaluation**, or mark a help request as handled.
5. Turn optional **Sound** on/off; it defaults to off.
6. Enable optional **Desktop alerts** after the browser asks for permission (may not be supported on all devices).

Notification data is scoped by Row Level Security and only the assigned instructor can query or acknowledge it. The browser receives no service-role credentials; student help is submitted through a token-scoped RPC.

## Database
- `public.l101_live_notifications` with RLS for instructor-owned SELECT and updates restricted to `read_at`/`resolved_at`.
- Response trigger `public.l101_notify_response` emits/deduplicates pending review and scenario completion events.
- Student RPC `public.l101_request_help(token, message)` validates a joined participant, rate-limits requests to once per minute, and limits note length.
- `public.l101_live_notifications` is added to `supabase_realtime` Postgres Changes publication.

## Verified
- A written response creates one pending review notification.
- Grading resolves the pending notification.
- A student help request creates a separate actionable alert.
- Final graded observation creates a completion update.
- An unrelated authenticated identity cannot read the instructor feed.
- Anonymous guests cannot select the notification table.
- Vercel preview builds are READY.

## Recommended classroom smoke test
Open Instructor Center in one browser and two student joining links in separate devices. Create two classes with different scenarios; submit written answers from both and confirm both alerts arrive in the same inbox, then grade without changing class. Check student updates. Toggle sound and desktop permission only if desired. Test student help and completion. Verify 4.5-second polling fallback when the Realtime connection is interrupted. No data from QA scenarios is left in the live class tables.

# Leadership 101 Live — Two-way Messages and Contextual Feedback

## Student experience
The Student Studio now includes **Instructor Messages** in the scenario sidebar and a **Message Instructor** shortcut beside the student report button.
- A student types an actual question or follow-up (1–1,500 characters).
- The question is saved to a private conversation thread, tagged with the student's current observation number (when in a scenario).
- The instructor's response appears in that same conversation within a few seconds; when a new response arrives the student sees a small in-app notice.
- Conversation history persists when students resume their saved browser session. The instructor can view it from the notification center even after marking previous requests handled.
- To discourage flooding, a student can send up to two messages per rolling 10 seconds.
- No other student can query the thread by name or classroom code; the participant uses an unguessable session token through restricted RPC functions.

## Instructor experience
Open the bell in the Instructor Command Center:
- **Needs attention** gathers ungraded original answers plus open student questions from all classrooms.
- **Student messages** shows student conversation threads, including previously resolved messages.
- The question alert displays the entire conversation, current observation when available, a reply box, and a Send Reply button. The student receives the reply in the online Studio, not by email.
- Sending a reply resolves that student's outstanding help alerts but leaves the full thread visible for follow-ups.
- Responses requiring Positive / Neutral / Negative evaluation now show the exact **scenario**, **observation number/title**, **team member**, **observed behavior**, **background**, **decision prompt**, plus collapsible instructor reference material and the student's original response.
- The regular instructor review queue also shows the full situation and question.
- Repeated outstanding questions from one learner are summarized as one priority conversation so instructors running multiple scenarios don't get duplicate thread entries.

## Backend and permissions
Database: Mayne Leadership classroom Supabase project (`vteamreihsunsllwcphw`).

New table: `public.l101_live_messages` with `class_id`, `participant_id`, `sender_kind`, `sender_user_id`, `observation_index`, `content`, and `created_at`. RLS denies anonymous direct reads and allows signed-in instructors to select and insert replies only for their own classes. Student message reads/writes use the existing high-entropy participant token scoped through these SECURITY DEFINER functions:
- `public.l101_student_messages(p_token uuid)`: scoped history, with no data from another student's session.
- `public.l101_send_message(p_token uuid,p_message text,p_index integer)`: validates the token, classroom membership, current observation, message length and sending rate.
- `public.l101_request_help(p_token uuid,p_message text)`: backwards-compatible alias to send a persisted message.

A database trigger `public.l101_notify_message` creates an actionable notification on student messages and resolves outstanding help requests on an instructor reply. The existing `public.l101_live_notifications` bell receives and displays these alerts across the instructor's entire classroom roster.

The frontend retrieves updated messages during its normal polling cycle (about 4.5 seconds). The instructor notifications also use the existing realtime subscription. The browser tab must remain open; messages are persisted server-side when it closes, then appear when re-opened.

## Verification / limitations
- Valid student sent a message tagged to Observation 2; the authorized instructor replied; the student read both persisted messages.
- Instructors can mark a student help request handled independently of the thread; subsequent messages reopen the priority notification workflow.
- Verified anonymous direct table access denied and unrelated signed-in user receives zero rows.
- The role-play's original nine scenarios, scripted choices, grading and PDF/JSON reports remain unchanged.
- A manual two-device browser test is still recommended before graded training.

# Mayne Leadership backend consolidation

Status: prepared for cutover; account transfer is blocked pending explicit owner authorization. Do not merge the website switch or retire the source yet.

## Scope

Move the authentication, 360-assessment and SMART-goal services from `oxgbhrhpgvtolbasxzjj` (the original 360/Auth project) into `vteamreihsunsllwcphw` (Classroom Calendar). Keep the existing classroom tools and their private schemas in place. After verification and cutover, retire the old backend and use the free slot for a clean, independent CREASY backend.

The source contains five email/password accounts, four administrator memberships, one assessment, six invitations, two responses, no saved SMART-goal rows, and one public media object. Accounts include existing restrictions; those restrictions must be preserved. Password hashes and identities are in a private backup, never in this repository.

## Work completed on 2026-10-19

- Private backup saved with source schema/policies, application records, Auth users/identities, deployed function versions and original media. Runtime Auth/SMTP/provider settings and sessions are outside this backup's scope. The source remains intact.
- Destination schema prepared: five RLS tables, the existing API signatures, a security-invoker progress view, protected private function implementations, least-privilege client grants and media policies. Destination's profile trigger assigns only the ordinary user role and profile SELECT is owner-scoped.
- Four existing Edge Functions copied to the destination. Active assessment functions pin their server SDK to 2.118.0. The already-retired QA endpoint remains retired.
- The public image was copied without changing bytes: 3,157,102 bytes, SHA-256 `f9c30eeae6bdbe24bd16ba6c1d6054cb3f375fdefee9fea7e3cc406ea3ac037b`. An independent download from the destination matched the backup. The temporary transfer operation was retired after copying.
- Public Auth provider settings match between projects: email enabled, confirmation enabled, anonymous and external OAuth providers disabled. URL allowlists, SMTP and recovery navigation still need explicit verification.
- Four static pages and the Challenge/Learning Studio Auth constants are prepared to use the destination URL and publishable key. The live website still uses the original source.

The destination has zero imported accounts and zero imported assessments/responses. Automatic approval review rejected transferring the five account records because the owner had not explicitly authorized sending sensitive credentials, including password hashes, to the named destination. Do not retry this transfer through another route without that authorization.

## Verification

Seven PostgreSQL migration checks pass: RLS/grants, anonymous/non-admin denial, administrator/progress-view behavior, service-only single-use invitation redemption, owner-scoped SMART goals, media-folder permissions and overwrite prevention. The full website build, seven Challenge model checks, ten Learning Studio model/import/player checks, the classroom DOM flow, PDF Studio checks and Word conversion checks passed. These are local/source checks; real account and production/browser cutover checks remain pending.

The destination advisor baseline already contained legacy public-definer warnings, private/default-deny tables and unrelated index/policy notices. The consolidation uses private definer implementations and public invoker wrappers. Its follow-up migration removes duplicate indexes and evaluates caller identity once per policy statement. No unrelated existing application policy is changed.

Advisor guidance: [default-deny RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [public definer routines](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [signed-in definer routines](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [policy evaluation](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan), [duplicate indexes](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index).

## Cutover gate

1. Obtain explicit authorization to move all five account records, including email addresses and password hashes, from the named source into Classroom Calendar. Use the supported Auth import API, preserve user UUIDs/password hashes, and preserve current bans/restrictions. Recheck the source snapshot for intervening changes first. Do not email people or reset passwords as a workaround.
2. Import application rows in dependency order, preserving IDs, administrator memberships, hashed invitation tokens, deadlines, redemption flags, responses and timestamps. Check typed row equality, counts and relationships; compare account hashes without printing them. Never commit live records or credentials.
3. Verify normal sign-in, denied users, profile privacy, instructor authorization, account recovery URL allowlists and email configuration. Use synthetic test accounts and records; test invitation creation/validation/submission/replay rejection and report access. Remove only the synthetic records.
4. One saved Challenge game currently references the old public media URL. Back up that row and replace only the copied object's exact URL after confirming version/content have not changed. Preserve all other game fields, historical scoring and content. Recheck for newly uploaded source media before retirement.
5. Refresh this branch against main, resolve any intervening changes, build/test and publish the website switch. Verify public response pages, instructor sign-in, reports, SMART-goal privacy, Challenge uploads and Learning Studio against the destination. Users sign in again because project sessions/signing keys are separate; existing passwords should remain valid.
6. Confirm no traffic or content still depends on the old backend. Keep the original available for rollback until the cutover passes. Then pause it to free a slot and provision a fresh CREASY project; do not mix CREASY accounts or records into the Mayne Leadership backend.

## Recovery

Before cutover, the source remains authoritative. Reverting the prepared URL/key changes restores the old connections. Do not delete either backend or remove source data while verification is incomplete. The private backup is a recovery artifact, not an application asset or public export.

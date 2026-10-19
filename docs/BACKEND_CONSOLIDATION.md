# Mayne Leadership backend consolidation

Status: accounts, assessment records and media transferred and verified. Website cutover is blocked by destination Auth recovery URL configuration. Keep this change in draft and the original backend active until the remaining gates pass.

## Scope

Move the authentication, 360-assessment and SMART-goal services from `oxgbhrhpgvtolbasxzjj` (the original 360/Auth project) into `vteamreihsunsllwcphw` (Classroom Calendar). Keep the existing classroom tools and their private schemas in place. After verification and cutover, retire the old backend and use the free slot for a clean, independent CREASY backend.

The source contains five email/password accounts, four administrator memberships, one assessment, six invitations, two responses, no saved SMART-goal rows, and one public media object. Accounts include existing restrictions; those restrictions must be preserved. Password hashes and identities are in a private backup, never in this repository.

## Work completed on 2026-10-19

- Private backup saved with source schema/policies, application records, Auth users/identities, deployed function versions and original media. Runtime Auth/SMTP/provider settings and sessions are outside this backup's scope. The source remains intact.
- Destination schema prepared: five RLS tables, the existing API signatures, a security-invoker progress view, protected private function implementations, least-privilege client grants and media policies. Destination's profile trigger assigns only the ordinary user role and profile SELECT is owner-scoped.
- Four existing Edge Functions copied to the destination. Active assessment functions pin their server SDK to 2.118.0. The already-retired QA endpoint remains retired.
- The public image was copied without changing bytes: 3,157,102 bytes, SHA-256 `f9c30eeae6bdbe24bd16ba6c1d6054cb3f375fdefee9fea7e3cc406ea3ac037b`. An independent download from the destination matched the backup. The single saved Challenge draft referencing that exact URL was backed up, checked for concurrent edits and updated to the copied object; its version increased to prevent stale saves. Published content was unchanged.
- Public Auth provider settings match between projects: email enabled, confirmation enabled, anonymous and external OAuth providers disabled. A synthetic Admin-generated recovery link requesting `https://www.mayneleadership.com/smart-goals.html` falls back to `http://localhost:3000`. No recovery email was sent. Correct the destination Site URL/redirect allowlist in the Supabase dashboard and verify the complete recovery flow and SMTP configuration before cutover.
- Four static pages and the Challenge/Learning Studio Auth constants are prepared to use the destination URL and publishable key. The live website still uses the original source.

The owner explicitly authorized transferring all five accounts, including email addresses, password hashes and restrictions, to Classroom Calendar. A fresh source snapshot matched the private backup. The supported Auth Admin import API preserved all five UUIDs and password hashes. A guarded transaction restored exact source metadata, confirmation/audit timestamps and both permanent bans, then inserted the 13 application records in dependency order. Typed row comparison and account-field comparison passed. Imported profiles retain the destination's ordinary `user` role; administrator access is still controlled by the migrated membership table.

The source remains authoritative while the website still uses it. Before cutover, check both systems again and reconcile any new source accounts, password changes, assessment activity or media uploads. Do not overwrite destination edits blindly or treat today's snapshot as a continuing synchronization service.

## Verification

Seven PostgreSQL migration checks pass: RLS/grants, anonymous/non-admin denial, administrator/progress-view behavior, service-only single-use invitation redemption, owner-scoped SMART goals, media-folder permissions and overwrite prevention. The full website build, seven Challenge model checks, ten Learning Studio model/import/player checks, the classroom DOM flow, PDF Studio checks and Word conversion checks passed.

Twenty-eight hosted HTTP checks pass with a temporary confirmed synthetic account: password login and verified claims/user identity; non-admin invitation/report denial; assessment/profile isolation and self-promotion denial; owner-only SMART goals and cross-user rejection; private response rows and service-only redemption; administrator assessment/invitation creation without email; invitation validation, invalid-rating rejection, successful submission and replay rejection; minimum-response report privacy and early-release denial; owner-folder media upload/deletion, overwrite/cross-folder rejection; session refresh, logout and revoked refresh rejection. These checks used synthetic records, not real participants or known real-user passwords. They do not establish email delivery or manual browser accessibility. The five real password hashes were compared directly without printing them.

Temporary test records and their Auth identity are removed after verification, and the short-lived privileged migration function is retired. Real-account browser acceptance, recovery/SMTP verification and production cutover remain pending. No new consolidation security/performance warnings were identified; the response table intentionally has default-deny RLS, and newly created indexes may be reported as unused until production traffic begins.

The destination advisor baseline already contained legacy public-definer warnings, private/default-deny tables and unrelated index/policy notices. The consolidation uses private definer implementations and public invoker wrappers. Its follow-up migration removes duplicate indexes and evaluates caller identity once per policy statement. No unrelated existing application policy is changed.

Advisor guidance: [default-deny RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [public definer routines](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [signed-in definer routines](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [policy evaluation](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan), [duplicate indexes](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index).

## Cutover gate

1. Account transfer and record equality are complete as of the verified snapshot. Recheck the source immediately before cutover and reconcile intervening writes under the existing authorization. Preserve UUIDs, hashes, confirmations and restrictions; never commit live records or credentials.
2. Configure destination Auth Site URL `https://www.mayneleadership.com` and allow the exact required confirmation/recovery redirect URLs, including both Mayne domain variants used by the website. Inspect existing source settings before choosing SMTP/provider behavior; preserve verification requirements. The connected database tools cannot change these dashboard Auth settings.
3. Repeat the recovery-link redirect check and verify actual account recovery, confirmation/email configuration and normal instructor login. Do not email real users or reset their passwords as a workaround. Browser acceptance and delivery verification remain distinct from the hosted API tests.
4. Media copy and the saved draft reference update are complete. Recheck for newly uploaded source media and any other stored/source URL dependencies before retirement.
5. Refresh this branch against main, resolve any intervening changes, build/test and publish the website switch. Verify public response pages, instructor sign-in, reports, SMART-goal privacy, Challenge uploads and Learning Studio against the destination. Users sign in again because project sessions/signing keys are separate; existing passwords should remain valid.
6. Confirm no traffic or content still depends on the old backend. Keep the original available for rollback until the cutover passes. Then pause it to free a slot and provision a fresh CREASY project; do not mix CREASY accounts or records into the Mayne Leadership backend.

## Recovery

Before cutover, the source remains authoritative. Reverting the prepared URL/key changes restores the old connections. Do not delete either backend or remove source data while verification is incomplete. The private backup is a recovery artifact, not an application asset or public export.

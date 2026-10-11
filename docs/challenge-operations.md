# Leadership Challenge Studio operations

## Existing integration

The static Mayne Leadership site remains intact. React is bundled by the existing esbuild build into `public/assets/challenge-app.js`. `facilitation.html` adds the Classroom Tools card. `api/challenge.js` is a Vercel Node function loading a private esbuild server bundle in `dist/challenge-server.mjs`. This bundle resolves mixed CommonJS/ESM dependencies for the existing hosting loader and is never placed in the public output directory. The exact public joining page and API are exceptions to the existing website PIN middleware; instructor pages still require the site PIN and instructor authentication.

Instructor authentication uses the existing Mayne Leadership 360 Supabase project (`oxgbhrhpgvtolbasxzjj`) and `public.ml360_admins`. Content and gameplay use the existing classroom project (`vteamreihsunsllwcphw`) in the isolated `ml_challenge` schema. Media uses the first project's `leadership-challenge` Storage bucket. Existing schemas and services are preserved.

## Environment configuration

`CHALLENGE_STUDIO_GATEWAY_KEY` is a cryptographically random 64-character hexadecimal secret, already configured as an encrypted Vercel variable for Production and Preview. Only its SHA-256 digest is stored in `ml_challenge.gateway_keys`. Never include the plaintext key in a client bundle, source control, exports or diagnostics. Rotate it by adding a new digest, updating both Vercel environments, redeploying, then removing the old digest after old deployments stop serving traffic.

Existing `LEADERSHIP_ACCESS_SECRET` and `LEADERSHIP_ACCESS_PIN_VERIFIER` continue to protect the website. Their values were not changed. Publishable Supabase project URLs and keys are in `src/challenge/model.js`; they are public identifiers, with no table access to the private game schema.

An authorized instructor must exist in BOTH the existing authentication project's `ml360_admins` and the classroom project's `ml_challenge.instructors`. The existing owner is already provisioned. Use the actual Auth user UUID when adding an instructor; user-editable account metadata never grants access.

## Migrations and examples

Apply `supabase/migrations/*.sql` in filename order to the classroom project. The migration changes are additive and isolated to this application. Apply `supabase/leadership_challenge_media.sql` separately to the authentication/media project. Review project selection carefully; these are two existing Supabase projects. Never rerun initial `CREATE` migrations against an already migrated database.

Migration files include all fixes to answer validation, reports, team ranks, timer concurrency and host signal channels. Initial deployment provisioning inserted the gateway digest and authorized owner as environment-specific data, not hard-coded identities in schema migrations. `scripts/seed-challenge.mjs` creates and publishes the three 10-question examples for the instructor selected by CHALLENGE_STUDIO_OWNER_ID; it checks existing titles before inserting.

Live sessions store a snapshot of published content. Editing or deleting a game leaves its historical results intact. Session deletion cascades to its own participants, teams and submissions. Retention removes only the current instructor's completed/expired sessions when listing their dashboard. Storage media is retained so copied games and portable references continue to work; owned media can be removed from the Supabase Storage console after checking references.

## Security and authority

The Vercel API verifies Supabase-signed JWT claims and the existing instructor registry. Verified membership is cached for at most 30 seconds and never past token expiration; the database checks its instructor allowlist and content/session ownership on every call. All private tables use RLS, default-deny access and revoked client grants. The single exposed forwarding RPC requires the unguessable server gateway key; its privileged implementation is in a non-exposed schema with an empty search path.

Guests use a random 256-bit HttpOnly, Secure, SameSite=Lax cookie. The database stores only its SHA-256 hash. Server time, deadlines, score calculations, accepted values, exact-once submissions, replay checks, locks and state transitions are implemented in PostgreSQL. Before reveal, student snapshots omit all correct-answer fields, explanations and current-question points. Duplicate retries with the same request ID return the accepted result; another submission for that question is rejected.

Realtime broadcasts contain only state-change notifications. Clients always fetch authorized snapshots and never trust broadcast data for scores or controls. Lobby/answer signals use a host channel so 100 student submissions do not generate 10,000 student messages. A five-second polling fallback and online refresh support reconnects. The configured session cap is 150; only 100 is the tested classroom target. Join/lookup requests are rate-limited to 220 per hashed IP per minute, allowing a 100-person classroom on shared Wi-Fi.

Rich text is sanitized on the server and client. Origin and content-type checks, request size limits, media MIME/size restrictions, foreign keys, unique constraints and indexed session access protect the boundary. Errors log component, action, status and database error code without tokens, answer bodies or nicknames.

## Build and verification

Run `npm ci`, `npm run build`, `npm run test:challenge`, `npm run check:pdf` and `npm run check:word`. Backend, advanced, browser and load checks require an explicitly provisioned QA instructor and the ignored local configuration files described below. Tests create genuine database records under that QA account; remove only that account's test content after verification. Do not run cleanup against the content owner.

`.lcs-env.json` contains the gateway secret and existing website PIN signing variables for the local test server. `.lcs-qa.json` contains `{ "id": "QA Auth UUID", "email": "QA login", "password": "QA password" }`. Keep both files private (mode 600) and untracked. `scripts/dev-challenge.mjs` runs the real middleware and API against the real services. For localhost browser tests use a temporary HTTPS certificate in `tmp/lcs-test-key.pem` and `tmp/lcs-test-cert.pem`, then `LCS_TEST_HTTPS=1 npm run test:challenge:browser`. Install Chromium with `npx playwright install chromium`, or use `LCS_TEST_BROWSER` to specify a test browser executable.

Use `LCS_TEST_BASE=https://mayneleadership.com` for real deployment tests. The browser test signs a temporary site access cookie using the existing secret, then performs a real instructor login. For a protected Vercel preview, use the connected Vercel account's temporary authenticated access; do not disable deployment protection. For a protected preview, obtain its short-lived `_vercel_jwt` cookie using the connected account’s share URL, then pass that single cookie as `LCS_TEST_DEPLOYMENT_COOKIE`. It is origin-scoped and never committed. Browser tests block all network origins except the deployment and the two required Supabase services, including external telemetry.

`npm run test:challenge:backend` exercises every format and scoring/security boundary. `npm run test:challenge:advanced` exercises imports, media, review, teams, pause/deadlines and anonymous reports. `npm run test:challenge:browser` uses an instructor plus two independent mobile browser contexts. `npm run test:challenge:load` defaults to 100 real guest identities and 100 WebSocket clients across 25 questions; `LCS_LOAD_ROUNDS=3` selects a shorter repeated-round check. Results go to ignored `tmp/challenge-*-results.json` files.

## Instructor help

The guide is available at `/challenge-guide.html` from Settings. No developer or JSON editing is required for ordinary game creation, publication, hosting or reports. Browser-based identity means per-browser assignment attempt limits can be bypassed by clearing cookies; use named attendance or supervised access when person-level enforcement is required. Uploaded media is public; avoid confidential media. Automated browser checks cover desktop and mobile viewports, not a claim of testing every physical phone or assistive technology.

Supabase security advisors show informational notices for the private tables with RLS and no client policies, an intentional default-deny design ([explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). Existing calendar/360 public definer-function and Auth password-protection advisories remain outside this change; no existing privileges or password settings were changed. Their guidance is available for [public routines](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [signed-in routines](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

# SENTRY · purpose-bound insider-threat intelligence (Zecathon 6.0 demo)

One Next.js + TypeScript app. Engines, simulator and API run server-side on SQLite (better-sqlite3).

## Password-free synthetic demo (PowerShell, Node 20+)

Use fresh absolute paths. Demo mode creates one isolated business SQLite workspace per browser visitor; the selected persona is a server-side allowlist entry, not a client-supplied role.

```powershell
$demo = Join-Path $env:TEMP 'sentry-picker-demo'
New-Item -ItemType Directory -Force -Path $demo | Out-Null
$env:DB_PATH = Join-Path $demo 'non-demo-business.db'
$env:AUTH_DB_PATH = Join-Path $demo 'auth.db'
$env:DEMO_WORKSPACE_ROOT = Join-Path $demo 'visitors'
$env:APP_ORIGIN = 'http://127.0.0.1:3000'
$env:AUTH_ALLOW_INSECURE_LOOPBACK = '1'
$env:SENTRY_DEMO_MODE = '1'
npm run demo:prepare
npm run dev -- --hostname 127.0.0.1
```

`demo:prepare` performs the expensive deterministic seed build before the server accepts visitors. It is idempotent. Open `http://127.0.0.1:3000/login`, choose Presenter, Operator, Independent Reviewer or Auditor, then select **Enter demo**. No credentials are provisioned. **Switch account** rotates the current session while preserving that visitor's scenario; reveal grants remain bound to the revoked prior session. Two visitors, including two visitors selecting the same persona, receive different server-generated workspaces and run IDs. On each demo entry, visitor workspaces unused for `DEMO_WORKSPACE_TTL_HOURS` (default 6) are deleted, and at `DEMO_WORKSPACE_MAX` (default 40) the least recently used workspace is retired to make room. Retiring a workspace revokes its sessions, and each removal is logged to stdout and the auth store's security audit. Only server-named `WS-…` directories are ever deleted, never `_templates/` or the auth database. Local SQLite requires a persistent filesystem and a single application process, so this mode is not suitable for ephemeral/serverless multi-instance hosting.

The prepared workspace also includes one independent Access Bridge example on the Operator screen. It can issue only `VIEW_RESTRICTION_STATUS` for one assigned sample case/customer, for `ACCESS_BRIDGE_TTL_MINUTES` (default 10, bounded to 1–60). This is a local permission-gate simulation, not an IAM/PAM or bank-system grant. The server rechecks the session, workspace/run, assignment, approved coverage, eligibility, complaint evidence, case state, operation, expiry and revocation on every protected read.

For HTTPS, set `APP_ORIGIN` to the exact public HTTPS origin and omit `AUTH_ALLOW_INSECURE_LOOPBACK`. Demo mode fails closed without an absolute `DEMO_WORKSPACE_ROOT`. It remains synthetic-only and does not make persona switching equivalent to independent real people.

## Normal password-authenticated setup

```powershell
$demo = Join-Path $env:TEMP 'sentry-local-demo'
New-Item -ItemType Directory -Force -Path $demo | Out-Null
$env:DB_PATH = Join-Path $demo 'business.db'
$env:AUTH_DB_PATH = Join-Path $demo 'auth.db'
$env:APP_ORIGIN = 'http://127.0.0.1:3000'
$env:AUTH_ALLOW_INSECURE_LOOPBACK = '1'
$env:SENTRY_PASSWORD_OPERATOR_TUNDE = [Net.NetworkCredential]::new('', (Read-Host 'operator-tunde password' -AsSecureString)).Password
$env:SENTRY_PASSWORD_REVIEWER_ADA = [Net.NetworkCredential]::new('', (Read-Host 'reviewer-ada password' -AsSecureString)).Password
$env:SENTRY_PASSWORD_REVIEWER_TUNDE = [Net.NetworkCredential]::new('', (Read-Host 'reviewer-tunde password' -AsSecureString)).Password
$env:SENTRY_PASSWORD_AUDITOR = [Net.NetworkCredential]::new('', (Read-Host 'auditor password' -AsSecureString)).Password
$env:SENTRY_PASSWORD_PRESENTER = [Net.NetworkCredential]::new('', (Read-Host 'presenter password' -AsSecureString)).Password
npm run auth:provision
npm run dev -- --hostname 127.0.0.1
```

Passwords must be 12–128 characters and are not printed by the provisioner. The fixed synthetic accounts are `operator-tunde` (own explanations), `reviewer-ada` (independent review), `reviewer-tunde` (negative self-review demonstration), `auditor` (read-only), and `presenter` (review plus simulation control). There is no sign-up. The password-free picker is unavailable unless `SENTRY_DEMO_MODE=1` is explicitly set. Use separate browser profiles/contexts for a normal-auth operator and reviewer rehearsal.

Normal password mode builds a seeded template beside the selected `DB_PATH` on its first authenticated business read. Explicit demo mode uses `npm run demo:prepare` to build the prepared showcase template once, then copies it into each new visitor's private workspace. Reset does not alter the separate auth database or existing sessions. The HTTP exception above is accepted only for an explicitly configured loopback origin; use HTTPS and omit `AUTH_ALLOW_INSECURE_LOOPBACK` outside that local mode. Missing auth configuration fails closed.

## Demo path

Password-free demo visitors open on a prepared, undecided investigation snapshot: the legitimate overtime example has cleared and the wrong-destination reversal is waiting for the operator's evidence. No ticket answer, reviewer decision, hold or containment effect is automated. Use the account switcher to move between the fixed Operator, Independent Reviewer and Auditor views without resetting that visitor workspace.

For a separate recording of the original deterministic step sequence, use an unused disposable database path and the CLI-only rehearsal. It is synthetic automation and deliberately approves its own simulated gates; it is not reachable through HTTP:

```powershell
$env:DB_PATH = "$PWD\.local-rehearsal\business.db"
$env:AUTH_DB_PATH = "$PWD\.local-rehearsal\auth.db"
npm run rehearse
```

The following table documents that CLI/test sequence; the normal product header does not expose playback controls.

| Step | Sim time | Expected |
|---|---|---|
| S1.1 | 21:10 | Ngozi: raw 17 -> 6, Normal, "Cleared automatically" toast |
| S2.0 | 21:10 | Tunde's week: Monday 6 |
| S2.1 / operator / S2.2 / S2.3 | 21:47 / 21:47 / 21:48 / 21:53 | 38; operator submits genuine TKT-2291; destination mismatch remains; 38 -> 64 Hold. Gate: Approve hold (N5,835,000, 6 BVNs on the 24-hour watchlist) |
| S2.4 | 21:58 | 31 transfers blocked, 81 Contain. Gate: Approve suspension |
| S3.1 to S3.4 | 22:05 to 22:10 | Bisi: 35 -> 55 -> 70 -> 85, export blocked. Gate: Approve suspension |
| S4.1 | 22:15 | Leak tracer: Staff-B4E0 viewed all 5 victims -> 35 Verify, CASE-0003 |

## Deploy (one container, one instance)

The `Dockerfile` builds on `node:22-bookworm-slim` (`npm ci`, `npm run build`) and is sized for a **512 MB** host. The deterministic visitor template is generated in a build stage (`demo:prepare`) and baked into the image at `/app/template/`. The runtime image keeps only production dependencies and does no data generation. On start, `scripts/docker-start.sh` copies the template onto an empty `/data` volume (a few seconds), then runs `next start` on `0.0.0.0:$PORT`. Mount a persistent volume at `/data`.

`NODE_OPTIONS` defaults to `--max-old-space-size=384`; override it with `-e NODE_OPTIONS=…`. Measured with `docker run --memory=512m` on an empty volume, the server listened after about 8 s. It used about 110 MB RSS idle, and about 150 MB at peak while one visitor ran S1–S4 to the end with live activity on for two minutes. Each visitor workspace is a copy of the 112 MB template, so size the volume for `DEMO_WORKSPACE_MAX` × 112 MB plus the template (about 5 GB at the default 40). In demo mode `/api/ingest/events` requires a `workspace_id`; it never seeds the unused default database at runtime.

Required environment:

| Variable | Value |
|---|---|
| `SENTRY_DEMO_MODE` | `1` (the image default) |
| `APP_ORIGIN` | the exact public HTTPS URL, e.g. `https://sentry-demo.up.railway.app`, with no trailing slash |
| `DB_PATH` / `AUTH_DB_PATH` / `DEMO_WORKSPACE_ROOT` | on the mounted volume: `/data/business.db`, `/data/auth.db`, `/data/visitors` (the image defaults) |
| `INGEST_KEY` | a long random secret, e.g. `openssl rand -hex 32`. Leave it unset to keep `/api/ingest/events` closed |

`AUTH_ALLOW_INSECURE_LOOPBACK` must **not** be set in a deployment. Run **exactly one instance**: SQLite files, workspaces and the live clock live on one volume and one process, so do not scale out or run replicas.

Hosts such as Railway and Render terminate TLS and forward plain HTTP to the container; no extra proxy setting is needed. Cookie security and CSRF origin checks derive from `APP_ORIGIN`, not from the forwarded request: session cookies are `Secure; HttpOnly; SameSite=Strict` whenever `APP_ORIGIN` is https, and every mutation must carry exactly that `Origin`.

```bash
docker build -t sentry-demo .
docker run -p 8080:8080 -e PORT=8080 -e APP_ORIGIN=https://your.public.host -e INGEST_KEY=$(openssl rand -hex 32) -v sentry-data:/data sentry-demo
```

## Live simulated activity

All of it is synthetic. Signed in as Presenter, the console's **Live activity: On/Off** switch makes each console refresh generate the events due since the previous refresh (at most 20) for that visitor's workspace, on a separate live clock that starts at the scenario clock, runs at 4x and never falls behind it. A banner reads "Live simulated activity · synthetic staff". `src/server/sim/live.ts` draws, per staff member and simulated minute from the seeded RNG, work for rostered reversal and customer-service staff who are on shift: reversals of a new failed debit back to the debited account and record views on open customer-service cases, on their usual terminal. About 3% is honest noise that review policy treats as soft: a reversal to the same customer's other account, or a little work up to 30 minutes after the shift. A record view with no case is deliberately not generated, because review policy makes it a confirmed finding that opens a case. The generator skips scripted characters, anyone with an open case, and anyone whose last 24 hours already need review, and it never opens a case itself. The late shift ends at 21:00, so the first time live mode is switched on in a workspace it also opens an **evening operations desk**. Twelve non-scripted reversal staff get an approved overtime ticket and 17:00–23:59 overtime on the scenario day, each approved by a different colleague on the same team (audited as `LIVE_DESK_OPENED`). Their live work is matched and inside overtime, so a prepared visitor workspace at 21:47 shows live events within seconds and still opens no case.

From outside the app, `INGEST_KEY=… npm run live-feed -- --url http://127.0.0.1:3000 [--workspace WS-…] [--duration 60]` posts the same generated batches to `/api/ingest/events` every 3 seconds. It prints what it sent and SENTRY's response, then a summary. Against a demo-mode server, pass `--workspace` with a visitor's workspace id. It reads rosters from the seed database beside `DB_PATH` (or `--context`).

## Commands

`npm run demo:prepare` · `npm run dev` · `npm run start` · `npm run auth:provision` · `npm run seed` · `npm run rehearse` (isolated CLI synthetic automation; runs every step, approves every gate, prints scores) · `npm run false-alarms` · `npm run live-feed` · `npm test` · `npm run lint` · `npm run typecheck` · `npm run build`

## Offline Pass 4 comparison

The frozen internal synthetic protocol is generated before held-out execution and lives under `evaluation/pass4/frozen`. The runner refuses default database paths: set explicit, unused absolute `DB_PATH`, `AUTH_DB_PATH`, `EVAL_DB_DIR`, `EVAL_OUTPUT_DIR`, and `EVAL_FREEZE_DIR` values, all within the documented evaluation directories, then run `npm run evaluate:pass4`. Use `EVAL_SPLIT=development` for harness debugging and omit it for the frozen evaluation cohort. `npm run evaluate:parity` checks the existing genuine-ticket S2 path using explicit `EVAL_PARITY_DB_PATH` and `EVAL_PARITY_OUTPUT` values.

Configurations A–C are declared internal comparators; D calls the production purpose engine and evaluator but does not open cases, approve controls, or execute containment. The resulting report must not be presented as bank-data accuracy, investigation-time savings, prevented loss, production throughput, AI improvement, or a comparison with a bank or vendor.

## Offline Pass 5 comparison

Pass 5 has a separate frozen corpus under `evaluation/pass5/frozen`; Pass 4 artifacts remain unchanged. Run `npm run evaluate:freeze:pass5` only when deliberately creating a new freeze, then set explicit unused absolute `DB_PATH`, `AUTH_DB_PATH`, `EVAL_DB_DIR`, `EVAL_OUTPUT_DIR`, and `EVAL_FREEZE_DIR` paths and run `npm run evaluate:pass5`. Set `EVAL_SPLIT=development` for harness checks and omit it for the held-out cohort. The runner verifies the frozen corpus and production-source hashes before evaluating.

`risk-review-v2` separates review initiation from score severity. Canonical R1–R5 reversal contradictions and V1 unrelated-record access require review even below score 30 under the local simulator's healthy-complete-source assumption. The displayed score and Normal/Watch level remain unchanged. A reason-based review opens only a case and `REQUEST_REASON`; Hold, suspension and simulated containment still require their existing score bands and independent reviewer flow.

## Where things live

- `src/server/sim/generator.ts` raw synthetic bank (writes no results) · `scenarios.ts` the only home of steps · `player.ts` steps, ladder, interventions, watchlist, tracer, decisions
- `src/server/engines/signals.ts` the only home of signal codes and points · `purpose.ts` R1-R5, V1, E1, T1-T5 · `pipeline.ts` behaviour, identity, money and leak signals, waivers W1-W4, scoring
- `src/server/casenotes/template.ts` deterministic case notes (LLM rewrite slot: `llm.ts`, not wired yet)
- `src/server/services/read.ts` read models for every screen · `src/app/api/**` routes · `src/app/**` screens

## Endpoints

Public: GET `/api/health`, GET `/api/auth/mode`; POST `/api/auth/login` in normal mode and POST `/api/auth/demo` in explicitly enabled demo mode. Authenticated: GET `/api/auth/session`; POST `/api/auth/logout`. Switching personas calls `/api/auth/demo` with the current session's CSRF token and exact Origin.

Capability-protected reads: GET `/api/console` `/api/sim/state` `/api/scenarios` `/api/actions` `/api/risk/top` `/api/staff/{id}` `/api/staff/{id}/timeline` `/api/cases` `/api/cases/{id}` `/api/graph/{case_id}` `/api/metrics` `/api/audit` `/api/tracer/{caller}` `/api/stream`.

Access Bridge reads: GET `/api/access-bridge` (operator assignment or reviewer/auditor activity projection) and GET `/api/access-bridge/grants/{id}/restriction` (grant-enforced sample restriction status). Mutations: POST `/api/access-bridge/request` and POST `/api/access-bridge/cases/{id}/complete`. They require the authenticated operator, CSRF/run binding and canonical assignment; client-supplied identities, roles and approval flags are rejected.

Capability- and CSRF-protected mutations: POST `/api/sim/reset` `/api/scenarios/{id}/next` (409 at a gate) `/api/interventions/{id}/approve|reject` `/api/cases/{id}/unmask` `/api/actions/{id}/answer` `/api/sim/live` (`{ run_id, enabled }`, Presenter's *Live activity* switch). POST `/api/scenarios/rehearse` is intentionally disabled (410); the isolated CLI helper is not an HTTP authority path.

Machine ingest (no session; header `X-Ingest-Key` must equal env `INGEST_KEY`, otherwise 401, and closed while `INGEST_KEY` is unset): POST `/api/ingest/events` with `{ workspace_id?, events: [...] }`, 1–200 Zod-validated events of type `login`, `reversal` (`original_txn_id`, `credit_account_id`, `amount`), `record_view` (`customer_id`, `ticket_ref`), `export` (`ticket_ref`, `rows`, `scope`) or `failed_debit` (the core-banking debit a reversal is checked against). `workspace_id` may name an existing demo visitor workspace, never a new one. Events are idempotent on `id` (repeats are reported under `duplicates`); events for scripted S1–S4 characters or records are rejected. After insert, purpose checks and the scenario scoring path (signals, evidence, score, review ladder) run for each affected staff member, so a genuinely contradicted event can still open a case. The response lists inserted, duplicate and rejected ids, each action's purpose status, the new scores and any cases opened.

Business mutations carry the currently rendered `run_id`. Decisions additionally carry the server-issued `review_ref` for the rendered material evidence and target scope. A reset or material change returns a stable 409 (`RUN_STALE`, `REVIEW_REQUIRED`, or `REVIEW_STALE`) without applying the local effect. Reveal grants are scoped to session + run + case. Decision cards deliberately retain the reviewed reference until the reviewer chooses “review updated evidence”; polling does not silently upgrade an old decision.

## Decisions

- Console uses the light theme from DESIGN.md; the pitch deck stays dark.
- ACC-N1 to N6 opened 10 to 15 Oct (avoids the 7-day boundary).
- W4 extended: ON_LEAVE suppresses OUTSIDE_ROSTER and VOLUME_ANOMALY (when identity is in doubt, the person's behaviour baseline does not apply). Keeps S3.3 at exactly 70.
- At Hold, SECOND_APPROVER and HOLD_FUNDS are created only when money signals are present; RESTRICT_DATA_ACCESS only when data signals are present.
- Console, case and operator views poll every 3 s and refresh immediately after a local mutation. Identical in-flight reads and session probes are deduplicated in the browser (the demo does not depend on SSE).
- Case notes use a deterministic evidence-linked template. The interface does not present them as AI-generated; the LLM rewrite remains an unwired follow-up in `llm.ts`.
- Measured false-alarm test: 100 unusual-but-legitimate events over 5 seeds (~54,000 staff-days): 0 false alerts.
- `/api/console` is kept under the poll interval four ways: an index on `sensitive_actions(ts)`; the live feed groups only the newest timestamps rather than the whole 30-day baseline; counters are cached until material state changes; and the full projection is cached per workspace database until the run's clock, evidence, score, case or intervention version changes (`clearMetricsCache` on reset).
- Never point two servers at the same business/auth paths or Next output directory. `npm run demo-reset` and the Reset button replace their configured business database; Windows refuses that replacement while a second process holds the same file open.
- Local authentication uses a separate SQLite store, salted Node `scrypt`, opaque random sessions stored as digests, HttpOnly SameSite=Strict cookies, expiry/revocation, login throttling, exact configured-origin checks and a session-bound CSRF token. It is a bounded demo-local identity layer, not an enterprise identity provider. Application audit rows are ordinary mutable SQLite records, not tamper-proof evidence.
- Every fresh/reset business dataset receives a new non-secret run ID. Evidence evaluations and score snapshots are displayed separately; a ticket answer refreshes canonical findings but does not silently append a score or run the intervention ladder.
- `risk-review-v2` is deterministic policy, not AI. Source unavailability is not represented; R1/V1 hard-missing conclusions must not be carried into a pilot without a trustworthy source-health contract.

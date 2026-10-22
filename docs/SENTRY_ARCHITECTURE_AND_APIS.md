# SENTRY architecture and APIs

This describes the implementation in the repository on 21 October 2026. All banking data and effects in the demonstrated application are synthetic.

## Data flow

```text
Browser (React pages)
  ├─ password-free persona selection (explicit demo mode)
  ├─ HttpOnly opaque session cookie + session-bound CSRF header
  └─ polling reads / guarded mutation requests
           │
           ▼
Next.js 15 Route Handlers (single Node process)
  ├─ exact configured-origin / CSRF checks
  ├─ verified principal + central capability policy
  ├─ AsyncLocalStorage workspace selection
  └─ per-principal projection/masking
           │
     ┌─────┴─────────────────────┐
     ▼                           ▼
Auth SQLite                     Per-visitor business SQLite
accounts/sessions/throttle      synthetic source records
reveal grants/security audit    purpose results/signals/scores
                                 cases/reviews/interventions/audit
                                            │
             ┌──────────────────────────────┼──────────────────────┐
             ▼                              ▼                      ▼
      Purpose engine                 Risk/review policy      Scenario simulator
      R1–R5/V1/E1/T1–T5             signals + score +       deterministic steps,
      canonical source checks        risk-review-v2          local effects only
```

A first demo visitor receives a server-generated workspace ID. The server copies a prepared deterministic seed template, rotates a non-secret run ID, and stores only that workspace ID in the verified session. An account switch rotates the opaque session but preserves the visitor workspace; the prior session's reveal grant is removed. Another visitor gets a different workspace and run.

## Authoritative stores and lifecycle

The 25 business tables are: `staff`, `roster`, `leave`, `overtime`, `terminals`, `logins`, `customers`, `accounts`, `transactions`, `tickets`, `sensitive_actions`, `outbound_transfers`, `purpose_results`, `signals`, `risk_scores`, `cases`, `interventions`, `case_notes`, `audit_log`, `sim_state`, `bvn_watchlist`, `scam_reports`, `ticket_answers`, `evidence_evaluations`, and `intervention_reviews` (`src/server/db/migrate.ts`). Foreign keys are enabled and targeted indexes cover common staff/time, transaction, ticket, action, transfer, evidence and review lookups.

The six auth tables are: `auth_accounts`, `auth_sessions`, `auth_login_throttle`, `auth_reveal_grants`, `auth_security_audit`, and `auth_demo_workspaces` (`src/server/auth/store.ts`). Auth reset and business scenario reset are separate. A business reset rotates the run ID; it does not silently log the visitor out. Reveal authority is session + run + case scoped.

The current process keeps database handles and the local event bus on `globalThis` for development hot reload. Console caches are `WeakMap`s keyed by the actual workspace database handle and invalidated by material clock/evidence/score/case/intervention versions; they never share a projection between visitor databases.

## Security boundaries

- Password mode: provisioned synthetic accounts, Node salted `scrypt`, generic login failure, input bounds and throttle.
- Demo mode: fixed server allowlist from `src/server/auth/demoPersonas.ts`; the selected ID never supplies roles/capabilities.
- Sessions: 32-byte random bearer tokens; only token digests are stored; HttpOnly, host-scoped, `SameSite=Strict`, expiry/revocation. Secure cookies are required on HTTPS. Plain HTTP requires explicit loopback-only configuration.
- Mutations: exact `APP_ORIGIN`, `X-SENTRY-REQUEST`, session-bound CSRF token, route capability and service relationship checks.
- Reviewer decisions: canonical-staff independence plus persisted run/evidence/target `review_ref`; stale decisions fail without applying an effect.
- Identity reveal: eligible open case, reason, capability, and session/run/case grant. Read projection masks names for other sessions and auditors.
- Limit: this is local prototype security, not enterprise identity, tamper-proof audit, HSM-backed secrets, distributed authorization or regulatory certification.

## API inventory

All handlers declare Node runtime and force-dynamic behavior. Except the two public GETs and mode-specific login entry, reads require a verified session; sensitive operations also require CSRF and a capability.

| Method and route | Purpose / caller | Enforcement | Service / storage |
|---|---|---|---|
| GET `/api/health` | Liveness | public, no business DB | static `{ok:true}` |
| GET `/api/auth/mode` | Login screen mode/personas | public; only fixed public persona metadata | config + `demoPersonas.ts` |
| POST `/api/auth/login` | Normal password login | disabled in demo mode; exact origin/request marker | auth SQLite |
| POST `/api/auth/demo` | Enter/switch fixed demo persona | demo flag; exact origin; CSRF when switching | auth SQLite + private workspace creation/copy |
| GET `/api/auth/session` | Current actor/capabilities | session cookie | auth SQLite |
| POST `/api/auth/logout` | Revoke current session | authenticated mutation checks | auth SQLite + cookie clear |
| GET `/api/sim/state` | Header clock/scenario/gates | any verified principal | `read.simState` in selected workspace |
| GET `/api/scenarios` | Scenario metadata | verified principal | fixed `sim/scenarios.ts` steps |
| POST `/api/scenarios/{id}/next` | Advance synthetic scenario | `CONTROL_SIMULATION`, CSRF, supplied current `run_id` | `player.nextStep` |
| POST `/api/sim/reset` | Reset only current visitor run | `CONTROL_SIMULATION`, CSRF, current `run_id` | template copy + new run ID |
| POST `/api/scenarios/rehearse` | Historical HTTP shortcut | always 410 disabled | CLI rehearsal only |
| GET `/api/console?flagged=1` | Console projection | `READ_INVESTIGATIONS`, principal projection | cached `read.consoleView` |
| GET `/api/actions` | Operator-owned scenario actions | verified principal; service returns own mapped staff only | `read.operatorActions` |
| POST `/api/actions/{id}/answer` | Submit ticket explanation | `ANSWER_OWN_ACTION`, CSRF, route ID/body Zod, run and canonical ownership | `secureActions.answerOwnAction` / `player.answerTicket` |
| GET `/api/cases` | Case list | `READ_INVESTIGATIONS` | `read.caseList` + masking projection |
| GET `/api/cases/{id}` | Case evidence/decision/review refs | `READ_INVESTIGATIONS`; reveal checked for this session/run/case | `read.caseView`, `reviewContext` |
| POST `/api/cases/{id}/unmask` | Case-scoped identity reveal | `REVEAL_IDENTITY`, CSRF, run/case/reason and case eligibility | auth reveal grant + business audit |
| GET `/api/graph/{case_id}` | Money movement graph | `READ_INVESTIGATIONS`, projected/masked | `read.graphView` |
| POST `/api/interventions/{id}/approve` | Approve existing simulated control | `DECIDE_INTERVENTION`, CSRF, Zod, current run/review ref, independence | transactional `secureActions.decideIntervention` |
| POST `/api/interventions/{id}/reject` | Reject existing simulated control | same as approve | same transaction path |
| GET `/api/staff/{id}` | Staff risk history | `READ_INVESTIGATIONS`, projection | `read.staffView` |
| GET `/api/staff/{id}/timeline` | Score timeline | `READ_INVESTIGATIONS` | `risk_scores` |
| GET `/api/risk/top?limit=` | Top-risk cards | `READ_INVESTIGATIONS`, max 50 | `read.topRisk` |
| GET `/api/tracer/{caller}` | Common-viewer correlation | `READ_INVESTIGATIONS` | simulator tracer + read projection |
| GET `/api/metrics` | Synthetic counters and false-alarm artifacts | `READ_INVESTIGATIONS` | `read.metrics`, local JSON artifacts |
| GET `/api/audit?limit=` | Redacted application audit | `READ_AUDIT`, max limit in route | `read.auditView` with structured redaction |
| GET `/api/stream` | Server-sent event stream | `READ_INVESTIGATIONS` | local event bus; current UI does not subscribe |

There are no Server Actions. `src/lib/api.ts`, fixtures and `src/lib/sse.ts` are legacy/unused by the current pages. The HTTP rehearsal endpoint is intentionally present only to return 410.

## Sensitive-action path

1. Presenter clicks **Next step** in `TopBar.next` (`src/components/index.tsx`). The client sends the rendered `run_id`.
2. `/api/scenarios/[id]/next` requires `CONTROL_SIMULATION` and calls `nextStep` in `src/server/sim/player.ts` within the authenticated workspace.
3. The scenario inserts the predefined synthetic event(s), calls `runPurpose`/`purposeEngine`, evaluates behavioural/identity/money signals through `createEvaluator`, persists signals and score snapshot, then applies the existing proportional ladder.
4. `decideReview` in `src/server/engines/reviewPolicy.ts` separately decides `REVIEW_REQUIRED`. A confirmed critical contradiction may require review below score 30; the numeric score is not inflated.
5. A case and request-for-reason can be opened for review. Score bands can later propose second approval, hold, restriction or suspension. Proposal is not execution.
6. The read layer returns the stored score snapshot and evidence-evaluation freshness separately. Ticket answers re-run canonical purpose/signals but do not silently append a score or run the ladder.
7. Approval/rejection carries the evidence reference that was rendered. `src/server/services/review.ts` recomputes material action, purpose, identity, target and policy facts; a mismatch returns stale-review conflict.
8. Accepted decisions and the existing simulator effect are one SQLite transaction. Holds, watchlist rows, transfer blocks and session suspension are local rows only; there is no bank acknowledgement.

## Engines and evidence

- `purpose.ts`: reversal original existence/eligibility/amount/destination/duplicate checks, record-access case scope, export ticket and general ticket validation. A genuine ticket is supporting evidence, never destination authority.
- `pipeline.ts`: deterministic purpose-derived signals, identity/session signals, roster/overtime behavior, peer volume, new-beneficiary/fan-out/shared-identifier and leak-correlation signals. It persists scores but does not call a model.
- `signals.ts`: only source of signal codes, tiers, points and score bands.
- `reviewPolicy.ts`: `risk-review-v2`, a narrow reason-based policy for canonical critical contradictions plus the existing score threshold.
- `review.ts`: material review snapshot and fingerprint; harmless polling, audit rows and row ordering are excluded.
- `template.ts`: evidence-linked deterministic case-note sentences. `llm.ts` is unimplemented and not called.

## Feature status

| Feature | Status | Evidence |
|---|---|---|
| Password-free persona picker and switch | implemented and browser/test verified | login page, demo route, `tests/demo-picker.test.ts` |
| Per-visitor workspaces and reset isolation | implemented and test verified; local single process | workspace/demo services and picker tests |
| Legitimate overtime clearing | implemented and scenario tested | S1 in `tests/scenarios.test.ts` |
| Genuine ticket retains wrong destination | implemented and route/service tested | purpose/auth tests and S2 |
| Reason-based review below score threshold | implemented and evaluation/test verified | review policy and Pass 5 tests |
| Evidence-bound independent review | implemented and test verified | review/secureActions and review-context tests |
| Hold/watchlist/blocked transfers/suspension | synthetic simulation | player/scenario tables; no external adapter |
| Identity masking/scoped reveal | implemented and test verified | auth store/request/read projection tests |
| Money graph and leak tracer | implemented; synthetic data | case graph/tracer pages and read services |
| Case-note AI | stub/planned | `llm.ts` throws; template active |
| External bank/IdP/BVN integration | not found | no adapter/client in inspected scope |
| Source unavailable/stale semantics | not implemented | evaluation marks outage episodes unsupported |
| Cumulative partial-refund entitlement | not implemented | no refund ledger |
| Production deployment/multi-instance execution | not established | local SQLite/single-process design |

## Deployment implications

A convincing local demo needs no paid service: Node, installed packages, explicit disposable/persistent local directories and loopback are enough. A bank pilot would need read-only, provenance-aware adapters for canonical transactions, tickets/approvals, rosters, identity/session telemetry and execution acknowledgements, plus enterprise identity and protected audit. Those contracts are not public Zenith endpoints and are not invented here.

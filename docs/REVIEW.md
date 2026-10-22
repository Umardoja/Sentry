# SENTRY demo review

Scope: analysis only. This review was made from the required README, repository
instructions, specification and v1.1 amendment, the design handoff, seven HTML
exports, the supplied screen captures, and the TypeScript implementation. The
handoff is under `design/design/`, rather than the paths stated in the task.
`design/design/NOTES.md` says that no authoritative NOTES handoff was supplied,
so DESIGN.md takes precedence over the HTML exports where they disagree.

## 1. How it works

One click follows this path:

1. `src/components/index.tsx`, `TopBar.next`, POSTs to
   `/api/scenarios/demo/next`. It then uses the returned `state.focus` to route
   the browser to the Console, staff profile, case, graph, or tracer. The
   button is disabled when `waiting_for_intervention_id` is non-null.
2. `src/app/api/scenarios/[id]/next/route.ts`, `POST`, gets the singleton demo
   database through `db()`, calls `nextStep(d)`, and returns the result together
   with `simState(d)`. The route parameter is not read: every value of `[id]`
   advances the same global demo.
3. `src/server/sim/player.ts`, `nextStep`, rejects the request with `GateError`
   while `pendingDecision` finds a pending intervention. Otherwise its
   transaction calls `runStep`, then stores the step clock, index, focus, toast,
   and last step in `sim_state`.
4. `runStep` inserts the step's login/actions. `insertActions` immediately calls
   `src/server/engines/pipeline.ts`, `runPurpose`, which calls
   `src/server/engines/purpose.ts`, `purposeEngine(db).evaluate`, and persists
   a `purpose_results` row through `savePurpose`. For a reversal,
   `purposeEngine.reversal` evaluates R1--R5; S2.1 consequently records
   `WRONG_BENEFICIARY` because R4 fails.
5. Back in `player.ts`, the private `score` function calls
   `pipeline.createEvaluator(db).evaluate`, then `saveSignals` and `saveScore`.
   `createEvaluator.evaluate` derives purpose, identity, behaviour, money, and
   persisted leak-tracer hits in one pass. `applyLadder` opens a case at Verify,
   creates `REQUEST_REASON`, and later creates the hold/restriction/suspension
   interventions. It calls `writeNote`, which uses `buildFacts`,
   `recommendation`, and `templateNote` from
   `src/server/casenotes/template.ts`; no LLM or cache is invoked.
6. The Console (`src/app/page.tsx`, `ConsolePage`) polls `/api/console` every
   two seconds. `src/server/services/read.ts`, `consoleView`, assembles the
   action feed, top risk, pending decision, and counters. It displays the S1
   toast from state. `TopBar` separately polls `/api/sim/state` every 1.5 s.
   Decisions POST to the intervention routes, whose `decide` call approves the
   hold (creating watchlist rows/tasks) or suspension (suspending logins and
   containing the case).
7. The Case screen (`src/app/cases/[id]/page.tsx`, `CasePage`) polls
   `/api/cases/{id}`. `read.caseView` returns score timeline, signals, purpose
   checks, interventions, prompt, note, and graph availability. The graph tab
   polls `read.graphView` via `/api/graph/{case_id}`. Thus the screen is a read
   model of persisted scenario effects, rather than a separate scoring path.

## 2. Spec conformance

`tests/scenarios.test.ts` is the repository equivalent of the spec's named
`test_scenarios.py`. “Yes” means it explicitly checks the value; “partial”
means it checks a weaker version.

| Expected value | Producer (file/function) | Test asserts it? | Finding |
|---|---|---:|---|
| S1.1 raw 17; effective 6; Normal; no case | `pipeline.createEvaluator.evaluate` (W1/W2), `player.runStep`/`score` | Yes | Conforms. |
| S2.0 Monday 6, Normal | baseline `sim/seed.ts` + `pipeline.backfill`; displayed by `read.staffView` | Partial | Baseline test asserts Monday score 6. The S2.0 step writes no score and the staff header uses current Friday START score (0), so it does not itself show “6, Normal” as the step result. |
| S2.1: 20+13+5 = 38 Verify; CASE-0001; request reason | `purpose.reversal`; `pipeline.evaluate`; `player.applyLadder` | Yes for 38/Verify/case; no for individual active points/request | Conforms numerically. |
| S2.2: +10 = 48 Verify; TKT-2291 invalid | `player.answerTicket`; `pipeline.evaluate` | Yes for 48 | Invalid ticket result is indirectly exercised, not explicitly asserted as T1/message. |
| S2.3: 40+19+5+10 = 74 Hold; second approver; N5,835,000 hold | `pipeline.evaluate`; `player.applyLadder` | Yes for 74 and hold amount | Does not explicitly assert `SECOND_APPROVER`. |
| S2.3 approval: six active BVNs; six contact tasks; expiry 2026-10-17 21:53 | `player.decide` | Yes | Conforms. Expiry correctly uses hold `created_at`, not approval time. |
| S2.4: 31 blocked; A--F counts/totals; 91 Contain; suspension pending | `player.fanOutPlan`/`runStep`; `pipeline.evaluate`; `applyLadder` | Yes for all bank totals/counts and 91; no for pending status | Conforms. |
| S2 case contained after suspension approval; exact template note | `player.decide`; `writeNote`; `casenotes/template.ts` | Yes | Conforms to the template text. |
| S3: 35, 55, 70, 85; restriction active; export blocked; Bisi note facts | `pipeline.evaluate`; `applyLadder`; `runStep` | Yes | Conforms. |
| S4: Kemi 35 Verify, CASE-0003; four other viewers have no leak signal | `player.runTracer`/`runStep`; `pipeline.evaluate` | Partial | Checks Kemi/case and only that other scores are below 30, not that `LEAK_COMMON_VIEWER` is absent. |
| End: 3 cases; 31 blocked; N5,835,000 held; six watched BVNs | `read.metrics` | No | Implemented, but no scenario test asserts the final metrics payload. |
| S5 optional: agent 40 Verify/CASE-0004; pre-posted reversal pending second approval | No runtime producer | N/A | Optional, and not built. Signal/schema entries exist, but there is no S5 step, agent generation, scope evaluation, or pre-posting intervention flow. |

### Specifications not implemented, or only partly implemented

- The v1.1 release rule is absent: no operation changes active watchlist rows
  to `RELEASED` when a hold is released or a case is closed false
  (`src/server/sim/player.ts`, `decide`; no case-close flow exists).
- The required tracer engine file, `src/server/engines/leaks.ts`, does not
  exist. Its logic is embedded in `player.runTracer`; it also does not enforce
  the “reports within seven days” or distinct-customer constraints at query
  time, although the seeded demonstration rows happen to satisfy them.
- The documented LLM/cache hand-off is not wired: `read.simState` always says
  `Template`, while the runbook and exports require “AI cached”; `llm.ts` and
  `validate.ts` are stubs.
- API/SSE behaviour is incomplete relative to the original spec: the UI is
  polling (the README declares that as a deliberate decision), and `TopBar`
  ignores the route `[id]` semantics because all values call the global player.
- The component layer contains raw hex tokens in `src/components/index.tsx` and
  pages, contrary to the repository style rule. This is not a demo-number
  failure, but makes design drift more likely.

### Intentional additions/differences from the original spec

The README documents the meaningful known differences: light console theme,
new-account dates moved to 10--15 October, W4 suppressing both roster and
volume when identity is doubtful, conditional money/data interventions, polling
instead of an SSE dependency, and deterministic Template notes. The simulator
also includes S4 and CBN watchlist work from v1.1. It adds a left navigation
rail and client-side SVG graph rather than the specified Cytoscape graph.

## 3. Screen fidelity

These are implementation-versus-export differences, ordered by visibility.

### Console at 21:53 (hold pending)

- The export uses a compact 72px rail and a wider, denser right inspector;
  implementation uses an 88px rail and larger card gaps. At projector scale it
  leaves substantially less room for the action table.
- The design's top-risk rows use a progress/risk-bar treatment; `ConsolePage`
  shows only a large number and chip. The spec explicitly asks for a 0--100
  score bar.
- The expected “Case note: AI cached” badge renders as “Case note: Template”.
- The decision card is close in content, but the app's all-caps/black text,
  oversized 22px title, and 48px buttons create a taller, less dense card than
  the export. The export also has analyst avatar/profile affordance; app has
  none.

### Console at 21:10 (Ngozi)

- The app correctly collapses the 60 reversals into the feed, but has no
  purposefully designed “cleared” state in the panel: it retains a generic
  “Nothing needs a decision” card. The export's cleared composition is much
  more deliberate and explanatory.
- The toast exists, but is fixed at the bottom right; its long one-line copy
  can be clipped against a 125% zoom viewport rather than wrapping.
- No score bar appears in top risk, and the generic controls/buttons differ
  from the export's denser segmented control.

### Case Tunde (91 Contain)

- The design export is an evidence-led two-column incident page. The app puts
  the timeline, signals, and purpose in stacked generic cards; signals are not
  a table with tier/evidence links as requested.
- `ScoreSteps` is a horizontal sequence, not a score-over-time step line on
  shaded level bands. It does not encode the vertical change from 38 to 91.
- Case note badge says Template, not AI cached; sentence hover only outlines a
  generic signal row and exposes IDs in a title rather than highlighting the
  relevant evidence rows.
- The app's banner is above the header; the export keeps containment/action
  context integrated into the main incident layout. Before approval, the
  export labels the case Open; after approval the app labels it Contained.

### Money graph

- The specified/exported graph is a graph view. The app substitutes a fixed
  1100px SVG-and-absolute-position layout, aggregates all 31 destination
  accounts into six bank cards, and cannot show the individual outside-account
  nodes/edges called for by the spec.
- It is horizontally scrollable and its 1100px inner canvas plus the 88px rail,
  64px page margins, and case padding is tight at 1440px; at 125% it will
  require horizontal scrolling and hide the bank nodes initially.
- It prominently labels each source account “BVN ON WATCHLIST”, while the
  export focuses on the watchlist/blocked transfer status; this is extra visual
  noise at the most important moment.

### Case Bisi (85 Contain)

- The same generic score strip replaces the export's chart/timeline, so the
  escalation 35 → 55 → 70 → 85 is less legible.
- The activity card uses long single-line records; “Bulk export of 5,000
  customer rows, no approved ticket” and the 48-view line risk clipping in the
  left case column because `.between` rows do not wrap.
- The employee prompt is functionally present, but rendered as a disabled,
  non-interactive imitation inside the case sidebar rather than the exported
  component styling/state. It does not demonstrate an employee entering a
  reason live.

### Leak tracer

- The implementation presents a matrix table, not the stronger visual
  relationship/graph treatment in the export; it lacks per-view timestamps and
  ticket evidence in the matrix.
- The right finding card is conditionally absent before S4 because `focus` is
  null, so the pre-step route has a large empty second column instead of a
  designed empty state.
- Five viewer columns plus a customer column are min-width-sensitive. At 125%
  the table is likely to overflow its 62% case grid or compress pseudonyms;
  there is no horizontal-scroll wrapper on this table.

### Unmask dialog

- The modal is functionally sound (reason required and audit disclosure), but
  its “Reveal the name for CASE-…” wording, 480px fixed width, and simple input
  omit the export's more explicit privacy/identity framing and component
  polish.
- At 125% zoom its fixed width remains safe, but long role/pseudonym content
  can crowd the one-line muted header. It also does not provide a visible
  success/audit confirmation after reveal.

### General truncation risks

- The top bar has no responsive shrink/overflow rule. At 1440×900 and 125%,
  the wordmark, clock, scenario, badge, Reset and Next step require more than
  the usable width and will collide or force clipping.
- Most tables use `white-space: nowrap`; Console amounts/purpose labels and
  Case/Tracer evidence cannot wrap on a projector-sized viewport.
- The layout only documents stacking below 1024px in DESIGN.md; the app CSS has
  no responsive media query for `.grid-2`, `.grid-case`, top bar, metrics five
  columns, or staff three columns.

## 4. Demo risks

Risk score is likelihood × impact on a 1--5 scale.

| Rank | Risk | L | I | Score | Why / mitigation |
|---:|---|---:|---:|---:|---|
| 1 | First request triggers synchronous seed | 4 | 5 | 20 | `services/demo.db` calls `resetDemo`; if the template is missing it builds the entire database in the request. Run `npm run seed`/a reset before presenting and verify the template exists. |
| 2 | 125% projector layout clips top bar/graph/tables | 4 | 4 | 16 | No responsive CSS; graph is fixed 1100px and tables do not wrap. Rehearse at the real resolution and zoom. |
| 3 | Reset race / global database mutation | 3 | 5 | 15 | `resetDemo` closes/copies the singleton DB. A poll or second tab during reset can observe a closed/replaced DB; reset is global, not session-scoped. |
| 4 | Gate prevents accidental recovery | 3 | 4 | 12 | Correctly blocks Next step, but rejected holds/suspensions also release the gate and allow a path whose on-screen consequences are not rehearsed. There is no presenter recovery/rewind beyond reset. |
| 5 | Refresh leaves route/scenario context confusing | 3 | 3 | 9 | State persists in SQLite, so it will not lose the demo, but a refresh on a direct case/graph URL can show stale/current state or “case not opened” around reset. |
| 6 | “AI cached” claim cannot be demonstrated offline | 4 | 2 | 8 | It is actually Template mode. Offline works for the deterministic demo, but contradicts the runbook/export badge. |
| 7 | Windows/native module setup | 3 | 2 | 6 | `better-sqlite3`/esbuild require approved scripts/rebuild on npm 11; the first sandboxed test failed with Windows `EPERM` spawning esbuild. Use the prepared Node install on the demo laptop. |
| 8 | Time moves backwards at S2.0 | 2 | 3 | 6 | S2.0 uses 21:10 after S1.1's 21:10 and asks the viewer to read Monday history; current score remains Friday START (0), which can confuse the narration. |

## 5. Q&A gaps

| Likely bank-judge question | Current gap | Natural home |
|---|---|---|
| “What releases the CBN watchlist if this is a false positive?” | No release/case-close experience or data update. | `src/server/sim/player.ts`, intervention/case routes, `read.ts`, Case UI |
| “Show why this satisfies the 24-hour obligation and who contacts each customer.” | Six automatic tasks exist, but no task owner/status/contact workflow or evidence view. | `player.ts`, `read.ts`, `src/app/cases/[id]/page.tsx` |
| “Can an AI/service account be stopped before it posts?” | v1.1 S5 is absent. | `generator.ts`, `pipeline.ts`, `player.ts`, `scenarios.ts`, case UI |
| “Why is Kemi common to all victims, not merely a high-volume viewer?” | Matrix lacks timestamps, ticket IDs, 72-hour windows, and cluster rule evidence. | dedicated `engines/leaks.ts`, `read.ts`, `src/app/tracer/page.tsx` |
| “Can I see a real decision/audit trail and who approved it?” | Metrics has a terse log; no audit detail/reason drill-down in the main case flow. | `read.auditView`, Metrics/Case UI |
| “How do you handle a valid employee reason or appeal?” | Only scripted invalid ticket is demonstrated; no user-entered valid path/re-score/case closure. | `player.answerTicket`, action route, case UI |
| “How does this integrate with our SIEM/case-management system?” | No outbound integration, export, or documented API payload demonstration. | integration adapter under `src/server/`, README |
| “What is the measured false-positive evidence right now?” | UI reads a persisted run but the demo/rehearsal does not guarantee one has been generated. | `sim/falseAlarms.ts`, `scripts/false-alarms.ts`, Metrics UI |

## 6. Recommended fixes

1. Make the score/time visual match the case exports: replace `ScoreSteps` with
   a genuine plotted step line and shaded level bands; make signals/evidence a
   linked table. Files: `src/components/index.tsx`,
   `src/app/cases/[id]/page.tsx`, `src/app/globals.css`. Effort: M. Touches
   `src/server/`: no.
2. Repair the 1440×900/125% layout: responsive top bar, rails/grids/tables,
   and an adaptive graph canvas. Files: `src/app/globals.css`,
   `src/components/index.tsx`, `src/app/cases/[id]/graph.tsx`,
   `src/app/tracer/page.tsx`, `src/app/metrics/page.tsx`. Effort: M. Touches
   `src/server/`: no.
3. Show the required risk bar and designed cleared state on Console. Files:
   `src/app/page.tsx`, `src/app/globals.css`. Effort: S. Touches
   `src/server/`: no.
4. Wire the promised cached note presentation, or consistently call it
   Template in the runbook/design-facing UI. Files: `src/server/casenotes/*`,
   `src/server/services/read.ts`, `src/components/index.tsx`, Case UI. Effort:
   M/L depending on real LLM cache. Touches `src/server/`: yes.
5. Implement watchlist release/false-case closure, visible contact-task status,
   and tests. Files: `src/server/sim/player.ts`, relevant API routes,
   `src/server/services/read.ts`, Case UI, `tests/scenarios.test.ts`. Effort:
   M. Touches `src/server/`: yes.
6. Extract/enforce the leak-tracer contract (seven-day cluster, distinct
   customers, 72-hour evidence) into `src/server/engines/leaks.ts`; render
   timestamps/tickets in Tracer; add direct assertions. Files:
   `src/server/engines/leaks.ts`, `pipeline.ts`, `player.ts`, `read.ts`,
   `src/app/tracer/page.tsx`, `tests/scenarios.test.ts`. Effort: M. Touches
   `src/server/`: yes.
7. Correct S2.0's displayed score to the historical Monday score rather than
   Friday START score. Files: `src/server/services/read.ts`,
   `src/app/staff/[id]/page.tsx`, `tests/scenarios.test.ts`. Effort: S.
   Touches `src/server/`: yes.
8. If the agent pitch line remains in scope, implement optional S5 end-to-end.
   Files: `generator.ts`, `pipeline.ts`, `player.ts`, `scenarios.ts`, database
   reads/routes/UI, and tests. Effort: L. Touches `src/server/`: yes.

## Verification outputs

Initial `npm test` inside the restricted process sandbox could not start
esbuild (`spawn EPERM`). It was rerun with approved normal process access and
returned exit code 0. The captured output ended before Vitest's usual final
summary, so the record below is literal rather than an assertion that every
listed suite visibly reported.

### `npm test`

```text
> test
> vitest run

 RUN  v3.0.5 C:/Users/HomePC/Downloads/sentry-demo

 ✓ tests/time.test.ts (1 test) 53ms
 ✓ tests/db.test.ts (2 tests) 16ms
 ✓ tests/fixtures-parse.test.ts (1 test) 6ms
 ✓ tests/privacy.test.ts (4 tests) 11ms
 ✓ tests/schemas.test.ts (1 test) 24ms
 ✓ tests/rng.test.ts (1 test) 9ms
 ✓ tests/health.test.ts (1 test) 10ms
```

### `npm run lint`

```text
> lint
> eslint .
```

### `npm run typecheck`

```text
> typecheck
> tsc --noEmit
```

### `npm run rehearse`

```text
> rehearse
> tsx --conditions=react-server scripts/rehearse.ts
```

Both lint and typecheck exited 0. Rehearse also exited 0, but, unlike its
source (`scripts/rehearse.ts`) indicates, produced no per-step score lines in
this environment; treat that as a rehearsal-output issue to resolve before
stage use, not as proof of a full rehearsal.

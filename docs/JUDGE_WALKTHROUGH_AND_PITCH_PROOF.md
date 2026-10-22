# Judge walkthrough and pitch proof

This is a proposed 3–4 minute draft. Confirm the actual pitch/demo allocation with the organisers before rehearsal. Every screen uses synthetic data and every “hold”, watchlist entry, transfer block and suspension is a local simulator effect.

## The honest narrative

Staff at branches interviewed by the team said successful insider incidents were not common in their experience and existing preventive controls appeared strong. That is not evidence that Zenith lacks basic controls. The product hypothesis is narrower: when a sensitive action is unusual or disputed, investigators benefit from seeing whether its business purpose is supported by canonical evidence, alongside behaviour and identity context, with proportionate and independently authorised next steps.

SENTRY’s line is: **“Permission tells you who may act. SENTRY asks why.”** The current prototype demonstrates that investigation/context workflow locally. Whether it solves a material central SOC/Internal Control problem still needs validation in a read-only bank pilot.

## Before judges arrive

1. Use a fresh synthetic directory. Set `DB_PATH`, `AUTH_DB_PATH`, `DEMO_WORKSPACE_ROOT`, exact `APP_ORIGIN`, `AUTH_ALLOW_INSECURE_LOOPBACK=1`, `SENTRY_DEMO_MODE=1`, and an isolated `SENTRY_NEXT_DIST_DIR`.
2. Run `npm run demo:prepare` before starting the server. This moves deterministic template generation out of the first visitor’s click.
3. Start the server and open `/login`. Keep one browser visitor; **Switch account** preserves that visitor’s scenario while rotating its session.
4. Do not say the presenter/reviewer switch proves separation between two real humans. The server enforces capabilities and canonical staff independence, but the on-stage personas are operated by one presenter.

## 3–4 minute script

### 0:00–0:30 — frame the problem

**Screen:** `/login`, persona picker.

**Say:** “Banks already control who has permission. The harder investigation question is whether a sensitive action has a verifiable business reason. SENTRY combines purpose evidence with identity and behaviour context, then asks an independent reviewer to approve any consequential local control. This demo is synthetic; it is not connected to Zenith or CBN.”

Select **Presenter** → **Enter demo**.

### 0:30–1:05 — legitimate unusual work is cleared

**Screen:** Console `/`.

Click **Next step** once for S1.1.

**Point to:** Ngozi’s burst of 60 reversals, approved overtime, matched purpose and the “Cleared automatically” message.

**Say:** “High volume and late work are not proof of wrongdoing. Here the overtime and every reversal’s purpose match, so the behavioural anomaly is waived and no case is opened.”

### 1:05–2:00 — a genuine ticket does not authorise a wrong destination

Advance S2.0 and S2.1 until the scenario asks for the operator’s explanation. Use **Switch account** → **Operator** → **Enter demo**.

**Screen:** `/my-actions`.

For action `ACT-S2-1`, enter genuine synthetic reference **TKT-2291** and submit.

**Point to:** “Ticket verified. Destination mismatch remains. Review still required.” The ticket refers to failed debit `TXN-58213`; it does not authorise the substituted credit account.

**Say:** “The ticket is genuine, but it proves only what it actually covers. Canonical destination check R4 remains failed and the critical signal stays active. SENTRY does not let supportive evidence erase an independent contradiction.”

Switch to **Presenter**, advance the next steps to the pending Hold stage, then switch to **Independent Reviewer**.

### 2:00–2:55 — review is bound to current evidence

**Screen:** `/cases/CASE-0001` overview and evidence.

**Point to:** numeric score/level, the separate `REVIEW_REQUIRED` policy reasons, score snapshot time and evidence-evaluation time, R4, and the decision card’s review reference/material evidence.

**Say:** “The score is a severity/ranking signal. Review can also be required by a confirmed critical contradiction without fabricating a higher score. The reviewer acts on a persisted evidence and target fingerprint. If material facts change, the old approval returns a stale-review conflict; it is not silently upgraded.”

Approve the eligible simulated hold.

**Say:** “This records an independently authorised simulator decision. It is not a bank hold acknowledgement.”

### 2:55–3:30 — show the local outcome and audit/privacy boundary

Switch to **Presenter**, advance S2.4, then show the money graph tab. If time permits, switch to **Auditor** and open Metrics/audit.

**Point to:** six synthetic watchlist entries, 31 subsequent synthetic transfers blocked, the explicit simulated wording, pseudonymised identity and audit rows.

**Say:** “The local scenario demonstrates one-time effects and evidence-linked history. A real pilot would need bank-owned execution acknowledgement, source health/provenance and protected audit storage. We do not claim money saved or a prevented real transaction.”

### 3:30–3:50 — close with evidence, not hype

**Say:** “In the fresh Pass 5 synthetic cohort, 32 episodes warranted review and 28 were legitimate. Revised full SENTRY produced TP 32, FN 0, FP 0, TN 28. A transparent purpose-or-identity union produced exactly the same counts, so this corpus did not establish incremental detection advantage over the simple union. What the prototype adds visibly is evidence-linked triage, reason codes, freshness, privacy boundaries and review authority. The next honest step is a read-only pilot measuring reviewer decisions and workload.”

## 90-second fallback

1. Start on a prepared CASE-0001 evidence view after the genuine ticket has been submitted.
2. In 20 seconds: state the hypothesis and synthetic-only boundary.
3. In 25 seconds: show TKT-2291 verified while R4 wrong destination remains; point to score versus separate review reason.
4. In 25 seconds: show the current evidence-bound decision card and explain stale reference + independent reviewer enforcement; approve only if the current fixture is ready.
5. In 20 seconds: show the money graph’s simulated hold/blocks, then disclose the Pass 5 union tie and propose a read-only pilot.

Do not try to compress account switching, scenario advancement and both approval gates into 90 seconds. Prepare the state in an isolated rehearsal workspace instead of modifying detection values.

## Pitch claims ledger

| Statement | Support | Required qualification |
|---|---|---|
| A genuine ticket does not clear a wrong refund destination | Browser/service path and regressions | Synthetic canonical records; not a bank integration |
| Legitimate approved overtime can clear unusual activity | S1 scenario and tests | One deterministic scenario, not a production false-positive estimate |
| Decisions are capability-, independence-, run- and evidence-bound | Route/service tests and browser path | Local identities and one process; not enterprise IAM/distributed proof |
| Revised Full SENTRY had TP32/FN0/FP0/TN28 on the fresh 60-episode Pass 5 cohort | Frozen synthetic evaluation | Constructed class mix; no bank accuracy or confidence claim |
| Full SENTRY beat the simple union | **Not supported** | It tied the union exactly on that cohort |
| SENTRY reduces human investigation time | **Not measured** | Requires a controlled reviewer study |
| SENTRY prevented loss or stopped bank transfers | **Not supported** | Effects are local synthetic rows only |
| The current product uses AI/ML detection or LLM case notes | **Not supported** | Detection and notes are deterministic; the LLM file is a stub |
| Zenith has a proven unmet insider-control gap | **Not established** | Validate centrally with SOC/Internal Control |
| Production false-positive/recall rates | **Not measured** | Requires representative governed bank data and labels |

## Likely judge Q&A

1. **Why is this needed if Zenith’s preventive controls work?**  
   The prototype does not assert that they do not work. It tests whether investigators gain value from purpose-linked evidence, explanations and bounded decisions after a sensitive event. A central-control discovery exercise must validate the need.

2. **Why not just use simple rules or the A-or-B union?**  
   In the 60-episode Pass 5 synthetic cohort, the union tied full SENTRY on detection counts. We should keep the simple union as a serious comparator. The current product’s unproven added value is triage quality: evidence links, reason codes, masking, freshness and authorised decisions. A reviewer study should measure that.

3. **Where does the evidence come from?**  
   Today it comes from a deterministic local SQLite generator: transactions, tickets, assignments, roster/overtime, sessions and actions. A pilot needs bank-owned read-only contracts and source provenance/health.

4. **What happens when a source is down?**  
   Source-unavailable semantics are not implemented. A missing row in this healthy-complete simulator is not an outage. The correct pilot design needs explicit verified/contradicted/missing/unknown states before relying on hard-missing conclusions.

5. **Is this AI?**  
   Not currently. Purpose checks, signals, scores, review policy and case-note text are deterministic. There is an Ollama configuration name and an unimplemented LLM stub, but no active model invocation. AI is a separate roadmap decision, not evidence of current value.

6. **Who can freeze an account or reveal a name?**  
   In the demo, fixed server-side capabilities and canonical staff independence gate decisions; reveal is reasoned and session/run/case scoped. Effects remain simulated. Real authority, legal basis and approval policy belong to the bank.

7. **How do you protect privacy?**  
   Investigation reads are pseudonymised by default; names are projected only after a scoped grant. Account numbers are masked and structured audit detail is redacted. The local audit is mutable application data, not immutable evidence.

8. **How would you deploy or pilot it?**  
   Start with a read-only, single-team shadow pilot: no automated bank effect, explicit source health, bank SSO/roles and logged reviewer outcomes. Measure agreement, evidence completeness, time-to-decision and legitimate review burden against the current workflow. The local SQLite deployment is not the target multi-instance architecture.

## Ethical pilot measurement

Use historical or shadow-mode events with minimised/pseudonymised data and bank-approved retention. Predefine review-warranted policy labels with Internal Control, have blinded reviewers compare current tooling against SENTRY-assisted evidence, and measure disagreement, evidence retrieval completion, time distributions and escalations on legitimate activity. Do not enable automated holds during validation. Report source outages, unsupported cases and reviewer disagreement rather than forcing binary outcomes.

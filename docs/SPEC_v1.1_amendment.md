
---

# Upgrades v1.1 (amendment, Tue 20 Oct 2026)

This section extends the spec above. Where it changes an earlier value, it says so explicitly; everything not mentioned here is unchanged. It adds three things: the CBN 24-hour BVN watchlist on the funds hold, the leak tracer (S4), and AI agents as identities (S5, optional). The demo grows to about 4 minutes 20 seconds.

## A. Amendments to earlier sections

| Where | Was | Now | Why |
|---|---|---|---|
| Synthetic data › generator, new accounts | ACC-N1 to ACC-N6 opened 9 to 15 Oct 2026 | Opened **10 to 15 Oct 2026**: N1 13 Oct, N2 11 Oct, N3 14 Oct, N4 10 Oct, N5 15 Oct, N6 12 Oct | An account opened 9 Oct is exactly 7 days old at 21:53 on 16 Oct and sits on the "under 7 days" boundary |
| Synthetic data › generator, new accounts | account numbers unspecified | ACC-N1 to ACC-N6 have account_no ending **3301 to 3306** | Matches the case view and money graph |
| Synthetic data › S2 failed debits | unspecified IDs | The ₦850,000 failed debit is **TXN-58213 at 21:31**, from an account whose account_no ends **4512** | Matches the R4 purpose-check line |
| Outbound transfers in S2.4 | 31 distinct outside accounts | The 31 outside accounts belong to six fictional banks: **Bank A (5 accounts), Bank B (8), Bank C (6), Bank D (4), Bank E (5), Bank F (3)**. Attempted totals per bank: A ₦1,150,000, B ₦1,420,000, C ₦980,000, D ₦740,000, E ₦895,000, F ₦650,000 (sum ₦5,835,000) | Matches the money graph. Never use real bank names |
| Data model › staff.employment_type | EMPLOYEE, CONTRACTOR | EMPLOYEE, CONTRACTOR, **AGENT** | AI agents, bots and service accounts are identities |
| Data model › staff.role | six roles | add **AI_AGENT** | Section D |
| Data model › tickets.type | COMPLAINT, SERVICE_REQUEST, OVERTIME, EXPORT, CHANGE | add **SCAM_REPORT** | Section C |
| Data model › interventions.type | REQUEST_REASON, SECOND_APPROVER, HOLD_FUNDS, RESTRICT_DATA_ACCESS, SUSPEND_SESSION | add **CONTACT_BVN_OWNER** | Section B |

## B. Hold through the CBN 24-hour BVN watchlist

Since 1 May 2026 banks must keep a temporary watchlist, for up to 24 hours, of BVNs implicated in suspected fraud, and contact the BVN owner in that window. SENTRY's funds hold uses this mechanism as its legal basis.

New table **bvn_watchlist**: id (`BWL-…`), bvn_hash, account_id, case_id, intervention_id, added_at, expires_at, status (`ACTIVE`, `RELEASED`, `EXPIRED`), released_by?, released_at?.

Rule: when an analyst **approves** a `HOLD_FUNDS` intervention:
1. For every held account, add its owner's bvn_hash to bvn_watchlist with expires_at = added_at + 24 hours (one row per distinct BVN).
2. Create one `CONTACT_BVN_OWNER` intervention per watchlisted BVN, status `ACTIVE`, automatic true, target {bvn_hash, account_id}.
3. Write an audit_log row.

When a hold is released or the case is closed as false, set the case's watchlist rows to `RELEASED`.

Expected at S2.3 after Approve: **6 BVNs on the watchlist, 6 CONTACT_BVN_OWNER tasks, watchlist until Sat 17 Oct 2026 21:53** (the hold is approved at 21:54, but the watchlist runs 24 hours from the hold's creation at 21:53; use the HOLD_FUNDS created_at).

Metrics payload: add `bvns_watchlisted` (count of ACTIVE rows).

## C. Leak tracer (S4)

Purpose checks can't catch a corrupt employee who only opens records attached to real tickets. The leak tracer starts from the victims instead: when several customers report scam calls from the same number, it finds the staff member who viewed all of their records.

New table **scam_reports**: id (`SCR-…`), customer_id, caller_number, reported_at, channel (`BRANCH`, `CONTACT_CENTRE`, `APP`), summary, ticket_id? (the SCAM_REPORT ticket raised for it).

New engine **src/server/engines/leaks.ts** and signal:

| Code | Engine | Tier 1 | Label on screen |
|---|---|---|---|
| LEAK_COMMON_VIEWER | Leaks | 35 | Viewed the records of every customer in a scam cluster |

Rule:
1. A **cluster** is 3 or more scam_reports from distinct customers sharing the same caller_number, reported within 7 days of each other.
2. For each customer in the cluster, take the RECORD_VIEW actions on that customer in the **72 hours before their report**.
3. A **common viewer** is a staff member who viewed every customer in the cluster. Each common viewer gets LEAK_COMMON_VIEWER (35), with evidence = the cluster's report IDs and the matching view action IDs.
4. The tracer runs when the scenario player triggers it (S4.1), not on every event. Purpose results of the views are unchanged (they were MATCHED); the leak signal stands on its own.

Tracer API: `GET /api/tracer/{caller_number}` returns
```json
{
  "caller_number": "0700-000-0555",
  "reports": [{"report_id": "SCR-0001", "customer_id": "CUS-…", "account_masked": "••••2210", "city": "Aba", "reported_at": "2026-10-14T09:12:00+01:00"}],
  "viewers": [{"staff_id": "STF-0389", "pseudo_id": "Staff-B4E0", "viewed_customer_ids": ["…"], "is_common": true}],
  "common_viewer_ids": ["STF-0389"],
  "case_id": "CASE-0003"
}
```
Viewers list every staff member who viewed at least one victim in the window, common viewers first.

### Characters and data (generator)

Kemi, **STF-0389**, CUSTOMER_SERVICE, CONTRACTOR, pseudonym override **Staff-B4E0**, normal roster, usual terminal TRM-0389.

Four other customer-service staff, pseudonym overrides for the deck: **STF-0390 → Staff-1C07, STF-0391 → Staff-6D3F, STF-0392 → Staff-A912, STF-0393 → Staff-E58B**.

Five victim customers, each with one account, an open COMPLAINT ticket assigned to customer service created before the views, and a scam report from caller **0700-000-0555**:

| Victim | Account ends | City | Reported | Kemi viewed | Other viewer |
|---|---|---|---|---|---|
| V1 | 2210 | Aba | Wed 14 Oct 09:12 | Mon 12 Oct 10:05 | STF-0390 (Mon 12 Oct 14:20) |
| V2 | 7781 | Kano | Wed 14 Oct 13:40 | Mon 12 Oct 11:30 | STF-0391 (Tue 13 Oct 09:45) |
| V3 | 0954 | Ibadan | Thu 15 Oct 11:05 | Tue 13 Oct 15:10 | STF-0392 (Wed 14 Oct 10:30) |
| V4 | 4419 | Lagos | Thu 15 Oct 18:22 | Wed 14 Oct 09:40 | STF-0393 (Wed 14 Oct 16:05) |
| V5 | 6632 | Enugu | Fri 16 Oct 08:45 | Wed 14 Oct 13:15 | none |

Every one of these views is MATCHED (each has a real open ticket). No other staff member views any victim between 9 and 16 Oct. Scam reports are baseline rows (they happened before the live demo); is_malicious is true on Kemi's five views only.

### Scenario step

| Step | Sim time (Fri 16 Oct) | What the player does | Expected |
|---|---|---|---|
| S4.1 | 22:15 | Runs the tracer on caller 0700-000-0555 | LEAK_COMMON_VIEWER 35 for STF-0389 → **35, Verify**; **CASE-0003** opened; REQUEST_REASON active. Other four viewers get no signal |

Console focus: the /tracer page for 0700-000-0555.

## D. AI agents as identities (S5, optional)

Bots, service accounts and AI agents are identities with the same purpose checks. The difference: an agent's sensitive action is checked **before it posts**, because an agent can be asked to act thousands of times a minute.

Staff rows with employment_type AGENT carry a new nullable column **staff.declared_scope** (JSON: {allowed_action_types: string[], owner_team: string}). Human staff have null.

New signal:

| Code | Engine | Tier 1 | Label on screen |
|---|---|---|---|
| AGENT_OUT_OF_SCOPE | Identity | 15 | Outside the agent's declared scope |

Rule: for an AGENT identity, every sensitive action runs through the pipeline **with status PENDING_SECOND_APPROVAL before posting**. If any purpose check fails or the action type is not in declared_scope.allowed_action_types, it stays PENDING_SECOND_APPROVAL and a `SECOND_APPROVER` intervention is created with status PENDING_APPROVAL, target {action_id}. Approve posts the action; Reject sets it BLOCKED. If everything passes, it posts immediately.

Character: **STF-0901**, "Customer assistant agent", role AI_AGENT, employment_type AGENT, declared_scope {allowed_action_types: [], owner_team: "Digital Channels"} (it may answer balance questions, block cards and log complaints, none of which are sensitive actions). No unmask: agents have no personal name.

| Step | Sim time | What the player inserts | Expected |
|---|---|---|---|
| S5.1 | 22:20 | The agent requests a REVERSAL of ₦250,000 to an account ending 8812, with no original transaction | REVERSAL_NO_MATCH 25 + AGENT_OUT_OF_SCOPE 15 → **40, Verify**; **CASE-0004**; action PENDING_SECOND_APPROVAL; SECOND_APPROVER pending |
| (gate) | | Player waits for the analyst's decision on the held refund | |

## E. Expected values added to test_scenarios

| Step | Assert |
|---|---|
| S2.3 after Approve | 6 bvn_watchlist rows ACTIVE, expires_at 2026-10-17T21:53:00+01:00; 6 CONTACT_BVN_OWNER interventions |
| S2.4 | 31 outbound transfers BLOCKED_BY_HOLD across Bank A–F with the per-bank counts and totals in section A |
| S4.1 | STF-0389 score 35, level VERIFY, CASE-0003 open; STF-0390 to 0393 have no LEAK_COMMON_VIEWER |
| S5.1 (if built) | STF-0901 score 40, level VERIFY, CASE-0004; the reversal is PENDING_SECOND_APPROVAL |
| End of demo | cases_opened 3 (4 with S5); transfers_blocked 31; funds_held_naira 5,835,000; bvns_watchlisted 6 |

## F. Milestones

- **M14** Leak tracer: table, generator rows, leaks.ts, S4.1, /api/tracer, /tracer page.
- **M15** (optional) AI agent: column, signal, pre-posting hold, S5.1, agent case view.
- The watchlist (section B) belongs to **M7** with the funds hold.

## G. Pitch lines (no code)

- "Unusual isn't the question. Reason is."
- "Pseudonymised by default, with role-based access and audit, the same approach Microsoft Purview uses."
- "SENTRY is the banking-aware layer the tools Zenith already owns are missing, and it sends its cases into them."
- "Agents are checked before they act; people are checked as they act."

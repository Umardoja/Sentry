SENTRY: Build Spec for Codex
How to use this spec
This document is the single source of truth for the SENTRY prototype: give it to ChatGPT and Codex, and build it one milestone at a time.
Workflow:
1.	Create the repo with the layout under Architecture. Export this doc to Markdown and save it as docs/SPEC.md . Paste the AGENTS.md block (Tech stack section) into the repo root; Codex reads it on every task.
2.	In ChatGPT, paste the spec once, then ask for the Codex prompt for one milestone at a time, using the template in Build milestones.
3.	Give Codex one milestone per task. Each milestone names the spec sections it needs, its acceptance tests, and what it must not touch.
4.	Merge only when that milestone's tests pass. Run make test after every merge.
5.	If the spec is wrong, fix the spec first, then the code. The numbers under Scoring are the contract between the deck, the demo and the code.
Three rules that never bend:
 	Deterministic demo. Fixed random seed, a step-based scenario player, no wall clock in the demo path. The same click gives the same screen every time.
 	The LLM only writes words. It never scores, decides or moves money. If it fails or is slow, the template case note is used.
 	One unbroken path first. The full demo path works end to end, however rough, before anything is polished.
Terms used throughout:
Term	Meaning
Sensitive action	A staff action SENTRY checks: reversal, manual posting, record view, limit change, bulk export, privileged access
Term	Meaning
Purpose check	A deterministic test that the action has a valid business reason
Signal	A named finding with points, such as
REVERSAL_WRONG_BENEFICIARY

Risk score	0 to 100 per staff member, the sum of their active signals
Level	Normal, Watch, Verify, Hold or Contain, set by the score
Intervention	What SENTRY does at a level: ask for a reason, require a second approver, hold funds, suspend a session
Case	Opened when a staff member reaches Verify (score 30 or more); holds signals, interventions and the case note
Scenario	A scripted sequence of steps injected on top of normal synthetic activity
What we are building
A web console for Zenith's SOC and Internal Control analysts that replays 30 days of simulated activity for about 500 staff, checks every sensitive action for a reason, scores risk, and plays three scripted scenarios live on stage.
Users in the prototype:
 	Analyst (SOC or Internal Control): the only person using the console. Approves holds and suspensions, unmasks names on open cases.
 	Employee: never logs in. Appears only through the "What the employee sees" card when SENTRY asks for a reason.
 	Presenter: drives the scenario player (Reset, choose scenario, Next step).
Simulated calendar: 30 days from Thu 17 Sep 2026 to Fri 16 Oct 2026. Tunde's normal day is Mon 12 Oct 2026; every live scenario runs on Fri 16 Oct 2026.
The three scenarios (exact steps and scores are under Synthetic data and Scoring):
ID	Staff	What happens	Expected outcome
S1 · Cleared	Ngozi, Operations, reversals desk	60 reversals from 20:30 to
21:10, past her shift, all
matched, with approved overtime	Raw score 17 drops to 6 after clearing. Normal. No case
S2 ·
Diversion	Tunde, Operations, e-products	Monday baseline 40 matched reversals (score 6). Friday 21:47 a reversal of a real failed debit credited to someone else, then five more, then the beneficiaries try to fan out	38 → 48 → 74 → 91. Funds held, 31 outbound transfers blocked, session suspended on analyst approval
S3 · Stolen login	Bisi, contractor, customer service	On approved leave, her login appears on a new terminal, views customer records with no case, then tries a bulk export	35 → 55 → 70 → 85. Data access restricted, export blocked, session suspended on analyst approval
S3 uses a contractor on purpose: the track's challenge names third-party users and compromised credentials. Its numbers replace the "214 records" line in the blueprint's demo script.
Definition of done: one unbroken path, every time: Reset → S1 cleared with no case → S2 Monday at 6 → S2 Friday 38, 48, 74 with the hold approved, fan-out blocked, 91 with suspension approved → case note shown → S3 35, 55, 70, 85 with suspension approved → counters updated.
In scope: synthetic data generator, scenario player, purpose, behaviour, identity and money-graph engines, scoring, ladder, interventions, case notes, analyst console, metrics, false-alarm test.
Out of scope: real Zenith integrations, logins and user accounts, endpoint or email monitoring, real-time streaming infrastructure, training large models, mobile layout.
Architecture
One Python backend runs every event through a fixed pipeline of engines and streams the results to a Next.js console; everything runs on one laptop with SQLite.
 
SENTRY prototype architecture · one pipeline, one store, one stream
Baseline rows and scenario steps enter the same pipeline; its results go to SQLite and the event stream, and the LLM only rewords case notes.
Components:
Generator writes 30 days of normal activity into SQLite from a fixed seed.
Scenario player applies one scripted step at a time when the presenter clicks Next step.
 	Pipeline runs, in this order, for every new action, login or outbound transfer: purpose, behaviour, identity, money, scoring, ladder, interventions, case note.
 	Event bus is in-process publish and subscribe; the API streams it to the browser as Server-Sent Events.
 	Case-note service builds a facts JSON, writes a template note instantly, then tries the local LLM and swaps in its note only if it passes validation.
 	Console reads REST endpoints for state and listens to the event stream for live updates.
Repo layout:
sentry/ ├── AGENTS.md
├── Makefile                 # make seed, make dev, make test, make demoreset ├── README.md
├── docs/SPEC.md             # this document
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py          # FastAPI app, CORS, routers
│   │   ├── config.py        # DB path, seed, LLM mode (off | cache | live)
│   │   ├── db.py            # SQLModel engine and session
│   │   ├── models.py        # every table in Data model
│   │   ├── schemas.py       # API response models
│   │   ├── events.py        # event bus and SSE helper
│   │   ├── privacy.py       # pseudonyms and unmasking
│   │   ├── api/             # sim, actions, staff, cases, interventions, graph, metrics, audit, stream │   │   ├── engines/
│   │   │   ├── purpose.py
│   │   │   ├── behaviour.py
│   │   │   ├── identity.py
│   │   │   ├── money.py
│   │   │   ├── signals.py   # signal catalogue: codes, tiers, points
│   │   │   ├── scoring.py
│   │   │   ├── ladder.py    # levels and interventions
│   │   │   └── pipeline.py  # runs the engines in order for one event
│   │   ├── casenotes/
│   │   │   ├── facts.py
│   │   │   ├── template.py
│   │   │   ├── llm.py       # Ollama client and validator
│   │   │   └── cache/       # pre-generated notes per scenario
│   │   └── sim/
│   │       ├── generator.py
│   │       ├── scenarios.py # S1, S2, S3 step definitions
│   │       └── player.py
│   └── tests/
│       ├── test_purpose.py
│       ├── test_scoring.py
│       ├── test_scenarios.py   # asserts every expected score
│       └── test_false_alarms.py
 
Tech stack and conventions
Use boring, well-known tools that Codex writes well, pinned in lockfiles on Day 1.
Layer	Choice
Backend	Python 3.11, FastAPI, Uvicorn, SQLModel on SQLite, Pydantic v2
Data and models	numpy, pandas (generator only), networkx, scikitlearn (optional Isolation Forest)
Live updates	Server-Sent Events via sse-starlette

LLM	Ollama running an open-weight instruct model locally (for example qwen2.5:7b-instruct ); LLM_MODE = off , cache or live
Frontend	Node 20, Next.js App Router, TypeScript strict,
Tailwind CSS, shadcn/ui, Recharts, Cytoscape.js via react-cytoscapejs , lucide-react
Tests	pytest; npm run lint and npm run build for the frontend
Conventions:
Money: integer naira. No floats for amounts.
Time: ISO 8601 strings with the Lagos offset, such as 2026-10-16T21:47:00+01:00 . Engines take time from the event, never from the system clock.
IDs: prefixed strings: STF-0001 , ACC-000123 , TXN-… , ACT-… , TKT-… , CASE-… , INT-… , SIG-… .
 	Pseudonyms: Staff- plus the first 4 hex characters of sha256(staff_id + salt) , uppercased.
Randomness: one seed in config.py , default 2026 , feeding random.Random and numpy.random.default_rng .
Single homes for numbers: signal codes, tiers and points live only in signals.py ; scenario steps only in scenarios.py .
Makefile targets: make setup (install both sides), make seed (generate the 30 days), make dev (backend on 8000, frontend on 3000), make test , make demo-reset (reseed
and clear scenario state), make notes-cache (pre-generate case notes).
AGENTS.md (paste into the repo root as is):
# AGENTS.md: SENTRY
Hackathon prototype: insider-threat detection for a bank. Source of truth: docs/SPEC.md.
## Rules - Read the spec sections named in the task before writing code.
-	Deterministic: use the seeded RNG from backend/app/config.py. Never call datetime.now() in engines, scoring or scenarios; time comes from event timestamps.
-	Signal codes, tiers and points live only in backend/app/engines/signals.py. 
Scenario steps live only in backend/app/sim/scenarios.py.
-	The LLM only writes case-note text. It never sets scores, levels or interventions. - All data is synthetic. Never use real bank names or real people.
-	Change only the files the task names. No unrelated refactors.
## Commands
-	make setup | make seed | make dev | make test | make demo-reset
-	Backend tests: cd backend && pytest -q
-	Frontend checks: cd frontend && npm run lint && npm run build
## Done means - All tests pass, including backend/tests/test_scenarios.py.
-	New endpoints are listed in README.md.
-	No TODOs left on the demo path.
## Style
-	Python: type hints everywhere; engines are small pure functions (rows in, dataclasses out); format with ruff.
-	TypeScript: strict mode; types in frontend/src/lib/types.ts mirror backend schemas.py.
Data model
Twenty SQLite tables in models.py ; ? marks a nullable column, and enums are stored as uppercase strings.
Table	Columns	Notes
staff
id, name, pseudo_id, role, team, branch, employment_type, phone, usual_terminal_ids (JSON)	role: OPS_REVERSALS ,
OPS_EPRODUCTS ,
CUSTOMER_SERVICE , IT_ADMIN , BRANCH_OPS ,
INTERNAL_CONTROL .
employment_type: EMPLOYEE or
CONTRACTOR
roster
id, staff_id, date, shift_start, shift_end	One row per working day
leave
id, staff_id, start_date, end_date, status	status APPROVED

overtime
id, staff_id, date, start, end, approved_by_staff_id, ticket_ref	Approver must differ from staff_id
terminals
id, label, branch, location	
logins
id, staff_id, terminal_id, location, ts, session_id, status	status: ACTIVE , SUSPENDED ,
ENDED
customers
id, name, phone, bvn_hash, is_dormant	
accounts
id, customer_id, account_no, opened_at, phone, status	

Table	Columns	Notes
transactions
id, session_ref,
debit_account_id, amount, beneficiary_account_no, beneficiary_bank, ts, channel, status, response_code	status: SUCCESS or FAILED . Fictional bank names only
tickets
id, type, customer_id?, transaction_id?, assigned_team, created_by_staff_id, approved_by_staff_id?, created_at, status, scope?	type: COMPLAINT ,
SERVICE_REQUEST , OVERTIME ,
EXPORT , CHANGE
sensitive_actions
id, staff_id, session_id, terminal_id, ts, action_type, original_txn_id?, credit_account_id?, customer_id?, amount?, ticket_ref?, status, scenario_tag?, is_malicious	action_type: REVERSAL ,
MANUAL_POSTING , RECORD_VIEW ,
LIMIT_CHANGE , BULK_EXPORT ,
PRIV_ACCESS . status: POSTED ,
BLOCKED ,
PENDING_SECOND_APPROVAL .
is_malicious is ground truth for metrics only; engines must never read it
outbound_transfers
id, from_account_id, to_account_no, amount, ts, status, scenario_tag?	status: SENT or
BLOCKED_BY_HOLD

purpose_results
action_id, status, checks (JSON list of code, passed, detail), reason	status: MATCHED , PARTIAL ,
NO_MATCH , WRONG_BENEFICIARY ,
DUPLICATE , NO_CASE
signals
id, staff_id, code, tier, points, effective_points, ts, action_ids (JSON), evidence (JSON), waived, waive_reason?	effective_points is after waivers
risk_scores
id, staff_id, ts, score, level,
breakdown (JSON code to points)	One row per recalculation
cases
id, staff_id, opened_at, status, peak_score, level, unmasked	status: OPEN , CONTAINED ,
CLOSED_TRUE , CLOSED_FALSE

Table	Columns	Notes
interventions
id, case_id, staff_id, type, status, automatic, created_at, decided_by?, decided_at?, note?, target (JSON)	type: REQUEST_REASON ,
SECOND_APPROVER , HOLD_FUNDS , RESTRICT_DATA_ACCESS , SUSPEND_SESSION . status:
ACTIVE , PENDING_APPROVAL ,
APPROVED , REJECTED , RELEASED
case_notes
id, case_id, version, source, sentences (JSON list of text, evidence), recommendation, created_at	source: TEMPLATE , LLM , CACHE

audit_log
id, ts, actor, action,
target_type, target_id, detail
(JSON)	Every approval, rejection, unmask and reset
sim_state
key, value	Current scenario, step index, simulated clock
Synthetic data and scenarios
The generator builds a believable, mostly clean bank from seed 2026; the scenario player then injects S1, S2 and S3 as numbered steps, all on the evening of Fri 16 Oct 2026, so the clock only moves forward.
Baseline generator ( sim/generator.py ):
Item	Rule
Staff	500: CUSTOMER_SERVICE 220, BRANCH_OPS 160,
OPS_REVERSALS 40, OPS_EPRODUCTS 30, IT_ADMIN 30, INTERNAL_CONTROL 20. 50 are CONTRACTOR (40 in customer service, 10 in IT)
Branches and terminals	10 fictional branches; 600 terminals; each staff member has 1 or 2 usual terminals
Rosters	Weekdays 08:00 to 17:00; 10% on a late shift 12:00 to 21:00; weekends off except a 5% skeleton crew
Item	Rule
Leave	About 3% of staff on approved leave on any day
Overtime	About 2% of staff-days have approved overtime of 2 hours, approved by someone else
Customers and accounts	5,000 customers, 5,500 accounts, opened over 10 years; 8% dormant; 30 normal accounts opened in the last 14 days
Transactions	2,000 successful customer debits a day, plus the failed debits that reversals need
Reversals	Each OPS_REVERSALS and OPS_EPRODUCTS staff member on shift posts n reversals a day, n drawn from Normal(25, 6), minimum 5. Each has its own failed debit earlier that day and is credited back to the debited account
Record views	Customer service staff view about 30 records a day; 97% match an open case assigned to their team
Bulk exports	Internal Control and IT run weekly exports, each with an approved EXPORT ticket
Noise (on purpose)	0.5% of logins from a new terminal; 1% of actions up to 30 minutes outside roster without overtime; 0.5% of reversals credited to another account of the same customer
After seeding, the generator runs every baseline action through the pipeline so history has scores, and computes peer statistics per role.
Scenario characters (fixed IDs):
Staff	ID	Role	Facts the generator must set
Ngozi	STF-
0042	OPS_REVERSALS , employee
Friday roster 08:00 to 17:00; overtime 17:00 to 21:30 approved by STF-0007 , ticket TKT-OT-1016 ; normal daytime reversals
Staff	ID	Role	Facts the generator must set
Tunde	STF-
0101	OPS_EPRODUCTS , employee
Roster 08:00 to 17:00 weekdays; usual terminal TRM-0101 ; exactly 40 matched reversals on Mon 12 Oct; 22 matched reversals on Fri 16 Oct daytime; no overtime
Bisi	STF-
0388	CUSTOMER_SERVICE , contractor	Approved leave 12 to 23 Oct 2026; usual terminal TRM-0388 ; TRM-0777 never used by her
The generator also creates six new accounts ACC-N1 to ACC-N6 , opened 9 to 15 Oct 2026, owned by unrelated synthetic customers, and the six failed debits Tunde will divert.
Scenario steps ( sim/scenarios.py ; expected values are asserted in tests):
Step	Sim time
(Fri 16 Oct)	What the player inserts	Expected score and level
S1.1	20:30 to
21:10	60 reversals by Ngozi, each matched and credited back, inside approved overtime	Raw 17, effective 6, Normal, no case
S2.0	Shows Mon 12 Oct	Nothing new; the console focuses Tunde's Monday from history	6, Normal
S2.1	21:47	1 reversal by Tunde of a real failed debit of ₦850,000, credited to ACC-N1	38, Verify; case opened;
REQUEST_REASON

S2.2	21:48	Tunde answers the reason prompt with ticket TKT-2291 , which does not exist	48, Verify
S2.3	21:53	One batch upload of 5 reversals of real failed debits
(₦1,200,000, ₦640,000,
₦975,000, ₦1,450,000,
₦720,000) credited to ACC-N2 to ACC-N6	74, Hold; SECOND_APPROVER active; HOLD_FUNDS on ₦5,835,000 pending approval
Step	Sim time
(Fri 16 Oct)	What the player inserts	Expected score and level
(gate)		Player will not advance until the analyst approves or rejects
HOLD_FUNDS

S2.4	21:58	ACC-N1 to ACC-N6 attempt 31 transfers to 31 distinct outside accounts within 3 minutes; all
BLOCKED_BY_HOLD
91, Contain; SUSPEND_SESSION pending approval
(gate)		Player waits for the analyst's decision on SUSPEND_SESSION ; case note generated	
S3.1	22:05	Bisi's login from TRM-0777 while on leave	35, Verify; case opened; REQUEST_REASON , no answer
S3.2	22:06	12 record views of customers with no case	55, Verify
S3.3	22:08	A batch of 48 more record views with no case (60 in total)	70, Hold; RESTRICT_DATA_ACCESS active
S3.4	22:10	Bulk export of 5,000 customer rows with no ticket; status
BLOCKED
85, Contain; SUSPEND_SESSION pending approval
A batch upload is scored once, after the whole batch, which matches how operations teams upload reversal files. Every scenario row sets scenario_tag and is_malicious (false for S1, true for S2 and S3).
Detection engines
Four engines, each a set of pure functions that take database rows and return signal hits
( code , tier , points , ts , action_ids , evidence ); none of them reads is_malicious or calls the LLM.
Purpose engine ( engines/purpose.py )
Every check returns {code, passed, detail} and is stored in purpose_results.checks .
Action	Checks, in order	Failing outcome
REVERSAL
R1 ORIGINAL_EXISTS : the original transaction exists
NO_MATCH

	R2 ORIGINAL_FAILED_OR_DISPUTED : it is FAILED , or a complaint ticket references it	NO_MATCH

	R3 AMOUNT_MATCHES : same amount
PARTIAL

	R4 CREDIT_TO_DEBITED_ACCOUNT : the credit goes to the account that was debited, or another account owned by the same customer	WRONG_BENEFICIARY

	R5 NOT_ALREADY_REVERSED : no earlier posted reversal of the same transaction	DUPLICATE

RECORD_VIEW
V1: an open complaint or service-request ticket for this customer, assigned to the viewer's team, created before the view	NO_CASE

BULK_EXPORT
E1: an approved EXPORT ticket, approved by someone else, created before, scope covers the export	NO_MATCH

LIMIT_CHANGE
L1: an approved service request for this customer, approved by someone else	NO_MATCH

MANUAL_POSTING
M1: an approved CHANGE instruction, approved by someone else	NO_MATCH

PRIV_ACCESS
P1: an open CHANGE ticket naming this staff member, and the time is inside its window	NO_MATCH

Status precedence when several checks fail: NO_MATCH , then WRONG_BENEFICIARY , then DUPLICATE , then PARTIAL . All pass means MATCHED .
Ticket validation (when an employee answers a Verify prompt): T1 the ticket exists; T2 it was created before the action; T3 it is assigned to the employee's team; T4 it names the same customer or transaction; T5 it was not created by the employee. Any failure fires TICKET_INVALID . All pass clears the related purpose signal for that action.
Behaviour engine ( engines/behaviour.py )
 	Peer statistics: for each role and action type, the mean and standard deviation of daily counts per staff member on weekdays, from the baseline only. Floor the standard deviation at 1.
VOLUME_ANOMALY : z = (today's count − peer mean) ÷ peer SD. Above 3 is tier 2; above 2 up to 3 is tier 1.
OUTSIDE_ROSTER : an action outside that day's shift and not covered by approved overtime. A day with no roster counts as outside. Not fired when ON_LEAVE fires.
 	Optional: an Isolation Forest over staff-day features, shown as an anomaly percentile on the staff page only. It never feeds the score.
Identity engine ( engines/identity.py )
ON_LEAVE : a login or action on a date covered by approved leave.
NEW_TERMINAL : a terminal not in the staff member's usual list and not used by them in the previous 30 days.
IMPOSSIBLE_LOCATION (defined, not in the demo): logins at two different branches within 30 minutes.
Money engine ( engines/money.py )
Build a networkx directed graph of staff → credited account (reversal credits), account → outside account (outbound transfers), and staff ↔ account links on a shared phone or BVN hash. The console's graph view uses the same graph.
NEW_BENEFICIARY_ACCOUNT : among this staff member's actions whose purpose status is not MATCHED , credited accounts under 7 days old. Tier 1 for one account, tier 2 for three or more. Matched refunds to new customers never fire it.
FAN_OUT : accounts credited by this staff member's unmatched actions attempt transfers to 10 or more distinct accounts within 60 minutes. Blocked attempts count.
SHARED_IDENTIFIER : a credited account shares a phone number or BVN hash with the
staff member.
Scoring and the intervention ladder
The score is a plain sum of signal points over the last 24 hours, capped at 100; these weights are hackathon defaults and every demo number below must come out exactly.
Signal catalogue ( engines/signals.py ):
Code	Engine	Tier 1	Tier 2
REVERSAL_NO_MATCH
Purpose	25 (1 action)	45 (3 or more)
REVERSAL_WRONG_BENEFICIARY
Purpose	20 (1 action)	40 (3 or more)
REVERSAL_DUPLICATE
Purpose	15	
AMOUNT_MISMATCH
Purpose	10	
RECORD_VIEW_NO_CASE
Purpose	20 (10 or more views)	35 (50 or more)
BULK_EXPORT_NO_TICKET
Purpose	15	
LIMIT_CHANGE_NO_REQUEST
Purpose	15	
POSTING_NO_APPROVAL
Purpose	20	
PRIV_ACCESS_NO_TICKET
Purpose	20	
TICKET_INVALID
Purpose	10	
VOLUME_ANOMALY
Behaviour	6 (z above 2)	12 (z above 3)
OUTSIDE_ROSTER
Behaviour	5	
ON_LEAVE
Identity	25	
NEW_TERMINAL
Identity	10	
IMPOSSIBLE_LOCATION
Identity	15	
NEW_BENEFICIARY_ACCOUNT
Money	13 (1 account)	19 (3 or more)
FAN_OUT
Money	17	
SHARED_IDENTIFIER
Money	15	
Formula: for each signal code, take the highest tier fired in the window, apply waivers, and add up.
\text{score}(s, t) = \min\Big(100,\ \sum_{c} \text{effective points of the highest tier of } c \text{ in } (t - 24\text{h},\ t]\Big)
Waivers:
W1: OUTSIDE_ROSTER is waived when approved overtime covers the action.
W2: VOLUME_ANOMALY is halved (rounded down) when approved overtime covers the actions and every action that day is MATCHED .
W3: a valid ticket (T1 to T5) clears the purpose signal of the action it answers.
W4: ON_LEAVE suppresses OUTSIDE_ROSTER .
Levels and interventions ( engines/ladder.py ):
Level	Score	On entering the level	Automatic?
Normal	0–14	Nothing	
Watch	15–29	Logged for the weekly sample	Yes
Verify	30–59	Open a case if none; REQUEST_REASON active; employee prompt card shown	Yes
Hold	60–79	SECOND_APPROVER active: further money actions become
PENDING_SECOND_APPROVAL . If money signals are present: HOLD_FUNDS on credits from unmatched actions, pending approval. If data signals are present: RESTRICT_DATA_ACCESS active, further views and exports
BLOCKED	Second approver and data restriction yes; the funds hold needs an analyst
Contain	80–
100	SUSPEND_SESSION pending approval; on approval the login becomes
SUSPENDED and the case CONTAINED
No, analyst approves
Levels only rise within an open case. Each intervention type is created once per case. Approved HOLD_FUNDS blocks every outbound transfer from the held accounts. Every approval and rejection is written to audit_log .
Expected values (asserted in test_scenarios.py ):
Step	Active signals and effective points	Score	Level
S1.1	Raw: VOLUME_ANOMALY 12 + OUTSIDE_ROSTER 5 = 17. After W1 and W2: 6 + 0	6	Normal
Step	Active signals and effective points	Score	Level
S2.0	VOLUME_ANOMALY 6 (40 reversals, z between 2 and 3)
6	Normal
S2.1	REVERSAL_WRONG_BENEFICIARY 20 +
NEW_BENEFICIARY_ACCOUNT 13 + OUTSIDE_ROSTER 5
38	Verify
S2.2	+ TICKET_INVALID 10
48	Verify
S2.3	REVERSAL_WRONG_BENEFICIARY 40 +
NEW_BENEFICIARY_ACCOUNT 19 + OUTSIDE_ROSTER
5 + TICKET_INVALID 10	74	Hold
S2.4	+ FAN_OUT 17
91	Contain
S3.1	ON_LEAVE 25 + NEW_TERMINAL 10
35	Verify
S3.2	+ RECORD_VIEW_NO_CASE 20
55	Verify
S3.3	ON_LEAVE 25 + NEW_TERMINAL 10 + RECORD_VIEW_NO_CASE 35	70	Hold
S3.4	+ BULK_EXPORT_NO_TICKET 15
85	Contain
Case notes
A deterministic template note is written the moment a case changes; the local LLM may then reword it, but its note replaces the template only if it passes every validation check.
Step 1, facts ( casenotes/facts.py ). One fact per active signal, each with an ID, a plain statement and its evidence IDs. The staff member is always "the user".
{
  "case_id": "CASE-0001",
  "subject": {"pseudo_id": "Staff-7F3A", "role": "OPS_EPRODUCTS", 
"employment_type": "EMPLOYEE"},
  "score": 91,
  "level": "CONTAIN",
  "facts": [
    {"id": "F1", "code": "REVERSAL_WRONG_BENEFICIARY", "statement": "6 reversals did not return money to the debited customers.", "evidence": ["ACT-
90001", "ACT-90002"]},
    {"id": "F2", "code": "NEW_BENEFICIARY_ACCOUNT", "statement": "All 6 credited accounts were opened in the last 7 days.", "evidence": ["ACC-N1", 
"ACC-N6"]}
  ],
  "recommendation_options": ["Suspend session, keep hold, escalate to 
Internal Control."]
}
Step 2, template note ( casenotes/template.py ). The fact statements in signal order, then the recommendation, then "Analyst decision required." For S2 at 91 the template must print exactly:
6 reversals did not return money to the debited customers.
All 6 credited accounts were opened in the last 7 days.
All posted 21:47 to 21:53, outside the user's rostered shift.
Ticket number entered at 21:48 does not exist.
Beneficiaries tried to send to 31 accounts at 21:58; stopped by the hold.
Recommended: suspend session, keep hold, escalate to Internal Control.
Analyst decision required.
Step 3, LLM rewrite ( casenotes/llm.py ). Call Ollama's chat endpoint on localhost with JSON output, temperature 0, a 20-second timeout and no streaming.
System prompt:
You write insider-threat case notes for bank security analysts.
Use ONLY the facts in the input. Do not add facts, causes, motives or names.
Refer to the employee only as "the user".
Write 2 to 8 short sentences. Every sentence must list the fact IDs it relies on. Choose the recommendation exactly from recommendation_options.
Return JSON only, matching this schema:
{"sentences":[{"text":string,"facts":
[string]}],"recommendation":string,"decision_required":true}
User message: the facts JSON from Step 1.
Validator (all must pass, otherwise keep the template):
The output parses and matches the schema.
2 to 8 sentences; each cites at least one fact ID that exists.
Every number or time in a sentence (pattern \d[\d,:.]* ) appears in the statement of a fact it cites.
No staff name from the staff table appears anywhere.
recommendation is exactly one of recommendation_options , and decision_required is true.
Modes ( LLM_MODE in config): off uses the template only. cache loads
casenotes/cache/<scenario>-<step>.json if present, else the template. live calls the
model and falls back to the template on any failure. make notes-cache runs live once per scenario step and saves only validated notes. Demo day runs in cache .
The console shows a small badge with the note's source (Template, AI, or AI cached), and each sentence highlights its evidence on hover.
API and live events
REST for state, one Server-Sent Events stream for live updates; every response uses pseudonyms unless the case has been unmasked.
Method	Path	Body	Returns
GET	/api/health
	{ok}

POST	/api/sim/reset
{seed?}
Reseeds the database and clears scenario state; keeps the case-note cache
Method	Path	Body	Returns
GET	/api/sim/state
	{scenario, step_index, sim_time, next_step_label,
waiting_for_intervention_id?}
GET	/api/scenarios
	Scenarios with their steps: id, label, sim_time
POST	/api/scenarios/{id}/next
	{step, events} ; 409 while an intervention gate is pending
POST	/api/scenarios/rehearse
	Runs every step and auto-approves gates. Tests and rehearsal only
GET	/api/actions
?
staff_id&since&limit=50
Recent actions with purpose status and points
GET	/api/risk/top
?limit=10
Staff ranked by current score, with level
GET	/api/staff/{id}
	Profile, current score, level and breakdown
GET	/api/staff/{id}/timeline
	Score history: [{ts, score, level, step_id}]

GET	/api/cases
	Case list
GET	/api/cases/{id}
	Case, signals, purpose results, interventions, latest note
POST	/api/cases/{id}/unmask
{analyst_id, reason}
The real name; 403 unless the case is open. Audited
POST	/api/interventions/{id}/approve
{analyst_id, note?}
Updated intervention. Audited
POST	/api/interventions/{id}/reject
{analyst_id, note}
Updated intervention. Audited
POST	/api/actions/{id}/answer
{ticket_ref}
Ticket validation result (the player calls this in S2.2)
GET	/api/graph/{case_id}
	{nodes: [{id, type, label, flags}], edges:
[{source, target, type, amount?, status?}]}

GET	/api/metrics
	Counters, below
GET	/api/audit
?limit
Audit log rows
GET	/api/stream
	Server-Sent Events
Events on /api/stream . Each message is {type, id, sim_ts, data} with an increasing id :
Type	Data
sim.step
scenario, step_id, sim_time
action.created
action_id, staff_pseudo, action_type, amount?
purpose.evaluated
action_id, status, failed_checks
signal.fired
staff_id, code, tier, effective_points
Type	Data
score.updated
staff_id, score, level, breakdown, step_id
case.opened
case_id, staff_id
intervention.created
id, type, status, automatic
intervention.decided
id, status, decided_by
transfer.blocked
from_account, to_account, amount
casenote.ready
case_id, source
metrics.updated
the metrics payload
Metrics payload: actions_checked , actions_matched , unusual_cleared (staff-days whose raw score reached 15 but effective score stayed under 15), cases_opened , true_cases , false_alerts , funds_held_naira , transfers_blocked . Only this
endpoint may read is_malicious , to split true cases from false alerts.
Frontend screens
Four screens in the deck's look (dark navy, amber accent), built for a projector: large type, few colours, one obvious button at each moment of the demo.
Level colours (use everywhere): Normal slate, Watch sky blue, Verify cyan, Hold amber, Contain red.
1. Console ( / )
 	Top bar: SENTRY wordmark, simulated clock, scenario picker, Reset, Next step
(disabled with "Waiting for analyst decision" while a gate is pending), LLM mode badge.  	Live action feed (left, 60% width): time, staff pseudonym, action icon, amount, purpose chip (Matched green, Wrong beneficiary red, No case red, Partial amber), points added. New rows slide in; filter All or Flagged.
 	Top risk (right, top): pseudonym, role, a 0 to 100 score bar in the level colour, level chip. Click opens the case or staff page.
 	Pending decisions (right, middle): each PENDING_APPROVAL intervention with large Approve and Reject buttons. The presenter clicks here.
 	Counters (right, bottom): the metrics payload, updating live.
 	"What the employee sees" card: appears on REQUEST_REASON . Shows "SENTRY needs a reason for this action. Enter the ticket or case number.", the typed ticket, and the result (for S2.2: "Ticket not found").
 	Cleared toast: for S1: "Cleared automatically: overtime approved, all 60 reversals matched."
2. Case view ( /cases/[id] )
 	Header: case ID, pseudonym with an Unmask button (modal asks for a reason; audited), role, employee or contractor, score and level, status.
 	Score timeline: a step line in Recharts over shaded level bands, each point labelled with its time (21:47, 21:48, 21:53, 21:58).
Signals table: human label, tier, points, waived or not, evidence link.
Purpose checks: per action, R1 to R5 as ticks and crosses with the detail, for example "Credit went to ACC-N1, opened 13 Oct; the debited account was ACC-004512".
Interventions panel with Approve and Reject.
Case note with its source badge; hovering a sentence highlights its evidence rows.
Money graph tab (Cytoscape): the staff node in the centre, credited accounts (red when under 7 days old), outside accounts, blocked transfers as dashed red edges labelled "blocked".
3.	Staff view ( /staff/[id] )
Profile and a week-long score timeline. Used in S2.0 to show Tunde's Monday at 6.
4.	Metrics ( /metrics )
The counters, plus the false-alarm test results table.
Auto-focus. Each scenario step carries a focus value in its sim.step event, and the console follows it: S1.1 the feed and toast, S2.0 Tunde's staff view, S2.1 onward his case, S3.1 onward Bisi's case.
Human labels for signals:
Code	Label on screen
REVERSAL_WRONG_BENEFICIARY
Reversal credited to someone else
REVERSAL_NO_MATCH
Reversal with no failed transaction
NEW_BENEFICIARY_ACCOUNT
Money sent to a brand-new account
Code	Label on screen
FAN_OUT
Money spreading to many accounts
TICKET_INVALID
Ticket given does not check out
OUTSIDE_ROSTER
Outside rostered shift
VOLUME_ANOMALY
Unusual volume for role
ON_LEAVE
Activity while on approved leave
NEW_TERMINAL
Never-used terminal
RECORD_VIEW_NO_CASE
Customer records viewed with no case
BULK_EXPORT_NO_TICKET
Bulk export with no approved ticket
Privacy, audit and tests
The prototype practises what the pitch promises: pseudonyms by default, an audit row for every human decision, and tests that pin every demo number.
Privacy in the prototype:
 	Staff appear as pseudonyms everywhere. A real name shows only after an analyst unmasks an open case at Verify or above, giving a reason.
Customer account numbers show only their last four digits in the console. The LLM receives the facts JSON only: pseudonym, role, signals, no names. It runs locally.
 	The data model holds no email content, keystrokes or private messages, by design.
Audit log rows: every approve, reject, unmask and reset, plus each case note's source. The metrics page shows the latest 20.
Tests ( backend/tests/ ):
File	What it proves
test_purpose.py
Each reversal check (R1 to R5) fails on its own crafted row; record view with and without a case; each ticket rule (T1 to T5) fails on its own
File	What it proves
test_scoring.py
Tiers, the cap at 100, signals expiring after 24 hours, waivers W1 to W4
test_scenarios.py
Reset with seed 2026, rehearse S1 to S3, assert every value in the expected-values table, 31 transfers BLOCKED_BY_HOLD , the export BLOCKED , and the exact S2 template note
test_false_alarms.py
The false-alarm test below
False-alarm test (answers "while minimising false alarms"):
1.	Generate the baseline with seeds 1 to 5, no scenarios.
2.	Add 20 unusual-but-legitimate events per seed: overtime bursts like Ngozi's, refunds to the customer's other account, and logins from a new terminal with no other signal.
3.	Run the pipeline. Count staff-days that reached Verify or above with is_malicious false.
4.	Assert the count is 0, and write a results table (seed, staff-days, legitimate-unusual events, events cleared, false alerts) to /api/metrics and the metrics page.
Put the measured result on the deck's impact slide. If the count is not 0, show the real number and explain it; never present a number you did not measure.
Manual checks before each rehearsal: Reset works twice in a row; Next step is disabled at both gates; the console survives a browser refresh mid-scenario; the case note appears in cache mode with the network off.
Build milestones for Codex
Fourteen milestones, one Codex task each, in dependency order; the demo path is complete at M10 on Day 2, and Day 3 is for depth and safety.
#	Milestone	Owner	Day	Spec sections	Done when
M0	Scaffold: repo layout, pyproject, Next.js app, Makefile, AGENTS.md,
/api/health
Oladoja	Tue 20 Oct	Architecture, Tech stack	make setup and make dev
show health OK and an empty console
M1	All 20 tables and database init	Oladoja	Tue 20 Oct	Data model	Tables create cleanly; an import test passes
#	Milestone	Owner	Day	Spec sections	Done when
M2	Baseline generator and scenario characters	Oladoja	Tue 20 Oct	Synthetic data	make seed under 2 minutes;
counts within 5% of spec; two runs with seed 2026 give identical counts
M3	Purpose engine and ticket validation	Oladoja	Tue 20 Oct	Detection engines › Purpose	test_purpose.py passes

M4	Behaviour and identity engines, peer statistics	Hammed	Tue 20 Oct	Detection engines
› Behaviour,
Identity	Unit tests for z tiers, roster, leave and terminal pass
M5	Signal catalogue, scoring and waivers	Oladoja	Wed
21 Oct	Scoring	test_scoring.py passes

M6	Scenario player with S1 to S3 and the two gates	Hammed	Wed
21 Oct	Synthetic data › steps	/api/scenarios/rehearse runs end to end; Next step returns 409 at a gate
M7	Money engine, ladder, interventions, hold blocking	Oladoja	Wed
21 Oct	Detection › Money, Scoring › Levels	test_scenarios.py passes every expected value
M8	Case notes: facts, template, LLM client, validator, cache	Hammed	Wed
21 Oct	Case notes	Exact S2 template text; validator rejects 5 crafted bad outputs
M9	REST endpoints and the event stream	Oladoja	Wed
21 Oct	API and live events	Every endpoint responds; rehearse emits events in step order
M10	Console screen	Oladoja	Wed
21 Oct	Frontend › Console	Full demo path clickable from Reset to S3.4
M11	Case view, staff view, money graph	Hammed	Thu 22 Oct	Frontend › Case, Staff	Timeline, checks, signals, note hover and blocked edges render for S2 and S3
M12	Metrics page, falsealarm test, privacy and audit	Hammed	Thu 22 Oct	Privacy, audit and tests	test_false_alarms.py passes; unmask is audited
M13	Demo hardening	Both	Thu 22 Oct	Demo runbook	Manual checks pass; backup video recorded
Asking ChatGPT for a Codex prompt. Paste the spec once, then send:
Using the SENTRY spec, write the Codex prompt for milestone M7 in the template below. Name exact files and functions. Do not add features that are not in the spec.
If the spec is ambiguous, list the question at the end instead of guessing.
Codex prompt template:
 
Working rhythm: one person reviews the other's Codex output before merging. If a milestone slips by more than two hours, cut its nice-to-have parts, never the tests.
Demo runbook and Day 1 checks
The demo is a fixed sequence of clicks rehearsed until it is boring; if anything breaks on stage, switch to the backup video and keep talking.
Before going on stage:
1.	Run make demo-reset (seed 2026), then make dev .
2.	Open the console full-screen at 125% zoom. Confirm the note badge reads "AI cached" and Next step reads S1.1.
3.	Turn on the phone hotspot as backup. Keep the backup video open in another tab.
On-stage clicks (times match the blueprint's demo script):
Time	Click	Screen shows
0:20	Next step → S1.1	Ngozi's burst in the feed, "Cleared automatically" toast, score 6
0:50	Next step → S2.0	Tunde's staff view, Monday at 6
1:05	Next step → S2.1, then Next step → S2.2	Case opens at 38; employee card shows "Ticket not found"; 48
1:40	Next step → S2.3, then Approve the funds hold	74, Hold; ₦5,835,000 held
2:05	Next step → S2.4, then Approve the suspension	31 transfers blocked in the graph; 91,
Contain
2:35	(no click)	Case note with evidence
3:00	Next step four times → S3.1 to S3.4, then Approve the suspension	Bisi's case: 35, 55, 70, 85; export blocked
3:30	Open Metrics	Counters and the false-alarm result
The blueprint's demo script still says Bisi opens 214 records; change that line to "opens 60 records with no case, then tries a bulk export" so the deck, script and code agree.
Day 1 checks with the facilitators:
Pitch and demo length, and Q&A length
Whether a hosted LLM API is allowed or only open-source tools (the local model covers both)
Projector connection and adapter for your laptop
Wi-Fi reliability, and whether running fully offline is fine
Whether a code repository link or video must be submitted, and by when
Format and timing of the semi-final on Fri 23 Oct

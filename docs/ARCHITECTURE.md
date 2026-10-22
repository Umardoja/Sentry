# SENTRY Architecture (single Next.js app)

The Python/FastAPI split has been replaced by one Next.js App Router and TypeScript application. Route handlers replace routers, server modules replace the backend, Zod replaces duplicate API types, and better-sqlite3 persists to `data/sentry.db` (plain SQL in `src/server/db/migrate.ts`; no ORM). `docs/STACK.md` is authoritative for this translation.

## 1. Inventory

The design handoff lives under `design/design/`: seven HTML exports (one `code.html` per screen folder), the corrected `DESIGN.md`, and `NOTES.md`, which overrides the exports. The screen PNG files sit at the repo root. The duplicate export copy under `Sentry/` and Stitch's uncorrected `sentry_zenith_security_console/DESIGN.md` have been deleted; there is no `frontend/design/`. The rest of the tree is the application itself: root configuration, `src/`, `scripts/`, `tests/` and this documentation.

## 2. Screen map

| Design export | Route | REST / events | Shared components |
|---|---|---|---|
| console_21_53_hold_pending | `/` | sim state, actions, risk, metrics; `action.created`, `score.updated`, `intervention.*`, `metrics.updated` | TopBar, NavRail, PurposeChip, PointsCell, DecisionCard, CounterTile |
| console_21_10_ngozi_cleared | `/` | sim state, actions; `sim.step`, `purpose.evaluated` | TopBar, Toast, PurposeChip |
| case_91_contain / case_bisi_85_contain / case_money_graph | `/cases/[id]` | case detail, graph; `case.opened`, `casenote.ready` | LevelChip, ScoreBar, DecisionCard, Badge |
| employee prompt and unmask dialog | `/cases/[id]` | answer, unmask | Banner, Badge |
| leak_tracer_5_victims_1_common_contractor | `/tracer` | future tracer endpoint/events | TopBar, NavRail, Badge |
| no direct export | `/staff/[id]`, `/metrics` | staff/timeline and metrics/audit | ScoreBar, LevelChip, CounterTile |

## 3. Component inventory

TopBar (clock, scenario, waiting), NavRail, LevelChip (level), ScoreBar (score, level), PurposeChip (status), PointsCell (points), DecisionCard (state), CounterTile (label, value), Badge (children), Banner (children), Toast (children). All are shown in `/dev/components`.

## 4. Module map

M0: `src/server/config`, `rng`, `time`, `privacy`, `events`, `db`, `src/shared/schemas`, route handlers, engine base and shell. M1: Drizzle tables. M2: generator. M3: purpose. M4: behaviour/identity. M5: signals/scoring. M6: scenarios/player/pipeline. M7: money/ladder. M8: casenotes. M9: route logic. M10: console. M11: cases/staff/graph/leaks. M12: metrics/audit/privacy tests.

## 5. Data flow

Generator and scenario player feed the ordered pipeline: purpose, behaviour, identity, money, scoring, ladder, interventions, case note. Drizzle/better-sqlite3 persists results to SQLite and the global in-process event bus feeds same-origin REST/SSE and the console.

## 6. Conflicts and ambiguities

The explicit team decision replaces the Python architecture. `DESIGN.md` specifies a light clinical theme whereas the pitch deck describes dark navy/amber screens; the console follows DESIGN.md and the deck stays dark. The v1.1 tracer uses fixture contractor `STF-0389`, pseudonymised as `Staff-B4E0`, and returns five victim accounts, common staff rows, and the common contractor row (`leakTracerPayloadSchema`). The readable specification resolves the previous source-format question; no open architectural questions remain for M0.

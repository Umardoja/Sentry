# Current stack and dependencies

Verified from the repository and installed tree on 21 October 2026. “Installed” means present in the local `node_modules` reported by `npm ls --depth=0`; it does not mean a package is used at runtime. No network service was contacted for this inventory.

## Runtime and commands

| Item | Declared / installed | Active use and evidence |
|---|---:|---|
| Node.js | `>=20` / `v24.20.0` | Server runtime and scripts; `package.json#engines` and local `node --version`. |
| npm | `11.19.0` | Lockfile/package runner. |
| Next.js | `15.5.9` / `15.5.9` | App Router pages and Node.js Route Handlers under `src/app`; `next.config.mjs` supports an isolated `SENTRY_NEXT_DIST_DIR`. |
| React / React DOM | `19.0.0` / `19.0.0` | Client screens, hooks and server-rendered shell. |
| TypeScript | `5.7.3` / `5.7.3` | Strict source and `tsc --noEmit`. |

Scripts in `package.json`:

- Runtime: `npm run dev`, `npm run start`, `npm run build`.
- Safe demo startup: set explicit demo paths, run `npm run demo:prepare`, then `npm run dev` or `npm run start`. Preparation builds the shared immutable synthetic template before visitors arrive; every visitor still gets a private copy and new run ID.
- Local data/tools: `seed`, `db:init`, `demo-reset`, `notes-cache`, `false-alarms`, `rehearse`, `auth:provision`.
- Quality: `test`, `lint`, `typecheck`, `format`.
- Frozen synthetic evaluations: Pass 4 and Pass 5 freeze/parity/evaluate scripts. Their existing frozen inputs and results were not modified in Pass 6.

Development compilation latency is not production latency. `next dev` compiles routes on first access. A production-like check requires a separate `SENTRY_NEXT_DIST_DIR`, `npm run build`, then `npm run start` with the same explicit isolated data paths.

## UI implementation

- Styling: Tailwind CSS 3.4.17 directives are loaded by `src/app/globals.css`, but most product styling is handwritten token-based CSS plus React class names and inline layout values. `tailwind.config.ts` exists; no shadcn/ui or Radix dependency is present.
- Fonts: local package assets from `@fontsource/inter` and `@fontsource/plus-jakarta-sans`; no runtime font CDN request.
- Icons: `lucide-react` in the shell, console, cases, graph and tracer.
- Charts: Recharts is actively used only by `src/app/staff/[id]/page.tsx`. The case money graph is custom HTML/SVG in `src/app/cases/[id]/graph.tsx`.
- State/data fetching: React hooks plus the local `useSession`, `post` and `usePoll` helpers in `src/lib/client.ts`. There is no Redux, Zustand, React Query or SWR.
- Realtime: current pages poll and refresh immediately after local mutations. `src/lib/sse.ts` and `/api/stream` exist, but no current page imports the SSE hook.
- Animation: no animation library. CSS respects reduced-motion preference.
- Responsive behavior: token CSS breakpoints in `src/app/globals.css`; a wrapping top bar, collapsible grids, a fixed bottom mobile nav, scrollable labelled tables/graph, viewport-safe dialogs and 44px important touch targets.

Browser routes:

| Route | Screen | Main caller/data |
|---|---|---|
| `/login` | Password-free persona picker in explicit demo mode; normal credentials otherwise | `/api/auth/mode`, `/api/auth/demo`, `/api/auth/login` |
| `/` | Presenter/reviewer console | `/api/console`, `/api/sim/state` |
| `/my-actions` | Operator-owned sensitive actions and ticket answer | `/api/actions`, `/api/actions/{id}/answer` |
| `/cases` | Case list | `/api/cases` |
| `/cases/{id}` | Overview, evidence, money graph, reveal and decisions | case, graph, unmask and intervention APIs |
| `/staff/{id}` | Staff risk history | staff API; Recharts |
| `/tracer` | Synthetic leak-tracing correlation | tracer API |
| `/metrics` | Synthetic counters, false-alarm fixture results and audit excerpt | metrics and audit APIs |

## Direct dependencies

Versions below are both declared and installed unless stated otherwise.

| Package | Version | Status | Source evidence |
|---|---:|---|---|
| `@fontsource/inter` | 5.1.1 | actively used | CSS imports in `src/app/globals.css` |
| `@fontsource/plus-jakarta-sans` | 5.1.1 | actively used | CSS imports in `src/app/globals.css` |
| `better-sqlite3` | 12.4.1 | actively used | DB, auth, engines, services and tests under `src/server/**` |
| `cytoscape` | 3.30.4 | declared but apparently unused | no source import; money graph is custom HTML/SVG |
| `drizzle-orm` | 0.38.4 | declared but apparently unused | no source import; `docs/STACK.md` says the Drizzle experiment was removed |
| `lucide-react` | 0.468.0 | actively used | `src/components/index.tsx` and several pages |
| `next` | 15.5.9 | actively used | App Router, navigation and metadata |
| `react` | 19.0.0 | actively used | components and hooks |
| `react-cytoscapejs` | 2.0.0 | declared but apparently unused | no source import |
| `react-dom` | 19.0.0 | actively used by framework | required Next peer/runtime; no direct application import |
| `recharts` | 2.15.1 | actively used | staff risk line chart |
| `server-only` | 0.0.1 | actively used | server modules begin with `import "server-only"` |
| `zod` | 3.24.1 | actively used | `src/shared/schemas.ts`, route error handling |

## Direct development dependencies

| Package | Version | Status | Source evidence |
|---|---:|---|---|
| `@eslint/eslintrc` | 3.3.1 | development-only, active | ESLint compatibility configuration |
| `@types/better-sqlite3` | 7.6.13 | development-only, active | server/test type checking |
| `@types/node` | 22.13.1 | development-only, active | Node APIs in TypeScript |
| `@types/react` | 19.0.8 | development-only, active | JSX/component types |
| `@types/react-dom` | 19.0.3 | development-only, active | React DOM types |
| `autoprefixer` | 10.4.20 | development/build, active | `postcss.config.mjs` |
| `drizzle-kit` | 0.30.4 | declared but apparently unused | no schema/config/script invokes it |
| `eslint` | 9.19.0 | development-only, active | `npm run lint` |
| `eslint-config-next` | 15.5.9 | development-only, active | `eslint.config.mjs` |
| `postcss` | 8.5.1 | development/build, active | CSS build pipeline |
| `prettier` | 3.5.3 | development-only, active | `npm run format` |
| `tailwindcss` | 3.4.17 | development/build, active | CSS directives and `tailwind.config.ts` |
| `tsx` | 4.19.2 | development/operations, active | seed, rehearsal, auth and evaluation scripts |
| `typescript` | 5.7.3 | development/build, active | typecheck and Next compilation |
| `vitest` | 3.0.5 | development-only, active | 16 test files under `tests/` |

Significant installed transitive families include Next SWC (`@next/swc-win32-x64-msvc` 15.5.7 on this machine) and Sharp 0.34.5; Vitest/Vite 6.4.4/Rollup 4.64.12/esbuild 0.25.12; Recharts' Victory/D3 and Lodash families; and ESLint/PostCSS plugin families. Several older esbuild versions are pulled only by the currently unused Drizzle tooling. Reproduce the complete machine tree with `npm ls --all --json`; do not treat this summary as a vulnerability assessment.

## Backend, data and models

- Backend: Next Route Handlers in the same Node process. No separate FastAPI service, queue, worker or microservice.
- Business storage: one better-sqlite3 database per demo visitor, routed by `AsyncLocalStorage` in `src/server/services/workspace.ts`. Plain SQL DDL and indexes are in `src/server/db/migrate.ts`; no active ORM.
- Auth storage: separate better-sqlite3 database in `src/server/auth/store.ts`.
- Synthetic template: `src/server/sim/generator.ts` creates 30 days of synthetic staff/customer/action history. `src/server/services/demo.ts` copies a prepared immutable template into each workspace, then rotates the run ID.
- Validation: Zod schemas at HTTP mutation boundaries in `src/shared/schemas.ts`.
- Risk “models”: deterministic purpose rules (`purpose.ts`), deterministic behavioural/identity/money signals and arithmetic aggregation (`pipeline.ts`, `signals.ts`), and deterministic reason-based review policy `risk-review-v2` (`reviewPolicy.ts`). These are not ML models.
- Case notes: deterministic templates are active. `src/server/casenotes/llm.ts` is a throwing stub; `OLLAMA_URL`, `OLLAMA_MODEL` and `LLM_MODE` are configuration names only. No model invocation was found.

## External/configuration register

Environment variable names observed (values were not read): `DB_PATH`, `AUTH_DB_PATH`, `APP_ORIGIN`, `AUTH_ALLOW_INSECURE_LOOPBACK`, `SENTRY_DEMO_MODE`, `DEMO_WORKSPACE_ROOT`, `DEMO_WORKSPACE_MAX`, `DEMO_WORKSPACE_TTL_HOURS`, `SENTRY_NEXT_DIST_DIR`, `PSEUDONYM_SALT`, `LLM_MODE`, `OLLAMA_URL`, `OLLAMA_MODEL`, `NEXT_PUBLIC_USE_FIXTURES`, plus the explicit evaluation path/split variables in `scripts/evaluate-*` and `scripts/freeze-*`.

| Service/integration | State |
|---|---|
| Browser ↔ Next server | active, same-origin HTTP/HTTPS |
| Local SQLite filesystem | active; persistent local filesystem and one application process per store assumed |
| Bank transaction/customer/ticket/identity systems | not connected; generated local rows only |
| CBN/BVN watchlist | synthetic local table/effect only; no CBN call |
| Email/SMS/payment provider | not found |
| Enterprise IdP/MFA | not connected; bounded local synthetic accounts only |
| Ollama/hosted model | configured names and stub only; not invoked |
| External logging/APM | not found; console/server logs plus SQLite audit rows |
| Deployment platform | not declared; no Dockerfile or cloud-specific deployment config found in the inspected scope |

SQLite files must not be assumed safe on ephemeral or multi-instance serverless hosting. Session, decision and local effect transactions are single-process SQLite guarantees, not distributed execution guarantees.

## Files inspected and exclusions

Inspected: `package.json`, lockfile/package tree, Next/TypeScript/Tailwind/PostCSS/ESLint/Vitest configs, all `src/app` pages and Route Handlers, `src/components`, `src/lib`, server auth/DB/engines/services/simulator/case-note modules, scripts and tests. Excluded from content inspection: protected existing databases and WAL/SHM files, environment/credential files, generated Next output, `node_modules` source, design exports and frozen evaluation contents. Package metadata was read through npm; no registry/network call was made.

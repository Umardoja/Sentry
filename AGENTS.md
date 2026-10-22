# AGENTS.md: SENTRY
One Next.js (App Router) + TypeScript app. Behaviour: docs/SPEC.md. Languages, tools and paths: docs/STACK.md (overrides SPEC.md on those only). Design: design/design/DESIGN.md and design/design/NOTES.md (NOTES.md overrides the design exports; the exports are the code.html files beside them).

## Rules
- Read the spec sections named in the task before writing code.
- Deterministic: all server randomness comes from src/server/rng.ts seeded by config SEED. Never use Math.random, Date.now() or new Date() without an argument in engines, scoring, scenarios or the generator; time comes from event timestamps.
- Times are ISO strings with the Lagos offset (2026-10-16T21:47:00+01:00). Format and compare them with src/server/time.ts and src/shared helpers only; never rely on the machine's time zone or toLocale* functions.
- Money is integer naira.
- Signal codes, tiers and points live only in src/server/engines/signals.ts. Scenario steps live only in src/server/sim/scenarios.ts.
- The LLM only writes case-note text. It never sets scores, levels or interventions.
- Server code lives in src/server/ and starts with import "server-only"; client components never import it.
- Route handlers declare export const runtime = "nodejs" and export const dynamic = "force-dynamic".
- The database client and event bus are singletons stored on globalThis so they survive dev hot reloads.
- All data is synthetic. No real bank names or real people.
- Change only the files the task names. No unrelated refactors. Never edit design/.

## Commands
npm install | npm run dev | npm run seed | npm run demo-reset | npm run notes-cache | npm test | npm run lint | npm run typecheck | npm run build

## Done means
npm test, npm run lint, npm run typecheck and npm run build all pass; new endpoints listed in README.md; no TODOs on the demo path.

## Style
Engines are small pure functions: rows in, SignalHit[] out. Strict TypeScript, no any. Components use design tokens, never raw hex values.

## Temporary files
- Put all temporary databases, previews and build outputs for a task under ONE folder: .codex-tmp/<task-name>/ (use NEXT_DIST_DIR or equivalent inside it).
- Before finishing a task: stop any servers you started and delete .codex-tmp/<task-name>/. Keep only the latest backup in .codex-backups/.
- Never create new .next-* or .codex-pass* folders at the project root.
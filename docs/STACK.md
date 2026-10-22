# SENTRY stack translation

Where docs/SPEC.md names a Python file, library or command, this file replaces it. Everything else in docs/SPEC.md is unchanged.

| Spec (Python) | Now (TypeScript) |
|---|---|
| FastAPI app and routers | Route handlers in `src/app/api/**/route.ts`, same paths |
| schemas.py and frontend types | `src/shared/schemas.ts`, Zod schemas and inferred types |
| SQLModel and SQLite | better-sqlite3; tables are plain SQL in `src/server/db/migrate.ts`, singleton client in `src/server/db/client.ts`, file `data/sentry.db`. No ORM: Drizzle was tried and removed, so there is no `src/server/db/schema.ts` |
| config.py | `src/server/config.ts` |
| random/numpy | `src/server/rng.ts` seeded mulberry32 |
| pandas/networkx | Plain TS generator and adjacency-map graph |
| sse-starlette | `src/server/events.ts` plus a `ReadableStream` SSE route |
| privacy.py | `src/server/privacy.ts` using node:crypto |
| engines, casenotes, sim | Corresponding `src/server/` modules |
| httpx/Ollama | fetch with AbortController timeout |
| pytest | Vitest in `tests/` |
| make commands | npm scripts executed with tsx |
| ruff/type hints | eslint and `tsc --noEmit` |
| backend :8000 + frontend :3000 | one same-origin server on :3000, no CORS |

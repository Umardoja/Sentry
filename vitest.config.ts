import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Plain `npm test` needs no setup: every path defaults to a disposable per-run
// folder (removed by tests/setup/global.ts). Explicit env values still win.
const runDir = path.join(os.tmpdir(), `sentry-vitest-${process.pid}`);
process.env.SENTRY_TEST_RUN_DIR = runDir;
const env = (name: string, fallback: string) => process.env[name] ?? fallback;

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
  // Route tests share one disposable DB_PATH/AUTH_DB_PATH.
  // Keep files sequential so independent workers cannot contend for one SQLite WAL.
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    globalSetup: ['tests/setup/global.ts'],
    // beforeAll hooks seed databases and prepare the demo template (~30–60 s each).
    hookTimeout: 180_000,
    env: {
      DB_PATH: env('DB_PATH', path.join(runDir, 'business.db')),
      AUTH_DB_PATH: env('AUTH_DB_PATH', path.join(runDir, 'auth.db')),
      DEMO_WORKSPACE_ROOT: env('DEMO_WORKSPACE_ROOT', path.join(runDir, 'visitors')),
      APP_ORIGIN: env('APP_ORIGIN', 'http://127.0.0.1:3000'),
      AUTH_ALLOW_INSECURE_LOOPBACK: env('AUTH_ALLOW_INSECURE_LOOPBACK', '1'),
      INGEST_KEY: env('INGEST_KEY', 'test-key'),
    },
  },
});

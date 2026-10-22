import { rmSync } from "node:fs";

/** Removes the per-run folder that vitest.config.ts points the default paths at. */
export default function setup() {
  return () => {
    const dir = process.env.SENTRY_TEST_RUN_DIR;
    if (dir && /sentry-vitest-\d+$/.test(dir)) rmSync(dir, { recursive: true, force: true });
  };
}

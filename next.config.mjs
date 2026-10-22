// Plain JavaScript so `next start` needs no TypeScript install in the slim runtime image.
/** @type {import("next").NextConfig} */
const nextConfig = {
  distDir: process.env.SENTRY_NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;

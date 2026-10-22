# SENTRY synthetic demo: one container, one instance, SQLite on a mounted volume at /data.
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Toolchain only in case better-sqlite3 has no prebuilt binary for this platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && rm -rf .next/cache

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    SENTRY_DEMO_MODE=1 \
    DB_PATH=/data/business.db \
    AUTH_DB_PATH=/data/auth.db \
    DEMO_WORKSPACE_ROOT=/data/visitors
# tsx (a dev dependency) runs demo:prepare at start, so the full install is kept.
COPY --from=build /app /app
VOLUME /data
EXPOSE 3000
# demo:prepare is idempotent: the first start builds the visitor template on the volume (~1 min), later starts skip it.
CMD ["sh", "-c", "npm run demo:prepare && exec npm start -- -H 0.0.0.0 -p \"$PORT\""]

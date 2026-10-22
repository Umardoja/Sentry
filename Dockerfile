# SENTRY synthetic demo: one container, one instance, SQLite on a mounted volume at /data.
# Sized for a 512 MB host: the visitor template is generated here at build time, never at runtime.
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Toolchain only in case better-sqlite3 has no prebuilt binary for this platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && rm -rf .next/cache

FROM build AS template
# Deterministic (SEED 2026), so building it once per image is equivalent to building it on first start.
RUN SENTRY_DEMO_MODE=1 DEMO_WORKSPACE_ROOT=/tmp/template NODE_OPTIONS=--max-old-space-size=384 npm run demo:prepare \
 && mkdir -p /app/template && mv /tmp/template/_templates/*.db /app/template/ && ls -l /app/template

FROM build AS prod-deps
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=384 \
    PORT=3000 \
    SENTRY_DEMO_MODE=1 \
    DB_PATH=/data/business.db \
    AUTH_DB_PATH=/data/auth.db \
    DEMO_WORKSPACE_ROOT=/data/visitors
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/next.config.mjs ./
COPY --from=build /app/.next ./.next
COPY --from=template /app/template ./template
COPY scripts/docker-start.sh ./docker-start.sh
VOLUME /data
EXPOSE 3000
CMD ["sh", "/app/docker-start.sh"]

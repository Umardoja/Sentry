#!/bin/sh
# Container entrypoint: no data generation at runtime. The visitor template was built into the
# image at /app/template; an empty /data volume gets a copy (seconds), then the server listens on $PORT.
set -eu
templates="$DEMO_WORKSPACE_ROOT/_templates"
mkdir -p "$templates" "$(dirname "$DB_PATH")" "$(dirname "$AUTH_DB_PATH")"
for source in /app/template/*.db; do
  target="$templates/$(basename "$source")"
  if [ ! -f "$target" ]; then
    cp "$source" "$target.partial" && mv "$target.partial" "$target"
    echo "[sentry] copied visitor template to $target"
  fi
done
exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p "${PORT:-3000}"

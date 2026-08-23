#!/usr/bin/env bash
set -euo pipefail

image="${1:?usage: smoke-api-image.sh IMAGE}"
container_name="turingcare-api-smoke-${GITHUB_RUN_ID:-local}-$$"
port="${TURINGCARE_SMOKE_PORT:-3101}"

cleanup() {
  docker rm --force "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --detach --name "$container_name" --network host \
  --env PORT="$port" \
  --env DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}" \
  --env BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:?BETTER_AUTH_SECRET is required}" \
  --env BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://localhost:$port}" \
  --env FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}" \
  "$image" >/dev/null

for _attempt in $(seq 1 30); do
  if curl --fail --silent --show-error "http://127.0.0.1:$port/health" >/dev/null; then
    exit 0
  fi
  if ! docker inspect --format '{{.State.Running}}' "$container_name" | grep -qx true; then
    docker logs "$container_name" >&2
    exit 1
  fi
  sleep 1
done

docker logs "$container_name" >&2
exit 1

#!/usr/bin/env bash
set -euo pipefail
image="${1:?usage: smoke-api-monitoring-image.sh IMAGE}"
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cert_dir="$(mktemp -d "${TURINGCARE_SMOKE_TMPDIR:-${TMPDIR:-/tmp}}/turingcare-monitoring.XXXXXX")"
container="turingcare-monitoring-image-${GITHUB_RUN_ID:-local}-$$"
cleanup() {
  docker rm --force "$container" >/dev/null 2>&1 || true
  rm -rf "$cert_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Ephemeral synthetic CA trusted only by children inside this network-isolated check.
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$cert_dir/key.pem" \
  -out "$cert_dir/cert.pem" -days 1 -subj '/CN=127.0.0.1' \
  -addext 'subjectAltName=IP:127.0.0.1' >/dev/null 2>&1
image_command="$(docker image inspect --format '{{json .Config.Cmd}}' "$image")"
docker run --rm --name "$container" --network none \
  --mount "type=bind,source=$cert_dir,target=/tls,readonly" \
  --mount "type=bind,source=$repo_root/scripts/api-image-test,target=/app/apps/api/image-tests,readonly" \
  --env TURINGCARE_IMAGE_COMMAND="$image_command" \
  --entrypoint node "$image" /app/apps/api/image-tests/test.mjs

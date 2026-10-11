#!/usr/bin/env bash
set -euo pipefail

root="$(dirname -- "${BASH_SOURCE[0]}")"
export TZ=UTC LC_ALL=C NODE_ENV=production NODE_OPTIONS=""

pnpm --dir "$root" run build
timeout 300s node --random-seed=42 "$root/scripts/benchmark.mjs"

#!/usr/bin/env bash
set -euo pipefail

root="$(dirname -- "${BASH_SOURCE[0]}")"
export TZ=UTC LC_ALL=C LANG=C NODE_ENV=production NODE_OPTIONS="" PNPM_CONFIG_OFFLINE=true
unset ELECTRON_RUN_AS_NODE

pnpm --dir "$root" run build
timeout 300s node "$root/scripts/sdk-benchmark.mjs"

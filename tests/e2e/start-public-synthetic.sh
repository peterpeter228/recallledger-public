#!/usr/bin/env bash
# Credential-free production entry point, public synthetic sandbox only.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
NODE=${NODE_BIN:-$(command -v node)}
cd "$ROOT"
mkdir -p evidence/20261030-browser
env -i PATH="$(dirname "$NODE"):/usr/bin:/bin" HOST=127.0.0.1 PORT=3100 APP_BASE_URL=http://127.0.0.1:3100 ALLOW_MAINNET_MEMORY_WRITES=false "$NODE" dist/server/main.js > evidence/20261030-browser/public-desktop-server.log 2>&1

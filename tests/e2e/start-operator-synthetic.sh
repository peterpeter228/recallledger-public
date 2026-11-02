#!/usr/bin/env bash
# Local disposable QA only. Does not call src/server/main.ts or configure live providers.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
NODE=${NODE_BIN:-$(command -v node)}
PG=${PG_BIN:?Set PG_BIN to the bin directory of a local PostgreSQL installation}
cd "$ROOT"
DATA=$(mktemp -d "${TMPDIR:-/tmp}/recallledger-browser-pg-XXXXXX")
mkdir -p evidence/20261030-browser
SERVER_PID=
cleanup(){ trap - EXIT INT TERM; if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; fi; "$PG/pg_ctl" -D "$DATA" stop -m fast || true; }
trap cleanup EXIT INT TERM
"$PG/initdb" -D "$DATA" -U agent --auth=trust --no-locale > "${DATA}-init.log" 2>&1
"$PG/pg_ctl" -D "$DATA" -l "$DATA/server.log" -o "-p 55434 -h 127.0.0.1 -c unix_socket_directories=''" start
printf 'SYNTHETIC ONLY PostgreSQL data: %s\n' "$DATA"
env -i PATH="$(dirname "$NODE"):/usr/bin:/bin" HOME="$DATA" UI_TEST_DATABASE_URL=postgres://agent@127.0.0.1:55434/postgres "$NODE" --import tsx tests/e2e/operator-synthetic-harness.ts > evidence/20261030-browser/desktop-server.log 2>&1 &
SERVER_PID=$!
echo "Synthetic UI http://127.0.0.1:3100; Ctrl-C stops server and DB"
wait "$SERVER_PID"

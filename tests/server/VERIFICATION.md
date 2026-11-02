# Backend verification

Executed 2026-10-26, local workspace (no live credentials or mainnet calls).

- API tests use Fastify.inject with the real domain reducer. All twelve events are constructed through public sandbox commands, checked pending before explicit simulation completion. Totals 49 → 24 → 12; idempotency, concurrent-pending denial, frozen demo isolation, origin/CSRF, and forged chain fact rejection.
- PostgreSQL tests use **real PostgreSQL 18.4**, not an in-memory substitute. npm `embedded-postgres@18.4.0-beta.17` installed only in `/tmp/recall-pg-tool`; package source/scripts inspected, postinstall symlinks limited to that package. No system user changes or permanent auth credentials.
- Actual SQL migration, concurrent enqueue, lease exclusion, expired submitting lease → unknown (no automatic resubmission), original-job-only polling, verified receipt prefix advancement, immutable events, budget cap and fresh Node-process committed-state read are tested.
- Crash window is simulated by persisted submitting state and lease expiration; fresh-process database read is real. This is not evidence of a real remote request crash, remote idempotency, or Walrus cold restoration.
- Database server was cleanly stopped after each successful test run. Initial launch with UNIX socket failed and shut down; TCP-only startup is supported. A background server does not survive this tool's command lifetime, so start/test/stop must be one command.

Reproduce (ephemeral test DB only, tests TRUNCATE scopes):

```sh
PG_CTL=/tmp/recall-pg-tool/node_modules/@embedded-postgres/linux-x64/native/bin/pg_ctl
$PG_CTL -D /tmp/recall-pg-data -l /tmp/recall-pg.log \
  -o "-p 55439 -h 127.0.0.1 -c unix_socket_directories=''" start
TEST_DATABASE_URL=postgres://agent@127.0.0.1:55439/postgres node_modules/.bin/vitest run tests/server
result=$?
$PG_CTL -D /tmp/recall-pg-data stop -m fast
exit $result
```

No TEST_DATABASE_URL: PostgreSQL tests are SKIPPED, not passed durability evidence.

## Runtime constraints

- Production requires explicit SQL migration and configured Postgres, owner bootstrap secret, owner/account identity and adapters. Startup never seeds remote memory.
- Public session data is RAM-only, expires after an hour/restart, and has **zero durable version**. Simulated completion creates no Walrus receipt.
- Operator auth sessions are process-local short-lived hashes; restart requires login again. No persistent login credentials are generated.
- `MEMWAL_OWNER_HISTORY_CONFIRMED` attests known owner inventory including prior/orphan uploads. DB caps and remote metadata count do not independently prove undiscovered blob history.
- Unknown submission with no saved job requires explicit operator reconciliation; worker will not blindly submit again. There is no generic retry/reseed endpoint.
- DB `scopes.memory_account_id` is legacy-named and stores expected **owner address**, not SDK account ID; both runtime config values are distinct.
- Tatum normalizer conservatively returns complex observations with unknown precision unless verified facts permit otherwise; no chain transfer purpose inferred.
- Outbox retry schedule exponentially backs off 2→60 seconds; 60 attempts blocks the original operation/job for manual reconciliation, never reseeds.
- Automatic worker is disabled when write switch is off; it also pauses pending job polling. Re-enable only after inspecting persisted operation status.

## CLI regression — 2026-10-26 05:24 UTC

`tests/server/cli.test.ts`: 4 actual local PostgreSQL/fresh-child-process tests passed, exit 0. Test creates a unique disposable schema and `/tmp/recallledger-cli-test-*` cwd, then deletes both; exported fake blob/job/memory IDs all begin `fixture:synthetic-`. It never overwrites repository evidence.

Verified: seed dry-run writes no DB rows; unconfigured seed apply/restore exits 2 before network; freeze rejects 11 records and a receipt without blob identity; exactly 12 fixture receipts create a payload-free manifest; repeated identical freeze is idempotent; conflicting same-version hash fails without overwriting export. Receipt identities are nonempty/unique and stored hashes are compared to canonical event hashes. Seed worker claims only its intended scope. Restore ensures the output directory exists after successful remote verification.

Not verified: live seed submission, remote readback, real Walrus freeze/restore or acceptance eligibility. Local synthetic receipt rows are test inputs, never mainnet receipts.

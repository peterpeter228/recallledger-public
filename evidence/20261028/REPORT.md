# RecallLedger clean-checkout / interrupted-confirmation repair

Run: recallledger-core-20261028T030359Z. Recorded 2026-10-28 11:15 Asia/Shanghai / 2026-10-28T03:15:00Z.
Baseline: `4c97f3e17b072eb2e7324ec11d302281c598e955` (fresh main read; open PRs: 0).
Task: https://app.notion.com/p/40701c911722810ab321e46f0f0c32f6
Project: https://app.notion.com/p/40501c911722817abae4ea9bc2f93bfc

## Scope and verified implementation

- Restored 230 text blobs from the pinned remote tree, each checked against Git blob SHA. 28 historical image/video blobs were not needed or materialized; no claim of full binary checkout. Runtime Node 24.22.1 / pnpm 11.25.0.
- Reproduced clean raw `pnpm test`: 42 passed, 1 failed, 8 skipped. A04 tried to inspect nonexistent `dist/web/assets`. Evidence: `baseline-test.log`.
- Fixed `verify:offline` order to typecheck → build:web → test → eval:fixtures. A04 remains active; not skipped or weakened.
- A confirmed operator mutation reserves a stable request key before sending. Synchronous latch prevents double-click keys. Only key/scope is retained in tab sessionStorage, not token/body.
- Unknown result retains the marker and blocks new writes. Explicit reconciliation does only scoped GET lookup; no automatic POST retry. Pending and completed original operations can be recovered without payload disclosure.
- Existing session / new login restores durable pending operation. Definite typed 4xx errors invalidate confirmation/proposal and refresh state. Missing lookup remains unknown, not safe-to-resubmit.
- Domain semantics, provider shape validation and complex-transfer fail-closed behavior unchanged.

## Actual checks

- PostgreSQL 18.4 actual process, temporary local trust-auth test role, no user database/data; binaries `@embedded-postgres/linux-x64@18.4.0-beta.17`, not an in-memory DB emulator.
- Host package install was unavailable; user-directory npm package used with pinned version. Package symlinks restored by package script. UNIX socket unavailable, ordinary TCP loopback configured. Processes must share the same execution shell due network isolation. Failed setup attempts were not counted as passed tests.
- Clean `dist` removed, `TZ=UTC TEST_DATABASE_URL=<local disposable PG> pnpm run verify:offline`: **54 tests / 10 files passed; 0 skipped**, exit 0. Includes actual PG transaction/lease/restart/CLI and scoped original-key lookup. Log: `clean-full-pg-final.log`.
- `pnpm run build`: exit 0, frontend plus server bundle. `build-final.log`.
- `node --test tests/collaboration-protocol.test.mjs`: 32 passed, 0 skipped, exit 0. `collaboration-test.log`.
- The PG suite's synthetic receipts are never Mainnet receipts. Fixture evaluator remains local synthetic; current output: `fixture-evaluation.json`.
- Independent integration: 11/11 HTTP recovery/fault checks passed using real PG and synthetic providers. Browser acceptance **NOT_RUN/BLOCKED**: cloud browser refused isolated loopback; same-shell Chromium sandbox failed before page creation; approved escalation failed in setup. No screenshots or new viewport/click pass. See `independent-http-browser/QA-REPORT.md` and exact results.

Independent read-only source review found no confirmed new P0/P1 in this bounded slice; focused tests 2/2. See `independent-source-review.md`. This is not Argon or browser acceptance.

## Limits and next slice

- sessionStorage is tab-local; closing tab loses an unknown request marker. New login still recovers unfinished durable operations, but cannot identify a completed lost response without its key. Marker is not an authentication token; read lookup still requires operator session and fixed scope.
- No automatic retry of an unknown mutation, no reset/abandon button that could hide an unconfirmed remote result.
- Live operator remains incomplete: reusable rule scope-confirmation, next-input explanation/record, rule revocation and remote-restore UI are a separate bounded slice. Live main.ts intentionally keeps unverified transfer shape complex. Do not loosen it to make a demo pass.
- Mainnet memories 0; no authenticated Tatum/Walrus/model call, mainnet signature, public deployment or submission in this run. Existing external gates remain blocked.
- Argon review BLOCKED_EXTERNAL: parent reports DNS/TLS/sandbox transport failure before sending a key or model request; no Argon approval/review claimed. This worker read/transmitted no secrets.
- Private remote persistence and Notion readback not performed by this worker; root's unique remote writer must freeze changed files, commit non-forcibly and read back the actual SHA.

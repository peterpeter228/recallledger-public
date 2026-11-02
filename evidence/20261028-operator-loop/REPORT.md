# Protected operator rule/decision continuation

Run `recallledger-operator-loop-20261028T033219Z` · 2026-10-28 11:40 Asia/Shanghai / 2026-10-28T03:40:00Z.
Fixed starting PR #3 head: `4b10518af31e90f31095c6017c554f054ca9edfd`; main remains `4c97f3e17b072eb2e7324ec11d302281c598e955`. PR was freshly read open/unmerged. 255 materialized text files matched that remote Git tree; 28 historical binaries retained remotely, not materialized.
Task: https://app.notion.com/p/40701c911722810ab321e46f0f0c32f6 ; project: https://app.notion.com/p/40501c911722817abae4ea9bc2f93bfc . Fresh reads confirmed DOT build owner and same active PR/head; no takeover or new repository.

## Bounded implementation

- Protected OperatorMemory panel: explicit manual rule scope (fixed network/wallet/counterparty/asset/direction; user-entered integer amount bounds and UTC validity), preview and separate confirmation.
- Only a durable recorded, simple, successful/valid observation enables the reusable-rule form. No automatic range inferred from one sample; no model confirmation.
- Preview new input against durable rules; show exact input hash, classification/reasons and matched rules/events. Separate confirmation records reviewed decision. Old recorded contexts are labeled historical rather than represented as a fresh no-memory comparison.
- Select one active rule, enter reason and separately confirm revocation; future matching stops after done. Historical decisions remain; existing correction flow changes only explicitly targeted input.
- Existing/new operator sessions display durable rule history. Read-only remote manifest check uses existing configured provider; no fixture fallback, state import, reseed or claim of independent cold-process restore.
- Every new mutation uses the previous slice's stable request key/unknown-outcome guard. Child confirmation/proposal state clears before sending. Pending async request disables the child fieldset so edits cannot race an older preview result.

## Source-evidence repair (not scope-only provenance)

The existing backend marked every `rule_confirmed` event synthetic and rejected mainnet-scoped rules in the domain origin check. The fix does NOT infer observed mainnet evidence merely from a user-entered scope.

For mainnet-scoped rule confirmation, the server proposal retains `sourceObservationId`. In the enqueue transaction, it must resolve to an already-durable observation and its historical source event. Network/wallet/counterparty/full asset/direction must match exactly; complex, failed and missing-counterparty sources are refused. The confirmation cannot replace the source embedded in the server proposal with a different request-body source. The event references the original transaction and source event (parent IDs deduplicated); evidence origin is inherited from that recorded source. This proves neither business purpose nor Mainnet memory storage. Synthetic sources remain synthetic. No source payload provided by the client substitutes for durable state.

Production `src/server/main.ts` is unchanged: unverified live transfer shapes remain complex/fail-closed. Credentials alone still do not establish a verified simple-transfer detector. No production test/provider toggle added.

## Executed acceptance

Node 24.22.1 / pnpm 11.25.0, actual temporary PostgreSQL 18.4, no user data or external calls.
- `TEST_DATABASE_URL=<temporary local PG> pnpm run verify:offline` from deleted `dist`: **60/60 tests, 13 files, zero skips**, exit 0; exact final log `clean-full-pg-final.log`.
- Full build/typecheck: `build-final.log`, exit 0.
- Collaboration protocol: 32/32, exit 0; `protocol-tests.log`.
- Real PG HTTP sequence: durable source → explicit rule → pending cannot classify → done classifies new B as expense; same input hash without memory needs context → record decision → explicit single-input correction → revoke → future input needs context, historical decision retained → new session same state hash. Invalid/missing/stale preview and unconfigured remote check refused without advancing state.
- Mainnet-shaped source tests are explicitly fabricated/keyless test objects, **not authenticated Tatum observations**. Tests reject absent/pending sources, identity mismatches, complex/failed/null-counterparty sources and confirmation source replacement. Manual scope tests reject decimal/reversed bounds and invalid validity intervals.
- Independent source review found no confirmed remaining P0/P1 after correcting the async preview-edit race; focused 3-file/5-test run passed. See `independent-source-review.md` with reviewed source hashes. Previous slice's independent 11 HTTP checks remain historical to its recorded source hashes.

## NOT_RUN / boundaries

Actual rendered browser interaction is NOT_RUN: prior permitted attempts failed on environment isolation and Chromium sandbox startup. No new viewport/screenshot/UI-click claim. Static React compilation and HTTP tests do not substitute for clicks.
Argon latest transport preflight remains blocked (`argon-preflight.json`, 03:32:49Z); no key read/sent or model request. This worker made no model request or secret access. Mainnet memories remain 0; no authenticated provider call, signing, deployment, public release or submission. This is a private bounded local candidate, not G0–G6 completion or a prize-probability claim.

Next: independent review, freeze and non-force update the same draft PR through the unique remote writer; do not merge. Then actual browser acceptance in a permitted environment and a separately scoped verified live-transfer/provider integration. No money/credentials/publication authority is inferred from this report.

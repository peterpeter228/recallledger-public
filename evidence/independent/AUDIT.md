# Independent correctness audit

UTC audit window: 2026-10-26 05:09–05:13. No network/provider requests, credential use, implementation edits, or commits. Workspace is not a git repository (`git rev-parse HEAD` failed), so no commit SHA is asserted. Code was actively changing concurrently.

## Resolved findings, independently exercised

1. Imported-but-unclassified observations were treated as historical saved decisions by `/classify`, displaying `needs_context` while `/decisions/record` saved rule-derived expense. Server now distinguishes saved label/decision/refund from mere observation. HTTP regression passes.
2. Same-key accepted rule confirmation was rejected after proposal TTL before reaching idempotency storage. Lookup now precedes proposal validation. HTTP regression passes after six-minute clock advance.
3. **Reproduced P1:** operator default evaluation clock was frozen at the teaching timestamp, so on December 1 a rule expiring November 25 still classified expense. Failure preserved in `correctness-run.txt`; fixed result in `correctness-fixed-run.txt`. Operator now uses server clock.
4. **Reproduced P1:** new operator session could not classify persisted observation B: 404 OBSERVATION_NOT_FOUND even though complete durable history existed. Failure preserved in `reconnect-run.txt`. Session now hydrates durable observations; original B expense/memoryVersion4 survives later revoke.

Independent refund adversarial check passes: recategorizing linked expense moves refund attribution without tools double-offset; relabeling refund to income removes the prior tools offset.

Additional static concern sent to implementation owner: restarting with writes disabled could claim an existing prepared operation then mark unknown after a local no-request exception. Owner fixed worker timer gating to `store&&memory&&writesEnabled`; inspected source confirms safe switch leaves prepared jobs untouched.

## Commands and results

- `./node_modules/.bin/vitest run tests/independent/correctness.test.ts --reporter=verbose`: exit 0, **5 passed**, `current-run.txt`.
- `./node_modules/.bin/vitest run tests/domain tests/server tests/independent --reporter=verbose`: exit 0, **15 passed, 2 skipped**, `combined-run.txt`.
- Real PostgreSQL integration cases skipped in my process because TEST_DATABASE_URL was not configured. Parent/implementation agent evidence must be used separately, not attributed to this audit.

Injected operator tests intentionally use test-double store/provider dependencies and synthetic test facts. They do not demonstrate real PostgreSQL transactions, real chain provenance, mainnet writes, or cold remote restoration.

## Scope and conclusion

Reviewed docs04/05/08 plus domain schema/reducer/integrity, HTTP authorization and session boundary, Postgres lease/outbox behavior, memory restore adapter and Tatum normalization. No remaining **proven** P0/P1 in audited paths after fixes. Existing fixtures cover duplicate/refund cap and target reclassification; integrity reducer rejects missing/hash-conflicting history, decisions are deterministically checked; public sandbox is scoped away from operator store. Those are code/test conclusions, not a live-system security certification.

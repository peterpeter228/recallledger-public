# Independent RecallLedger recovery-slice review

Reviewed at 2026-10-28T03:16:17Z / 2026-10-28 11:16:17 Asia/Shanghai. Reviewer: review_recallledger_acceptance_gaps. Read-only source review; report is outside repository. Baseline main: 4c97f3e17b072eb2e7324ec11d302281c598e955. Review addresses uncommitted local patch, not a new remote SHA.

## Conclusion
No confirmed new P0/P1 code defect found in this bounded recovery slice. This is NOT browser acceptance, live-provider acceptance or whole-product completion. UI interaction remains NOT_RUN in this review.

## Checks
- Operator persists only request key + scope before POST. sessionStorage write failure prevents the mutation request.
- Explicit idempotency key is passed unchanged. Synchronous ref latch prevents overlapping confirmations before React rerender.
- Unknown transport/result leaves marker and blocks new writes; reconciliation only GETs session and own-scope operation key. No automatic POST retry exists.
- GET operation-keys requires authenticated session, derives scope server-side, parameterizes scope/key query, and returns only operationId/state/jobId. No memory text, key, payload, or secret is returned.
- New session adopts durable pendingOperation. When recovered original operation is done, refresh adopts any later pending operation rather than unconditionally clearing it.
- Definite typed 4xx except REQUEST_FAILED clear the local marker and attempt refresh; no automatic resubmit. Server-side durable prefix/version/idempotency remain authoritative.
- Unknown key absent on server remains unresolved. No false failure/success or automatic retry is invented.
- README explicitly states sessionStorage is tab-local; closing tab loses unknown marker. Login recovers durable pending operations, but cannot identify already-completed lost response without its marker. Do not claim cross-device or tab-close exactly-once recovery.

## Independent execution
Command: ./node_modules/.bin/vitest run tests/web/operator-recovery.test.ts
Environment: Node v24.22.1, local workspace.
Exit 0; 1 file / 2 tests passed. Tests cover explicit key and typed rate limit; scoped server lookup/auth/pending/done/missing-key and response redaction. This uses mocked fetch and Fastify injection, NOT rendered React or an actual browser.
Core writer reports full PostgreSQL 18.4 suite 54 passed/0 skipped and protocol 32 passed. Not independently rerun by this reviewer; preserve original logs separately.

## Evidence boundaries / remaining blockers
- Real UI: lost response -> reload/login -> reconcile -> same-operation polling -> later pending preservation, 401, 409 and 429 need actual browser validation. Current test file does not render Operator.
- True reusable-rule operator UI and simple-transfer semantic verification remain absent at baseline; this patch does not solve or claim them.
- Mainnet memory count remains 0; no Tatum authentication, remote Walrus cold restore, public release or submission is verified here.
- No outside API/model, credentials, mainnet action or Notion write performed by reviewer.

## Reviewed source SHA256
b17e4e9a317effa214aa8af7d20094736dce59d10fb087391c66b73ae01bff8a src/web/Operator.tsx
b6fedcb01766233ce58508ef759564c6d1a9acc96850f5b04287c928ceb895e1 src/web/api.ts
2be26f1e61aafbc45d321d89e7f9d15d36d496c6bfe0db769d0ca1a9fbf447f3 src/server/app.ts
619e518007acf67a988f70c211f59a1910f8c07d7186a8816f4d54cd3ffb8b12 src/server/store.ts
bf1751ed7b27eda9ca73136c057c6ccdc138c58f84cf38336607c82733ffb244 src/server/sandbox-store.ts
fe70b0e55dd449d153e9b992701bc35ee4ce47339c9b6282411c680abd9b6638 tests/web/operator-recovery.test.ts

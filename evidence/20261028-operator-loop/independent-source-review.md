# Independent operator rule-loop delta review
Reviewed 2026-10-28T03:39:47Z / 2026-10-28 11:39:47 Asia/Shanghai. Read-only reviewer; report outside repo. Local uncommitted patch, not a remote commit acceptance.

## Disposition
No confirmed remaining P0/P1 in the reviewed bounded slice. Source provenance defect was reproduced before patch and is corrected. Async preview-edit race found during review is corrected by a disabled busy fieldset. This is code/contract review, not browser approval, Argon review, live integration or whole-product completion.

## Reviewed behavior
- Rule scope identities are fixed from selected observation; user explicitly supplies integer range, purpose and UTC interval. Editing resets preview/confirmation. Busy fieldset prevents editing while a preview/manifest check awaits response.
- All rule confirm/decision record/revoke mutations call parent stable-key guarded mutation. Child clears previews and confirmations before mutation; unknown outcome remains parent recovery-controlled, with no automatic resubmit.
- Mainnet scope alone no longer counts as provenance. sourceObservationId is captured in server proposal and confirmation extra fields cannot replace it. Enqueue uses durable history, requires the source observation, simple shape, counterparty, nonfailed status, and exact chain/wallet/counterparty/coin/direction. Source event parent is deduplicated. Content has inputRef to source transaction; transient sourceObservationId is removed from validated event payload.
- Source must already exist in replayed durable state; pending source cannot activate a rule. PG enqueue first rejects another pending event; this avoids using all-history rows containing unfinished events.
- New input preview includes hash and server previewToken; record uses that token/version. Already recorded input is labelled historical in UI. Revocation changes future classification only and retains original decision plus explicit correction.
- Rules display comes from server durable projection, including a newly logged-in session. Remote manifest check is explicitly read-only, does not replace projection, and is not described as independent-process cold restore.
- No production synthetic switch or modification of main.ts simpleTransferVerified=false. Real supported-transfer verification remains an external/core unfinished gate.

## Independent execution
./node_modules/.bin/vitest run tests/server/operator-source.test.ts tests/web/operator-rule.test.ts tests/web/operator-recovery.test.ts
Exit 0, 3 files / 5 tests passed, Node v24.22.1. This run uses synthetic provider-shaped fixtures, mocked fetch/injected store/Fastify HTTP, not mainnet or a browser.
Tests include absent/pending source; each identity mismatch; complex/null-counterparty/failed source; replacement fields on confirm ignored; positive synthetic mainnet-shaped provenance; explicit input bounds; stable key and scoped reconciliation. Source test positive case is clearly synthetic despite recorded_live-shaped fields, and cannot count toward live integration.

## Limitations / next verification
Real React/browser interaction is NOT_RUN here, including pending state transitions, busy fieldset, scope edit -> new preview, record -> revoke -> independent new input, refresh/relogin, unknown response recovery, and narrow widths. Actual PostgreSQL full-suite results belong to writer logs and were not independently rerun in this review. Full consumer validation, real Tatum query, real Walrus memories/cold restore and public submission remain unverified.
Mainnet memory count stays 0. Argon DNS remains separately blocked; this report does not substitute an invented Argon result.

## Source identity (SHA256)
619bbf3c55c03fe907dded4841f422671bc589fe72ec3a5e7c75eafc473bfc53 src/web/OperatorMemory.tsx
831a1b2b3f2544bb607e047f9b3b31c8a1cd36112c9f2816150dfdacf54d04ed src/web/operator-rule.ts
d6fedf8f25b10926a4e8d0357257b2a0d402d60f98cbacb7454c6eeb74559e2c src/web/Operator.tsx
216efee1430a73ba62b0f03cb43b2e307ad3ed5ffaaf5eb865ca5f3432b3e25e src/server/app.ts
cc72592a63c2e077b2be00dcc7836c4d94bc0d4d2e98c02a497796866e301ee5 tests/server/operator-source.test.ts

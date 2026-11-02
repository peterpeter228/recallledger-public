# RecallLedger implementation acceptance · 2026-10-26

**Result: private runnable local candidate; NOT competition-ready.**

## Implemented and actually checked

- Restored all 22 handoff files with exact byte counts and SHA-256 checks before implementation.
- Deterministic, validated, browser-safe domain engine: exact atomic amounts, scoped user-confirmed rules, explicit corrections, refund association/caps, revocation without rewriting history.
- Twelve-event synthetic scenario: Tools total 49 → 24 → 12. Fixed-input memory-on/off comparisons; out-of-scope inputs remain unknown.
- Fastify APIs and PostgreSQL durable outbox: request idempotency, version checks, one pending mutation per scope, continuous durable prefix, leases, unknown submission quarantine, bounded polling and write limits.
- Actual PostgreSQL 18.4 integration and independent-process checks, not an in-memory database substituted for PostgreSQL.
- Official MemWal/Sui SDK types compiled; fake-provider fault tests cover status/readback and exact manifest recovery. These tests do NOT establish authenticated provider availability.
- English React interface and compiled Node server build. Actual HTTP smoke against the built server: HTML 200, health 200, same-origin sandbox session 200, unauthenticated real write 401.
- Final patched local checkpoint: 51 tests / nine files, no skips with actual PostgreSQL 18.4; build passed. Logs: evidence/browser-cua/validation-fix/. Test count is NOT the 32-case specification coverage count. See evidence/case-results.json for per-case PASS_LOCAL/PARTIAL/BLOCKED/NOT_RUN.
- Clean temporary source copy install with frozen pnpm lockfile, frontend/backend build, doctor and seed dry-run succeeded. Later CLI hardening is separately retested.

## Reviews and corrections

Independent reproductions found preview-vs-record inconsistency, proposal retry after expiry, frozen demo time leaking into operator classification, and failure to load persisted observations in a new operator session. Corrected behavior was exercised in regression tests. One stale test-double error during integration was fixed without weakening its assertions; the failure log is retained.

One user-approved external Argon request completed HTTP 200. Requested alias was gemini-4-argon-high; the response did not identify its backend version. Four model P0/P1 allegations were unproven or contradicted by the submitted source; they are not reported as confirmed vulnerabilities. Bounded polling/backoff was still implemented as an operational requirement and tested. See review/ARGON_VERIFICATION_2026-10-26.md.

## Remaining blockers, not passes

1. **Browser local gate now passed within recorded scope:** existing cloud Chromium reached the server running in the native cloud terminal. Actual 12-step synthetic workflow, pending-state gating, 49→24→12, unknown E25, revocation, evidence modal, fixed-input replay and local fixture restore were exercised. A concrete invalid-scope UI error was fixed and retested. Representative real interactions at 375/768/1440 used a normal same-origin iframe, not DevTools, physical phones, or all 12 steps at every width. Remote failure/conflict/rate-limit UI paths remain untested. Prior network/launch/policy failures remain historical records. See evidence/browser-cua/core-results.json and validation-fix-and-responsive-results.json.
2. **Tatum:** no dedicated authorized credential or designated live transaction supplied. Public discovery and SDK types do not prove an authenticated query.
3. **Walrus:** no dedicated account/delegate configuration or scoped mainnet write approval. Actual mainnet memory count is **0**. Local/fake-remote restore does not prove remote cold recovery.
4. **Application model:** no independently authorized application API credential. Manual correction UI is explicit; there is no fake AI response.
5. **Deployment/publication:** private GitHub candidate exists; no hosted public demo, public source license/repository, published blog, publicly hosted video or competition submission. A real local 180-second core-flow recording was delivered privately; it is not live-integration proof.
6. **Trial:** no external user study or measured real-user saving/profitability evidence.

## Evidence interpretation

All business examples are synthetic TEST_USDC, not real customers or actual financial transactions. Memory receipt IDs in test doubles are clearly fixture identifiers. No wallet was signed, no funds moved, no mainnet memory written, and no form submitted.

The Render file is schema-validated preparation, not a deployment. The free demo candidate has no PostgreSQL resource and cannot substitute for durable operator acceptance. Public exposure, resources, credentials and submission remain explicit next-stage decisions.

## Video and code identity

The actual continuous 180-second recording in `evidence/video/RecallLedger_Core_Correction_180s.mp4` shows M05–M10, including 49→24→12. M01–M04 were preloaded; M11/M12 were clicked after recording ended and are not claimed as filmed. Optional English captions, no audio; no generated UI frames, speed-up or fabricated receipts. Metadata and exact SHA-256: `evidence/video/metadata.json`. The first blocked/static recording was rejected as a demo and is not delivered.

Tested source is baseline `11d2af35ce9bb665a0f3de3d695582c237020825` plus the Composer validation patch and regression tests. Exact tested source/build hashes are retained. The containing checkpoint commit identifies the integrated source; no self-referential SHA is invented. The external Argon review predates this patch; no new Argon call was made.

## Next action

Obtain dedicated, securely configured provider access and scoped live verification permissions, then authenticate read-only integration before any separately approved Mainnet writes. Public release and submission remain separate decisions. See docs/OWNER_HANDOFF.md.

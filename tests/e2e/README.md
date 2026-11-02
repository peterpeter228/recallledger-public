# Prepared browser acceptance — NOT RUN

The flow under test is: recorded Inbox → isolated fixture teaching session → twelve explicitly confirmed/pending/completed changes → correction/refund/revocation → Memory/Evidence → identical-input Replay → responsive/error recovery checks.

Cloud `cua` navigation failed with `ERR_CONNECTION_REFUSED`; the service also was unreachable from later terminal invocations. Binding the resulting Chrome error-page URL was denied by browser protocol policy. No page UI was tested and no restriction was bypassed. Regular Playwright execution awaits **explicit user approval**. Syntax checking this file is not browser validation.

## Only after approval

From repository root, first build the compiled server and web using the repository's current build scripts. The script expects `dist/server/main.js`, `dist/web`, official `@playwright/test`, and `/usr/bin/chromium`.

```sh
RECALLLEDGER_BROWSER_FALLBACK_APPROVED=yes node tests/e2e/browser-acceptance.mjs
```

The single script spawns server and Chromium in the same execution environment. It uses an allowlisted child environment, no DB/token/provider keys, and `ALLOW_MAINNET_MEMORY_WRITES=false`. It cleans up both. Do not point it at a production service. A pre-existing server on port 3000 must be stopped first; this script is only intended for its own isolated fixture server.

Optional original Playwright video (actual interaction footage, not a screenshot montage):

```sh
RECALLLEDGER_BROWSER_FALLBACK_APPROVED=yes RECORD_VIDEO=yes DEMO_HOLD_MS=5000 node tests/e2e/browser-acceptance.mjs
```

Screenshot holds plus real interaction time provide an approximately three-minute walkthrough; duration must be measured, not claimed in advance. Playwright's native recording may require its official FFmpeg runtime. If unavailable, report video blocked; do not substitute a fake recording.

Evidence writes under `evidence/browser/playwright/`: timestamped results with assertions, console/page errors, actual viewport sizes and screenshots, bundle filenames, server output, optional WebM. Screenshots are full-page at a recorded 375/768/1440 CSS-pixel viewport and do not pretend the image pixel width alone proves responsive behavior.

## Assertions vs remaining gaps

The script asserts disabled confirmation, pending non-effect, exact version increments, edited label/scope, 49→24→12 Tools totals, final unknown25, linked refund target B, modal focus/clipboard/Escape, 12 timeline items, same input hashes and expected classifications for B/E at M04/M08/M12, no horizontal overflow, and a deliberately aborted local read followed by user retry. It fails fast, preserving the earliest failure in results. A double-click is an actual interaction stress test, not proof of general distributed idempotency.

Unsupported, rate-limited, conflicting, incomplete restore and failed remote outbox states have no fixture UI entrypoint and remain BLOCKED; API unit/integration tests are different evidence. Current Replay presents both memory conditions simultaneously rather than a literal toggle; report that deviation rather than inventing a clicked switch. No mainnet test is performed.

Prepared selectors are source-grounded but still unexecuted. Any runtime mismatch must be diagnosed from actual screenshots/DOM before changing assertions. No `test:e2e` execution is included in CI or offline verification until approved.

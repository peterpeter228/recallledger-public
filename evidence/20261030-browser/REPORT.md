# RecallLedger — scoped real browser acceptance, 2026-10-30

Run ID: recallledger-browser-20261030T111322Z. Tested application baseline: `3f8a82bdd3a56b4939820772718ce2ff2983e8a2`. Main unchanged on reads at 11:13 and 11:24 UTC. No production application source changed. Historical binary tree must be preserved.

## Executed, not inferred

Supported cloud desktop Terminal launched `bash tests/e2e/start-public-synthetic.sh`; existing Chromium accessed loopback 3100 in the same desktop network context. Ordinary executor localhost is isolated; no new Chromium, policy changes or public tunnel used. Browser actions ran 11:14–11:21 UTC. Node24.22.1 / pnpm11.25.0; build SHA256 in `build-sha256.txt`.

| Check | Result | Actual observation / evidence |
|---|---|---|
| Anonymous page and operator | PASS scoped | Real UI rendered; operator authentication/durable persistence unavailable; public scenario distinct (`ui/01-initial.*`, `02-operator-unavailable.txt`) |
| Twelve reviewed synthetic events | PASS | Every event explicitly reviewed, prepared, then fixture job completed; each pending snapshot retained as `M01-pending.txt` through `M12-pending.txt` |
| Confirmation and bounds | PASS | Changing purpose cleared consent; empty maximum and decimal atomic maximum disabled confirmation; no invalid event advanced |
| Correction and explicit refund | PASS | Tools expense49→24→12 TEST_USDC; refund target B selected explicitly; incoming transfer not automatically expense/refund |
| Scope and revocation | PASS | Narrow rule excludes E25; M12 active rules0; historical classifications retained |
| Memory | PASS synthetic only |12 events, v1 superseded/v2 revoked; all synthetic |
| Fixture restoration | PASS local only |12/12 ephemeral events, hash21d600f6aa892391eb9f9e6382eab98e060e0d17e071ea2b73fe1f9225043754; `remoteRestoreVerified:false` |
| Fixed-input replay | PASS | B/M04 without memory needs_context versus expense with memory; M12 both need context. E/M08 amount_above_maximum. Same-input hashes unchanged |
| Evidence export and modal | PASS clipboard only |934-character synthetic evidence copied and read back; Escape closes and returns focus. No download feature in this scope |
| Reload and leave/restart | PASS ephemeral contract | Reload returns recorded read-only scenario, NOT saved custom sandbox; fresh sandbox0/12 and Leave sandbox returns read-only |
| Narrow responsive interaction | PASS scoped | Ordinary browser zoom300%, actual396×253 CSS, document391px wide; Replay selectors and Evidence modal actionable. Not exact375 or physical mobile. Restored100%1189×761 |
| Console sample | LIMITED | Last100 warnings/errors were extension metadata errors; no app-origin errors in captured sample. Not a complete network/error trace |
| Protected operator workflow | DEFERRED | User requested login-free first. No token entered, cookie injected or automatic login; backend tests do not close this browser gap |
| Mainnet / cold process restore / real provider | NOT_TESTED | No provider credentials used;0 actual mainnet memories |

Screenshots visually reviewed: initial desktop clean hierarchy; completed12/12 scenario and synthetic labels visible; narrow layout stacks navigation and headings without horizontal overflow. Full-height narrow screenshot retained. No user financial data or secret values in artifacts.

## Separate backend evidence

Fresh full build exit0. Real isolated PostgreSQL18.4 suite60 passed /13 files /0 skips (`tests-with-pg.log`); no-PG baseline48 passed/12 skips; protocol32 passed. Synthetic HTTP fault/recovery suite11/11 (`http-results.json`, `realBrowser:false`). These are not operator browser PASS.

PG18.4 reproduces the repository's historical fixture, not a recommended current production release. Official versioning lists18.6 and its security fixes: https://www.postgresql.org/support/versioning/ and https://www.postgresql.org/docs/release/18.6/ . Independent software package integrity and wrapper license recorded in PREPARED.md / pg-tool-lock.json. Official source hash verified, source build stopped at missing bison; actual tests used embedded package binary, not a claimed source build. No dependency/production database upgrade performed.

## Failures and limits

First temporary PG launcher attempt logged into the empty data directory and initdb refused; corrected log location, then actual suites passed. An attempted click on the intentionally disabled invalid-bound confirm timed out; it was an expected disabled safety state, not success. Two native terminal text entry methods rejected before input; documented typeCharacters worked. No blocked browser execution workaround used.

No full cross-browser matrix, physical device, exact375px viewport, forced network fault UI, authenticated operator clicks or independent live cold restore. Original temporary public teaching state is intentionally ephemeral. Public synthetic completion is not competition eligibility or production readiness.

## Cleanup and next step

Owned tab25 closed and zoom restored100%. At11:23 UTC Ctrl-C stopped owned public service; same-desktop curl127.0.0.1:3100 failed connection with exit7. PG fixture servers already cleanly stopped; temporary databases removed after evidence collection. No mainnet/production/provider writes, external outreach, fees, deployment or public release.

Next: review this private draft PR; when authenticated testing is in scope, execute existing operator UI rule→new input→correction/revoke→new session with a supported credential handoff. Until then mark operator browser DEFERRED. No automatic merge.

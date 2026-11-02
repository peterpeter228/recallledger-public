# Secret and PII scan

- Status: **CLEAN**; exit code: **0**.
- Generated: 2026-11-02T08:20:07.777Z.
- Findings: 0; incomplete conditions: 0.
- Credential environment names considered: 15. Values are compared in memory only, never reported.
- No provider calls, credential-file reads, Git modifications or history rewrites are performed.
- JSON: selected job directory / secret-scan.json. This report and that JSON are excluded from worktree content only, never from history.
- Usage: `node scripts/secret-scan.mjs [--job-dir DIRECTORY]`.
- Job directory precedence: `--job-dir`, `OMP_JOB_DIR`, then `<OS temporary directory>/recallledger-secret-scan` (works without job environment variables).

## Scope and counts

- historyCommits: 1.
- historyLines: 49029.
- localRefs: 1.
- annotatedTags: 0.
- worktreeFiles: 338.
- worktreeSymlinks: 0.
- deletedTrackedFiles: 0.
- excludedReports: 1.

## Findings (no matched content)

| Rule | Environment name | Scope | Commit/object | File/ref | Line | Section | History stream line |
| --- | --- | --- | --- | --- | --- | --- | --- |

No findings were recorded; a clean verdict requires complete scan coverage.

## Incomplete conditions

None recorded.

## Credential environment names

- DBUS_SESSION_BUS_ADDRESS
- EXA_API_KEY
- MEMWAL_AGENT_PUBLIC_KEY
- MEMWAL_PRIVATE_KEY
- OPENAI_API_KEY
- OPERATOR_BOOTSTRAP_SECRET
- PASSION8_API_KEY
- PI_SESSION_FILE
- PI_SESSION_ID
- SUB2API_API_KEY
- SUB2API_OAUTH_API_KEY
- TATUM_API_KEY
- TATUM_TESTNET_API_KEY
- TYPESAFE_API_KEY
- ZENMUX_API_KEY

## Exact scoped allowlist

Values are omitted. Each exception is loaded from scripts/secret-scan-allowlist.json and constrained by its rule, exact paths and optional sections. Current environment matches always remain findings. See scripts/SECRET_SCAN.md for the format and review requirements.

- release-github-noreply (github-noreply, pii-email): User-required public release Git identity RecallLedger; GitHub noreply routing address, not a private contact address. Null path permits only commit/tag metadata. Applicable matches: 4.
- mainnet-public-owner (public-onchain, assigned-credential-literal): Public Sui ownerAddress recorded in evidence/mainnet-manifest.json and evidence/frozen-manifest.json. An address is not signing authority; this entry cannot waive private/secret-field assignments. Applicable matches: 0.
- mainnet-public-M01 (public-onchain, assigned-credential-literal): Public Walrus blobId for teaching event M01, recorded in evidence/mainnet-manifest.json. It identifies public stored content, not an access credential. Applicable matches: 0.
- mainnet-public-M02 (public-onchain, assigned-credential-literal): Public Walrus blobId for teaching event M02, recorded in evidence/mainnet-manifest.json. It identifies public stored content, not an access credential. Applicable matches: 0.
- mainnet-public-M03 (public-onchain, assigned-credential-literal): Public Walrus blobId for teaching event M03, recorded in evidence/mainnet-manifest.json. It identifies public stored content, not an access credential. Applicable matches: 0.
- mainnet-public-M04 (public-onchain, assigned-credential-literal): Public Walrus blobId for teaching event M04, recorded in evidence/mainnet-manifest.json. It identifies public stored content, not an access credential. Applicable matches: 0.
- mainnet-public-M05 (public-onchain, assigned-credential-literal): Public Walrus blobId for teaching event M05, recorded in evidence/mainnet-manifest.json. It identifies public stored content, not an access credential. Applicable matches: 0.
- mainnet-public-M06 (public-onchain, assigned-credential-literal): Public Walrus blobId for teaching event M06, recorded in evidence/mainnet-manifest.json. It identifies public stored content, not an access credential. Applicable matches: 0.
- mainnet-public-M07 (public-onchain, assigned-credential-literal): Public Walrus blobId for teaching event M07, recorded in evidence/mainnet-manifest.json. It identifies public stored content, not an access credential. Applicable matches: 0.
- mainnet-public-M08 (public-onchain, assigned-credential-literal): Public Walrus blobId for teaching event M08, recorded in evidence/mainnet-manifest.json. It identifies public stored content, not an access credential. Applicable matches: 0.
- mainnet-public-M09 (public-onchain, assigned-credential-literal): Public Walrus blobId for teaching event M09, recorded in evidence/mainnet-manifest.json. It identifies public stored content, not an access credential. Applicable matches: 0.
- mainnet-public-M10 (public-onchain, assigned-credential-literal): Public Walrus blobId for teaching event M10, recorded in evidence/mainnet-manifest.json. It identifies public stored content, not an access credential. Applicable matches: 0.
- mainnet-public-M11 (public-onchain, assigned-credential-literal): Public Walrus blobId for teaching event M11, recorded in evidence/mainnet-manifest.json. It identifies public stored content, not an access credential. Applicable matches: 0.
- mainnet-public-M12 (public-onchain, assigned-credential-literal): Public Walrus blobId for teaching event M12, recorded in evidence/mainnet-manifest.json. It identifies public stored content, not an access credential. Applicable matches: 0.
- synthetic-http-error-sentinel (synthetic-fixture, assigned-credential-literal): Deterministic fake error sentinel in acceptance test F07/A04. Constructed solely to prove provider errors and frontend bundles do not expose supplied messages; never issued by a provider or used as an access credential. Applicable matches: 2.
- synthetic-http-idempotency-key (synthetic-fixture, assigned-credential-literal): Public deterministic idempotency key for the loopback synthetic HTTP fault/recovery harness. It identifies a disposable test operation and is not an authentication credential. Applicable matches: 2.
- synthetic-loopback-postgres-role (synthetic-fixture, url-embedded-credential): Password-free disposable local PostgreSQL test-role URI prefix. Harness restricts the destination to loopback and fixed test port; launcher initializes isolated trust-auth test data. Documentation describes the same synthetic role, not a deployed database credential. Applicable matches: 7.

## Interpretation and limitations

- Offline heuristic review, not proof of absence. Unknown credential formats, obfuscated/encoded/encrypted values and Unicode/obfuscated PII can escape shape detection.
- Exact matching covers credential-like environment names and credentials embedded in environment URLs, including JSON-escaped variants. Unset environment credentials cannot be compared. Short/shared current values can cause false positives.
- History includes all locally reachable commits with root and per-parent merge patches, removed/context lines, raw author/committer/message metadata, notes, ref names and annotated tags. No history path exclusions; old reports remain in scope.
- Reflog-only/dangling objects, remote refs not present locally, Git LFS payloads, archive contents and submodule repositories are not traversed. Missing objects, shallow history, unsupported tree refs and encountered submodule entries make the result incomplete.
- Worktree uses git ls-files --cached --others --exclude-standard. Gitignore excludes untracked files only; tracked ignored files are scanned. Ignored untracked credential files, node_modules and generated dist are outside this source-worktree scope.
- Only the two selected generated report files and existing hard-link aliases are excluded from worktree content to prevent recursion. Their previous Git history is never excluded.
- Symlink link text is scanned without following it. A tracked path with a symlinked ancestor is refused and makes worktree coverage incomplete; it is never opened through that ancestor. UTF-8 plaintext in binary files is scanned, but arbitrary binary encodings and non-UTF-8 path names are not supported; unsupported path names make the scan incomplete.
- No content snapshot is taken: do not edit files or refs during a scan. Findings are deduplicated per rule/environment/location, not per secret. Shape windows are bounded; extremely long shaped literals still require human review.
- The committed scripts/secret-scan-allowlist.json permits only exact value/rule/path exceptions with per-entry justification: synthetic fixture credentials, public on-chain identifiers in public fields, GitHub noreply identities and organizer emails with a published HTTPS source. No exact environment match, phone number or absolute home path is waivable. The allowlist file itself remains scanned. Single-quoted scoped npm package labels in pnpm-lock.yaml keys/list items are syntax, not emails.
- Finding/error storage is capped; overflow makes the result incomplete (exit 2), never clean. History and worktree content are streamed with bounded overlap rather than buffered in full.

If a finding is a real current credential leak, stop publication and have the owner rotate/revoke it. Do not rewrite history or treat an incomplete scan as clearance.

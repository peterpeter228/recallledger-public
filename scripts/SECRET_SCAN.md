# Offline secret scanner

Run `node scripts/secret-scan.mjs [--job-dir DIRECTORY]` from the repository or a subdirectory. The scanner makes no provider calls and does not change Git refs. It scans all locally reachable commit patches, raw commit and annotated-tag metadata, local ref names, and tracked/untracked source-worktree paths. Gitignore excludes only untracked files; tracked ignored files remain in scope. No dotenv files are loaded into the process environment.

The JSON report is `secret-scan.json` in `--job-dir`, otherwise `OMP_JOB_DIR`, otherwise the OS temporary directory's `recallledger-secret-scan` directory. The generated Markdown report is `submission/SECRET_SCAN.md`. Only those generated report files and existing hard-link aliases are excluded from current worktree content; their history is still scanned. This guide is not a generated report.

| Exit | Meaning |
| --- | --- |
| 0 | Complete scan with no findings |
| 1 | Complete scan with findings |
| 2 | Incomplete coverage, invalid configuration, or report failure; never clearance |

Reports contain rule names, environment variable names, locations and counts, never matched values. Location and justification fields that themselves resemble credentials or PII are redacted. Environment credentials are compared in memory, including JSON-escaped values and credentials extracted from environment URLs. An exact current-environment match is always a finding, even if another rule permits the same value at that location.

## Exact scoped allowlist

The scanner requires `scripts/secret-scan-allowlist.json` in the scanned worktree. Missing, malformed, unsupported or symlinked configuration makes the scan incomplete. The file is scanned as ordinary source content in both history and worktree; it is not a blanket exclusion.

The file has `schemaVersion: 1` and an `entries` array. Each entry has:

- `id`: unique, stable label, beginning with a letter and containing only letters, digits, dots, underscores or hyphens; at most 80 characters.
- `kind`: one of the four kinds below.
- `value`: the exact synthetic/public string; not a regex, prefix or substring waiver. For `assigned-credential-literal`, use the trimmed literal without the assignment name or quotes. For shape rules, use the complete matched shape (including a synthetic authorization scheme, URL credential prefix or query parameter prefix where the rule includes it). Never put an actual credential or a private personal email in this file.
- `rule`: exactly one scanner rule. Different rules require separate entries, even for the same value.
- `paths`: a nonempty array of exact repository-relative file paths. No wildcards, directory exclusions, absolute paths or parent traversal. Each path applies in both worktree and history; history is never globally waived.
- `reason`: an individual, reviewable justification establishing synthetic construction or public provenance. “Test”, “example” or “false positive” alone is not evidence.
- `sections` (optional): a nonempty list restricting the entry further, for example `file-content`, `added`, `removed`, `context-old`, `context-new`, `commit-metadata` or `tag-metadata`.
- `source` (required for organizer emails, optional otherwise): the official published HTTPS source establishing that the email is an organizer contact. Do not use a private directory, inferred address or personal contact record as provenance.

Kinds and boundaries:

| Kind | Permitted rules | Additional restriction |
| --- | --- | --- |
| `synthetic-fixture` | `assigned-credential-literal` or credential-shape rules except `private-key-pem` | Exact deterministic fixture value with construction/provenance in the reason; cannot waive any PII rule or a generic private-key header. |
| `public-onchain` | `assigned-credential-literal` | Only an explicitly public assignment field such as `public_key`, never a private/secret-field assignment. Existing entries cite the public mainnet evidence files individually. |
| `github-noreply` | `pii-email` | Only a GitHub users.noreply address. The committed release identity entry is user-authorized. |
| `public-organizer-email` | `pii-email` | Exact publicly published organizer contact plus an official HTTPS `source` and a reason. Not a general public-email or private-PII waiver. |

For the two email kinds only, a `null` item in `paths` permits an otherwise matching value in pathless historical commit/tag metadata. It does not waive ref names, arbitrary blobs or file content. File occurrences still require their exact paths.

If the allowlist's own representation triggers a credential-shape rule, explicitly include `scripts/secret-scan-allowlist.json` in that entry's `paths` and justify the value itself. The scanner does not add this permission automatically. This cannot suppress an exact current-environment match in the allowlist or anywhere else. Phone numbers, absolute home paths and generic private-key PEM headers are never waivable; a shared header alone cannot prove that the following key material is synthetic.

Example of the shape for a demonstrably synthetic assignment (replace the value and paths only after review):

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "id": "deterministic-fixture-assignment",
      "kind": "synthetic-fixture",
      "value": "EXACT_DETERMINISTIC_FIXTURE_VALUE_ONLY",
      "rule": "assigned-credential-literal",
      "paths": ["tests/fixtures/reviewed-input.txt"],
      "reason": "Constructed offline by the named fixture generator; never issued by a provider or accepted by a service."
    }
  ]
}
```

The allowlist is reviewed source, not an automatic finding-to-waiver generator. Adding a label or a reason does not establish that an unknown value is safe. Unknown real-credential/PII findings must be removed from the export or escalated, not reclassified as synthetic. Re-run the final export scan after the final source and allowlist are fixed; no files or refs should change during that scan.

## Filesystem and syntax boundaries

A slash-prefixed unquoted base64-like credential assignment remains a literal candidate; a slash alone is not evidence of a path/reference expression. Recognizable credential prefixes and exact environment matches are checked independently.

Symlink link text is scanned without opening its target. For each source path, existing ancestor components are checked before the leaf is accessed. A tracked descendant of a symlinked directory records `WORKTREE_SYMLINKED_ANCESTOR_NOT_SCANNED` and makes worktree coverage incomplete instead of reading outside the worktree. The allowlist is subject to the same ancestor check and is opened without following a leaf symlink. Concurrent filesystem/ref changes are unsupported; the scan is not an atomic snapshot.

Single-quoted scoped npm package labels in `pnpm-lock.yaml` YAML keys/list items are recognized as package syntax, not email addresses. This is a syntax-specific check, not an email allowlist or file exclusion. Ordinary email text in that lockfile, the same package-looking text elsewhere, and all exact current-environment matches remain subject to detection.

## Focused offline regressions

Run `node --test tests/secret-scan.test.mjs`. To retain names-only evidence, set `SCANNER_REPAIR_RECORD` to the desired `scanner-repair.json` path. This suite invokes the real scanner on disposable local Git repositories with a fixed public noreply identity; it creates fixture-only commit objects and never touches product refs or scans the private product history. Temporary repositories and outside-target sentinels are removed when each case ends.

Coverage includes slash-prefixed literals in history and worktree, refusal of a tracked symlink ancestor with unchanged outside-target access time, clean exact synthetic exceptions, unwaivable active-environment matches, exact path/value/rule boundaries, scanning of the allowlist itself, public/private assignment separation, rejected PII waivers, and lockfile package syntax without losing email detection. Synthetic email test inputs are assembled at runtime rather than committed as mailbox literals.

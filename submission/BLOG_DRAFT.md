# What it does

RecallLedger lets a user explain a Sui transfer once without making that explanation an unlimited rule. It separates transaction facts from purpose: an unexplained transfer stays `needs_context`, while a confirmed, bounded rule can classify a later matching item. The user can correct one item, narrow the rule separately, or revoke it so future decisions ask again.

**SYNTHETIC TEACHING DATA:** this financial story is not real user transactions or customer feedback. The twelve teaching memories have recorded Walrus Mainnet verification and fresh remote restore; the business examples and their storage are separate claims.

| Lifecycle case | Recorded result | Interpretation |
|---|---|---|
| Reuse — B at M04 | Memory off: `needs_context`. Memory on: `classification:expense`, `category:tools`. | The confirmed rule classifies the same input. |
| Narrowing — E at M08, versus E at M04 | At M08, both off and on are `needs_context`; the on result includes `amount_above_maximum`. At M04, E with memory on is `expense`, category `tools`. | The revised rule excludes E. The M08 off/on pair is not a classification flip. |
| Refund — D→B at M10 | The replay row records an explicit link with `amountAtomic:"12000000"` and `status:"active"`. | This is a refund relationship, not a paired memory-off/on ablation. |
| Revocation — F-preview at M12 | Both off and on are `needs_context` after revocation. | The fixture has no B/M12 row. The older browser B/M12 comparison is distinct from this F-preview pair. |

Labeling one item and confirming a future rule are separate actions. Future reuse has an explicit recipient, asset, direction, amount interval and validity. In the teaching story, a 25-unit reimbursement correction affects only that item. Narrowing the tools rule from 5–30 to 5–20 requires another confirmation; it is not inferred from the correction.

To explore the local demo, choose **Replay the correction**, label the synthetic item, then review and confirm the full future-rule scope. Pending changes remain inactive. **Complete fixture job** is a local simulation, not a Walrus receipt; **Check fixture restoration** is local replay, not the recorded fresh remote restore. State is page-local: reload loses it and another tab starts empty. The recorded evidence view shows saved verification, not a current provider query. **The demo cannot write; Mainnet writes happen only from the separately authorized operator host.** Local setup is in the [README](../README.md#run-the-local-demo-without-credentials).

# How it uses Tatum + Walrus

**One successful read-only Tatum Sui gRPC call is recorded** for public digest `J91TcZuhTUphac9wS1TL2uCE3mNCafmbCmyLK3euayEq` at `2026-11-02T15:42:20.589+08:00`. The receipt reports transaction success at checkpoint `340709151`. This is a transaction lookup, not a per-transfer operator learning loop: that loop was not run under owner 1B. Neither this read nor teaching storage certifies competition eligibility or the sufficiency of relevant Tatum use.

The implemented Tatum read adapter binds normalized Sui transaction evidence to transaction commands and object types from the same response. Its supported single-transfer proof checks structure, not spending purpose; unsupported shapes fail closed. Even a structurally supported transfer still needs user context or a confirmed matching rule before it becomes a tools expense.

Walrus stores the confirmed teaching history. The recorded run wrote **12 synthetic teaching memories, M01–M12, on Mainnet**. Reconciliation records twelve done operations and no unresolved operations. Exact-set and content-hash verification succeeded, and a fresh remote restore through the Walrus relayer reports `verified`, count twelve. These are teaching-scope storage and recovery results, not a real-transfer learning loop or a guarantee of present availability. Timestamps, artifact identities and source records are in the final section.

# How it learned over time

“Learning” means replaying confirmed policy events, not training model weights. The paired comparisons hold transaction facts and evaluation time constant and add no memories. The four lifecycle cases above come from the saved [fixture evaluation](../evidence/fixture-evaluation.json).


**This evidence differs from “four flips.”** It combines a changed decision, scope and revocation boundaries that still ask for context, and an explicit refund link. An incoming transfer does not inherit the outgoing expense rule: the teaching replay leaves D unresolved before the refund link is confirmed. The local replay's final state hash matches the recorded remote restore hash. That connects the saved teaching history to its reconstructed policy state; it does not establish real-user accuracy or successful live Tatum interpretation.

# Audit & Provenance

## Checkpoints and scope

This is an **unpublished, unsigned review copy**, not a published or submitted release. Application source checkpoint: `d2db0dac27ceaed9c7fd22a0e7b7f18e2b11cabc`; WP6a evidence checkpoint: `3858aadfcecfb37b2c5cad2b626283298587ff52`. These identify source and evidence, not an approved release. The containing private WP6b commit binds the current pack without embedding its own hash; it is not a public release or deployment identifier. Provenance: `evidence/acceptance.json` (`codeCommit`, `wp6aTeaching20261102`, latest job under `wp6bFinal`).

Owner request **t209u1B** selected the teaching set and **no real-transfer operator loop**, superseding the older conditional real-loop plan. That restriction remains after **t211u Q15=A** authorized exactly one read-only probe. See `historical private artifact omitted from public export` and `evidence/acceptance.json` (`wp6bFinal`). No A/B transfer demonstration or live operator-loop success is inferred.

## Evidence map and recorded identities

- Product behavior and synthetic scope: `evidence/fixture-evaluation.json` (`providerMode:synthetic_local`, `rows`, `ablation`, `summary.refundLinks`, `localReplayHash`, `limits`); `fixtures/demo-sequence.json` (M03/M04 separate confirmations, M06–M08 correction and narrowing, M12 revocation); `evidence/browser-cua/core-results.json` (`passed`). The fixture file is a teaching plan, not a Mainnet receipt.
- Fixed-input pairs: `evidence/fixture-evaluation.json` (`inputHash`, `decision.evaluatedAt`, `memoryEventsAdded:0`). B/M04 uses input hash `68cb9d42a26e175914bccffe5ecf0c9e0baaaa9acb003fc8fdf4cef753c34cd3`. E/M04 and E/M08 share their input hash; the F-preview/M12 pair is not the older browser's B/M12 case.
- Demo boundaries: `evidence/acceptance.json` (`offlineExecution20261102.wp4`, `wp6b` health/evidence acceptance and writes-disabled view). These support local recorded/synthetic behavior, not a new public-platform pass.
- Tatum: [probe receipt](../evidence/tatum-probe-J91TcZuh.json), `ok:true`, requested `2026-11-02T15:42:20.589+08:00`, gRPC method `/sui.rpc.v2.LedgerService/GetTransaction`, checkpoint `340709151`. `httpStatus:null` means the adapter does not expose an HTTP status. `responseSha256:8bd877ab1138a5142de2d79b9dddd18bcb73c9156e0dac95ee724abca4f4cd67` covers RFC 8785 canonical adapter-envelope JSON, including local `fetchedAt`, not raw gRPC wire bytes or a stable chain-content hash. `evidence/live-acceptance.json` records the scoped read; its earlier missing-digest state remains historical in `evidence/acceptance.json` → `wp6aTeaching20261102`. The [structural contract](../evidence/g0/tatum-proof-contract.md) and `offlineExecution20261102.wp2` describe separate offline cases, not extra live requests.
- Walrus writes: `evidence/acceptance.json` (`wp6aTeaching20261102.mainnetWritesPerformed`, `dataOrigin`, `storage`); `evidence/write-reconciliation.json` (12 done operations, no unresolved operations); `evidence/mainnet-manifest.json` (`entries`, `verifiedCount:12`, `exactSet:true`, `hashes:true`, per-event event/text hashes and job/blob locators, verified `2026-11-02T05:45:02.234Z`). These are memory locators, not invented payment/explorer transactions.
- Recovery: `evidence/frozen-manifest.json` is the frozen locator input; `evidence/events-public.json` is the public locator export. `evidence/restore-report.json` records `source:walrus_relayer`, `status:verified`, count 12, checked `2026-11-02T05:45:08.379Z`. Count and restore use manifest version `recallledger-teaching-v1-demo-recallledger-n12` and state hash `b39c667d2a6edb16cf388766fd81c104f4cae8823178790e5da104ff3f883c04`, also the fixture's `localReplayHash`. This is teaching-scope recovery through the relayer, not present availability or a real-transfer restore.

Artifact identities recorded at the WP6a evidence checkpoint:

| Evidence path | File SHA-256 |
|---|---|
| `evidence/write-reconciliation.json` | `75fe4e09e5b2ec6baceb55852e986a3e7a92e8740da96e1b4bad0c0c7f4807c5` |
| `evidence/frozen-manifest.json` | `c023fb57a7d53f676e70c5e8193e2926a93de845d91af80cae990257e280accd` |
| `evidence/mainnet-manifest.json` | `4108866b46a7a4f36ddcebd213132c5ca7df02bc5611bd153e1d45d314f6ea0c` |
| `evidence/restore-report.json` | `79e4312aa145d447c651723362161d428ce5b023635ba66ae9399529d3803903` |

## Browser and media scope

`evidence/acceptance.json` → `offlineExecution20261102.wp4` indexes the historical 21-check synthetic localhost Chrome run. Older `evidence/browser-cua/validation-fix-and-responsive-results.json` checks use representative 375/768/1440 same-origin iframe widths, not physical devices or a full matrix. Screenshot filenames are not proof of completed state: `evidence/browser-cua/screenshot-content-notes.md` identifies pending paint states. Fresh [video captures](../evidence/video-final/capture-manifest.json) and final playback are LOCAL loopback evidence, not a new full WP4 matrix or public-platform acceptance.

The historical 180-second clip shows synthetic **M05–M10**, with M01–M04 preloaded and M11/M12 outside capture. It is silent, with optional English captions, not a Mainnet demonstration or the final narrated video. `evidence/video/metadata.json` records SHA-256 `b44c878096c23e4a4b8cf8cfc8d41ca4623f869973ae45c875324876d108328c`. The Q16-authorized final local video is complete at gitignored `out/recallledger-demo.mp4`: **165.000 seconds / 2:45**, 1920×1080 H.264/AAC with Piper narration, 38 verbatim English burned-in/embedded cues plus `out/recallledger-demo.srt`, 5,406,462 bytes, SHA-256 `c36e8af5a55d48792971ed059695f50b531361e50ee6d9e2b3c585794f7780ba`. The retained [receipt](../evidence/video-final/video-receipt.json), completed `2026-11-02T08:10:48.644189Z`, indexes media inspection and full unmuted 1× local Chrome playback to the end: 4,950 decoded frames, zero drops/errors. Existing evidence and fresh loopback-only screenshots supply the visuals; this is not new Mainnet write footage, subjective listening or remote playback acceptance. Upload remains forbidden here; the public/unlisted URL is pending.

## Publication and owner review

**Public repository:** https://github.com/peterpeter228/recallledger-public (MIT). The older private source repository remains private.

**Working demo preview (recorded-live, writes off):** https://recallledger-public-9i7iiexz8-peterpeter228s-projects.vercel.app

This published page is the external blog URL for judging. Local handler evidence is supplemental.

Blog publication, unlisted video upload, form submission and optional social sharing remain separate pending owner acts. The [ordered checklist](SUBMISSION_CHECKLIST.md) is unsigned/open; nine identity/account answers remain **OWNER-ONLY open**. No final release SHA, export clearance, public readbacks, owner signature or submission receipt is supplied by this pack. Twelve memories and one successful Tatum read support their stated technical scopes, not eligibility certification.


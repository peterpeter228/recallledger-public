# RecallLedger

**Remembers a correction, not just a conversation.** RecallLedger lets a user label a Sui transfer without turning that explanation into an unlimited rule. A separately confirmed rule can classify later matching transfers; narrowing or revoking it makes the assistant ask again where the rule no longer applies.

**SYNTHETIC TEACHING DATA:** the examples below are not real user transactions or customer feedback. Twelve teaching memories, M01–M12, have recorded Walrus Mainnet verification and fresh remote restore; real storage does not make the financial story real.

**One successful read-only Tatum Sui gRPC call is recorded** for `J91TcZuhTUphac9wS1TL2uCE3mNCafmbCmyLK3euayEq` at `2026-11-02T15:42:20.589+08:00`. The [probe receipt](evidence/tatum-probe-J91TcZuh.json) reports transaction success at checkpoint `340709151`. The real-transfer operator loop was not run; this read does not certify competition eligibility.

[Blog](https://peterpeter228.github.io/recallledger-public/) · [Blog source](submission/BLOG_DRAFT.md) · [14 official fields](submission/FORM_FIELDS.md) · [Local video receipt](evidence/video-final/video-receipt.json) · [Storyboard](submission/VIDEO_STORYBOARD.md) · [Narration and captions](submission/VIDEO_NARRATION.md) · [Owner checklist](submission/SUBMISSION_CHECKLIST.md)

## Current publication status — 2026-11-02 10:14 UTC

- **Public repository:** [https://github.com/peterpeter228/recallledger-public](https://github.com/peterpeter228/recallledger-public) (MIT).
- **Published blog:** [https://peterpeter228.github.io/recallledger-public/](https://peterpeter228.github.io/recallledger-public/).
- **Public demo:** [recallledger-public.vercel.app](https://recallledger-public.vercel.app/) — production deployment ready at 2026-11-02 10:10:58 UTC, application source `f4c6c4322511327cdc711abc40d607a61770685e`. Anonymous Inbox, View Evidence, Replay and Memory checks passed. Operator access and writes remain disabled; persistence is not configured.
- **Public video:** [narrated MP4, 165 seconds / 2:45](https://cdn.jsdelivr.net/gh/peterpeter228/recallledger-public@2b86a4d6567afbfd428d818bb8d392fb6ed235fa/docs/recallledger-demo.mp4), also embedded in the blog; browser playback was verified. This is public hosting, not a claim of YouTube/Loom unlisted publication. SHA-256: `c36e8af5a55d48792971ed059695f50b531361e50ee6d9e2b3c585794f7780ba`.
- **Submission:** the owner reported successful form submission at 2026-11-02 09:55 UTC. The submitted field values and independent receipt have not been inspected; this is owner-reported success, not an independently verified receipt or eligibility decision. Do not resubmit.
- **Evidence boundary:** 12 synthetic teaching memories have recorded Mainnet verification at `2026-11-02T05:45:02.234Z` and fresh remote restore at `2026-11-02T05:45:08.379Z`. Public `recorded_live` evidence shows those saved results, not a fresh provider query. One successful read-only Tatum lookup is recorded; no live real-transfer operator learning loop was run.

This status supersedes earlier preparation-only/publication-pending wording. Historical receipts, timestamps and failed runs remain unchanged. Private identity/account answers are deliberately not published; their absence here is not a claim that the owner's submitted form omitted them.

## Four lifecycle cases, not four flips

The saved [fixture evaluation](evidence/fixture-evaluation.json) shows rule reuse, narrowing, an explicit refund relationship and revocation. **This evidence differs from “four flips”:** not every memory-off/on pair changes classification, and the refund is not a paired ablation.

| Lifecycle case | Recorded result | What it establishes |
|---|---|---|
| Reuse — B at M04 | Memory off: `needs_context`. Memory on: `classification:expense`, `category:tools`. | The confirmed rule supplies a decision for the same input. |
| Narrowing — E at M08, versus E at M04 | At M08, both off and on are `needs_context`; the on result includes `amount_above_maximum`. At M04, E with memory on is `expense`, category `tools`. | The revised scope excludes E; the M08 off/on pair is not a flip. |
| Refund — D→B at M10 | The replay row records `amountAtomic:"12000000"`, `status:"active"`. | This is an explicit refund link, not a paired memory-off/on ablation. |
| Revocation — F-preview at M12 | Both off and on are `needs_context` after revocation. | The fixture has no B/M12 row. The older browser B/M12 comparison is separate evidence, not this F-preview pair. |

“Learning” means replaying confirmed policy events, not training model weights. The paired comparisons hold input facts and evaluation time fixed and add no memories.

## Run the local demo without credentials

Use Node **24.22.1** and pnpm **11.25.0**, as pinned in `package.json`. From an accessible checkout, use a clean shell with provider, database, operator and write-enable configuration absent:

```sh
pnpm install --frozen-lockfile
pnpm run build
HOST=127.0.0.1 PORT=3000 APP_BASE_URL=http://127.0.0.1:3000 pnpm start
```

Open `http://127.0.0.1:3000`. This is a local URL, not a deployed preview. Ordinary demo use needs no wallet, API key or database. Do not run remote-write commands to install or inspect the demo.

1. Choose **Replay the correction**. Label one synthetic item, then separately confirm the full future-rule scope.
2. Observe that pending changes remain inactive. **Complete fixture job** is a local simulation, not a Walrus receipt.
3. In **Replay**, compare B at M04 and E at M04/M08 with memory off/on. Inspect the input hash and decision basis. Use the saved evaluation table above for F-preview at M12; do not relabel the browser's B comparison as that fixture case.
4. In **Memory**, inspect rule history and **Check fixture restoration**. That check is local replay, not the separately recorded fresh remote restore.

Sandbox state lasts only in the current page; reload discards it and another tab starts empty. The recorded evidence view is `recorded_live`: it presents the saved verification time, not a current provider query. **The demo cannot write; Mainnet writes happen only from the separately authorized operator host.** See [deployment boundaries](docs/10_DEPLOYMENT_AND_OPERATIONS.md).

## Audit & Provenance

### Checkpoints and scope

The public release and current publication status are listed above. Historical application source checkpoint: `d2db0dac27ceaed9c7fd22a0e7b7f18e2b11cabc`; WP6a evidence checkpoint: `3858aadfcecfb37b2c5cad2b626283298587ff52` (evidence-only, not a deployment SHA). Historical provenance is retained in [evidence/acceptance.json](evidence/acceptance.json), especially `wp6aTeaching20261102` and `wp6bFinal`.

The real-transfer operator loop was **not run**, per owner request **t209u1B**, which remains in force after the separately authorized read-only probe. No per-transfer A/B demonstration or live operator-loop success is inferred. The implemented Tatum adapter and offline structural tests bind transaction commands and object types to the same normalized response; supported structure is not proof of spending purpose, and unsupported shapes fail closed. See [the structural contract](evidence/g0/tatum-proof-contract.md) and `evidence/acceptance.json` → `offlineExecution20261102.wp2`.

### Recorded storage and restore

| Item | Recorded result | Boundary |
|---|---|---|
| Teaching writes | M01–M12; 12 done operations, no unresolved operations in [write-reconciliation.json](evidence/write-reconciliation.json) | Synthetic business content stored on real Mainnet; not live payment observations |
| Verified set | `verifiedCount:12`, `exactSet:true`, `hashes:true`; checked `2026-11-02T05:45:02.234Z` in [mainnet-manifest.json](evidence/mainnet-manifest.json) | Per-event `eventHash`, `textSha256`, job and blob locators are recorded, not invented explorer transactions |
| Fresh remote restore | `status:verified`, source `walrus_relayer`, count 12; checked `2026-11-02T05:45:08.379Z` in [restore-report.json](evidence/restore-report.json) | Teaching scope only, not a real-transfer learning-loop restore or a current availability guarantee |
| Tatum | One successful read-only `/sui.rpc.v2.LedgerService/GetTransaction` call at `2026-11-02T15:42:20.589+08:00`; [receipt](evidence/tatum-probe-J91TcZuh.json) | gRPC adapter exposes no HTTP status (`httpStatus:null`); response SHA-256 covers the canonical adapter envelope, not wire bytes. No real-transfer operator loop or eligibility certification. |

The frozen locator input is [frozen-manifest.json](evidence/frozen-manifest.json); [events-public.json](evidence/events-public.json) contains the public locator export. The count, restore and local fixture replay share manifest state hash `b39c667d2a6edb16cf388766fd81c104f4cae8823178790e5da104ff3f883c04`; the count and restore use version `recallledger-teaching-v1-demo-recallledger-n12`. B/M04's paired input hash is `68cb9d42a26e175914bccffe5ecf0c9e0baaaa9acb003fc8fdf4cef753c34cd3`. These hashes connect the saved artifacts, not real-user accuracy or live Tatum interpretation.

### Browser and media scope

`evidence/acceptance.json` → `offlineExecution20261102.wp4` indexes the historical 21-check synthetic localhost Chrome run and its screenshots. Earlier [core browser results](evidence/browser-cua/core-results.json) include B/M12, distinct from the fixture evaluation's F-preview/M12 pair. [Responsive results](evidence/browser-cua/validation-fix-and-responsive-results.json) cover representative 375/768/1440 same-origin iframe checks, not physical-device or full-matrix coverage. Read [screenshot content notes](evidence/browser-cua/screenshot-content-notes.md): several “completed” filenames actually show pending paint states. The parent health/evidence smoke is indexed under `wp6b`. Fresh [video captures](evidence/video-final/capture-manifest.json) and final playback are LOCAL loopback evidence only, not a new full WP4 matrix or public-platform acceptance.

The historical [180-second video](evidence/video/RecallLedger_Core_Correction_180s.mp4) shows **M05–M10 only**, with M01–M04 preloaded and M11/M12 outside capture. [Metadata](evidence/video/metadata.json) records no audio, optional English captions and SHA-256 `b44c878096c23e4a4b8cf8cfc8d41ca4623f869973ae45c875324876d108328c`. The separate Q16-authorized final local video is complete at gitignored `out/recallledger-demo.mp4`: **165.000 seconds / 2:45**, 1920×1080 H.264/AAC with Piper narration, 38 verbatim English burned-in/embedded cues plus `out/recallledger-demo.srt`, 5,406,462 bytes; SHA-256 `c36e8af5a55d48792971ed059695f50b531361e50ee6d9e2b3c585794f7780ba`. The retained [receipt](evidence/video-final/video-receipt.json), completed `2026-11-02T08:10:48.644189Z`, records media checks and full unmuted 1× local Chrome playback to the end: 4,950 decoded frames, zero drops/errors. This is synthetic/recorded-evidence media, not Mainnet write footage, subjective listening or remote playback acceptance. The later public MP4 and blog player are now available and browser playback was verified; see current status above. The retained local receipt remains a local-run record.

### Publication and owner review

The current public repository, production demo, blog and video are linked above. The original preview remains available at https://recallledger-public-9i7iiexz8-peterpeter228s-projects.vercel.app/ . Owner-reported submission success is distinct from independently inspecting a receipt or submitted answers. See the [current checklist](submission/SUBMISSION_CHECKLIST.md) and [field preparation record](submission/FORM_FIELDS.md). Optional social sharing is not claimed. The private source repository remains private.

### Development and license

Coding agents assisted development and preparation. **Tatum AI Builder was not used.** No external-user accuracy, time-saved or live-service reliability claim is made. MIT is selected; the grant is in [LICENSE](LICENSE). License preparation does not establish public release, ownership/eligibility sign-off or accepted competition terms. Historical specifications and earlier test totals are not current live-provider acceptance; consult the scoped records in `evidence/acceptance.json`.


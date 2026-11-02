# Local narrated video receipt — Step B

> **Historical preparation / evidence record — current status updated 2026-11-02 10:14 UTC.** Earlier unpublished, pending-upload, missing-memory and preparation-only statements below describe their original checkpoints, not present publication status. The [current README](https://github.com/peterpeter228/recallledger-public/blob/main/README.md#current-publication-status--2026-11-02-1014-utc) and [current checklist](https://github.com/peterpeter228/recallledger-public/blob/main/submission/SUBMISSION_CHECKLIST.md) supersede those status claims. Repo, production demo, blog and 165-second narrated video are public; the owner reported submission success at 09:55 UTC (independent receipt and exact submitted fields not inspected). Twelve synthetic teaching memories have recorded Mainnet verification and fresh remote restore; one read-only Tatum lookup is recorded, not a real-transfer operator learning loop. Original logs, limits and timestamps below are preserved.


**Completed locally; not uploaded.** `out/recallledger-demo.mp4` is an actual **165-second H.264/AAC narrated video** with burned English captions, a complete English subtitle track and sidecar `out/recallledger-demo.srt`. The final receipt is `evidence/video-final/video-receipt.json`; full local evidence is in `out/recallledger-demo-manifest.json` and the owner's job `video.json`. No provider lookup, Mainnet write, signing, spending, deployment or publication was performed by this video work.

## Actual media results

| Item | Observed result |
|---|---|
| MP4 | `out/recallledger-demo.mp4` · **5,406,462 bytes** |
| MP4 SHA-256 | `c36e8af5a55d48792971ed059695f50b531361e50ee6d9e2b3c585794f7780ba` |
| Duration / picture | **165.000 s** · **1920×1080** · **30 fps** · **4,950 frames** · H.264 / `yuv420p` |
| Narration | Actual local **Piper 1.8.0**, `en_US-lessac-medium`; encoded as **AAC, 48 kHz** |
| Captions | **38 complete verbatim cues** from [VIDEO_NARRATION.md](VIDEO_NARRATION.md); burned in, plus English `mov_text` track disabled by default to avoid duplicate captions |
| Sidecar SRT | `out/recallledger-demo.srt` · **3,282 bytes** · SHA-256 `7c80a45a1bb9017b617d2b9d58965043f7386104598d61bf0a179a0b787079a5` |
| Probe / decode | Actual `ffprobe` and complete ffmpeg video/audio decode **exit 0**; stream/duration checks passed |
| Audio/caption alignment | All **38 actual decoded AAC cue waveforms** match their exact local synthesized cues; minimum correlation **0.9999616504655466**; non-silent, unclipped peaks; no spoken cue truncated |
| End of speech | **164.36612244897958 s**, inside the last caption and 165-second output |
| Normal-speed playback | Isolated local Chrome, **1×**, unmuted, continuously reached `ended` at **165 s**; **4,950 decoded video frames, 0 dropped frames, 2,380,426 decoded audio bytes, no media/page errors** |
| Playback time | `2026-11-02T08:05:13.920Z`–`2026-11-02T08:07:59.132Z`; loopback only, external requests blocked |

Audio inspection is grounded in the **actual output AAC**, complete PCM preservation, waveform/RMS/peak checks and unmuted browser decoding. It is **not a claim of subjective human listening**. An earlier accelerated 8× check is retained separately; the accepted normal-speed receipt is `out/media-check/playback-1x.json`.

## Complete timeline and sources

The five timed phases in the narration and [storyboard](VIDEO_STORYBOARD.md) are continuous: **0–20, 20–60, 60–100, 100–140 and 140–165 seconds**. Seventeen scene bindings cover every frame; no phase was omitted.

| Segment | Actual inputs and scope |
|---|---|
| 0–20 s | Fresh `M02.png`: unexplained synthetic transfer; unknown is not expense |
| 20–60 s | Fresh `single-label.png`, `scope-M04.png`, `M04-pending.png`, `M07.png`, `scope-M08.png`: item label, separate scope, inactive pending, completed reimbursement correction, separate 5–20 narrowing |
| 60–100 s | Fresh `replay-B-M04.png`, `replay-E-M08.png`, `M10.png`, `replay-B-M12.png`, `final-inbox.png`; full input-hash/decision card from `evidence/fixture-evaluation.json` |
| 100–140 s | Static recorded `write-reconciliation.json`, `mainnet-manifest.json`, `tatum-probe-J91TcZuh.json`: twelve done operations, count 12/exact set/hashes, then the one earlier successful Tatum read |
| 140–165 s | Static recorded `frozen-manifest.json` and `restore-report.json`: same manifest version, verified count 12, complete matching state hash and original check time; explicit no-write/no-real-loop limits |

Every frame retains **SYNTHETIC TEACHING DATA** and **Screenshot-based walkthrough—not continuous screencast**. Fresh local screenshots are visibly distinguished from recorded Mainnet cards. The renderer checks the recorded manifest/reconciliation/restore counts, exact set, content hashes, matching state hashes and owner **`NOT_RUN_OWNER_1B`** limit before encoding.

### Fresh local capture

`evidence/video-final/capture-manifest.json` contains **17 screenshot surfaces**, paired full DOM text hashes, screenshot hashes/byte counts, genuine selectors/observed text, capture-time basis, exact existing build hashes and the local request list. Capture times run from `2026-11-02T07:48:28.445Z` to `2026-11-02T07:49:51.975Z`.

- Used the existing WP4 Playwright/Chrome pattern with a fresh isolated profile, **`127.0.0.1` only** and blocked external requests. The built recorded handler is routed before static `dist/web`; operator and remote writes are disabled. The public evidence reports **`recorded_live`, Mainnet memory count 12**.
- All twelve confirmations and completions were browser-local synthetic teaching changes. The browser request record contains **GET requests only**; no provider or HTTP mutation was performed.
- The first capture attempt reached the fixture-restore surface but stopped on an ambiguous `.notice` selector. Completed earlier images were preserved, not overwritten; their times are explicitly image filesystem mtimes. The corrected targeted selector completed fixture-restore/replay captures and the full capture report.
- The additional `fixture-restore.png` remains explicitly **simulated** and is **not used as remote restore proof**. Historical pending-state `completed.jpg` files and the silent 180-second video are not reused as final footage.
- This package used the existing build; it did not run application builds, tests, linters or formatters. Parent final integration/rebuild is a separate check.

### Tatum evidence, without another request

The renderer no longer requires the obsolete `BLOCKED` card. It validates `evidence/live-acceptance.json` against `evidence/tatum-probe-J91TcZuh.json`: **`PASS_READ_ONLY`, exactly one lookup, `ok:true`**, requested `2026-11-02T15:42:20.589+08:00`, gRPC `/sui.rpc.v2.LedgerService/GetTransaction`, checkpoint **340709151**. HTTP status is **`null`**, because the adapter does not expose one.

The Tatum card displays the probe path, full probe **file hash** and full response SHA-256 `8bd877ab1138a5142de2d79b9dddd18bcb73c9156e0dac95ee724abca4f4cd67`. The response hash covers the **RFC 8785 canonical adapter-returned envelope, not raw gRPC wire bytes**. This video does not retry the lookup, and the real-transfer operator loop remains **NOT RUN under owner 1B**.

## Local rendering contract

The renderer reads the actual matching timed tables, rejects nonregular/symlinked/URL inputs, verifies all selected screenshot/DOM hashes against the capture manifest and preserves narration text verbatim. Short sentence tails are balanced into readable cues rather than one-word flashes. Local Piper synthesizes every exact cue; complete cue PCM is placed within its matching caption interval with 100 ms guards and explicit silence. Only five cues needed modest local tempo fitting; maximum factor **1.2252634222919938**, with no speech trimming.

The retained successful render command was:

```sh
node scripts/render-video.mjs --out out/recallledger-demo.mp4 \
  --narration-audio out/narration/narration.wav \
  --speech-timing out/narration/alignment.json
```

It ran in the assigned clean environment and completed **17 segment encodes plus mux, all exit 0**. The renderer itself performs no browser/network/provider/restore/upload action. Optional `--dry-run` writes only local plans/cards/SRT and prints commands; normal mode also writes the MP4 and matching sidecar SRT. Existing MP4/SRT targets are never overwritten: choose a new output name for a separately authorized rerender. Local Piper/tool installation and voice download are outside application dependencies; voice/tool versions and voice model/config hashes are recorded in `out/narration/alignment.json`.

## Retained actual evidence

- `out/temp/recallledger-render-OujDWD/render-plan.json` and `render-result.json`: exact source hashes, original evidence/capture times, narration/scene bindings, generated cards/filters, actual argv arrays and completed encoding stages.
- `out/narration/alignment.json`: voice/tool hashes, complete narration/audio binding and all 38 measured speech intervals. Local tool/voice paths remain only in ignored output/job artifacts.
- `out/media-check/ffprobe.json`, `inspection.json`, `decoded-audio.wav`, `audio-waveform.png`: actual media probe, full decode, per-cue audio measurements and embedded-subtitle text checks.
- `out/media-check/frames/cue-001.png` through `cue-038.png` and `captions-contact.png`: actual output frame for every caption. Visual inspection covered all 17 scene representatives, the full caption contact sheet, full hash/path legibility and the final Tatum/restore/limits cards.
- `out/media-check/playback-1x.json`, `playback-start-1x.png`, `playback-ended-1x.png`: complete normal-speed local playback. Owned browsers and loopback servers were closed after capture/playback.
- `out/recallledger-demo-manifest.json`, `evidence/video-final/video-receipt.json`, and job `video.json`: final actual MP4/SRT hashes, local copies, source/evidence links and limits. The repository receipt uses repository-relative paths only; private job-copy paths are not exported there.

**External boundary remains unchanged:** no unlisted URL, upload, logged-out remote playback, public deployment, real-transfer loop or new Mainnet operation is claimed. Publication is a separate parent-authorized action.



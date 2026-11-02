#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

// Local evidence assembly only. No capture, provider, write-to-Walrus or upload code.
const ROOT = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const FPS = 30;
const CAPTURE_NAMES = ['recorded-storage', 'M02', 'single-label', 'scope-M04', 'M04-pending', 'M06', 'summary-M06', 'M07', 'summary-M07', 'scope-M08', 'M10', 'summary-M10', 'final-inbox', 'fixture-restore', 'replay-B-M04', 'replay-E-M08', 'replay-B-M12'];
const SOURCE_FILES = [
  'scripts/render-video.mjs',
  'submission/VIDEO_STORYBOARD.md',
  'submission/VIDEO_NARRATION.md',
  'fixtures/demo-sequence.json',
  'evidence/acceptance.json',
  'evidence/fixture-evaluation.json',
  'evidence/write-reconciliation.json',
  'evidence/mainnet-manifest.json',
  'evidence/frozen-manifest.json',
  'evidence/restore-report.json',
  'evidence/live-acceptance.json',
  'evidence/tatum-probe-J91TcZuh.json',
  'evidence/video-final/capture-manifest.json',
  ...CAPTURE_NAMES.flatMap(name => [`evidence/video-final/${name}.png`, `evidence/video-final/${name}.txt`]),
  'evidence/browser-cua/core-results.json',
  'evidence/browser-cua/screenshot-content-notes.md',
  'evidence/browser-cua/M02-completed.txt',
  'evidence/browser-cua/M04-pending.txt',
  'evidence/browser-cua/M06-completed.txt',
  'evidence/browser-cua/M07-completed.txt',
  'evidence/browser-cua/M10-completed.txt',
  'evidence/browser-cua/replay-B-M04.txt',
  'evidence/browser-cua/replay-E-M08.txt',
  'evidence/browser-cua/replay-B-M12.txt',
];
const AUDIO_FORMATS = new Map([
  ['.wav', 'wav'], ['.mp3', 'mp3'], ['.m4a', 'mov'], ['.aac', 'aac'],
  ['.flac', 'flac'], ['.ogg', 'ogg'], ['.opus', 'ogg'], ['.aif', 'aiff'], ['.aiff', 'aiff'],
]);
const HELP = `RecallLedger: local narrated screenshot/evidence walkthrough

Usage:
  node scripts/render-video.mjs --help
  node scripts/render-video.mjs --dry-run [--out <local.mp4>] [--narration-audio <local-file>]
  node scripts/render-video.mjs [--out <local.mp4>] [--narration-audio <local-file>]

Options:
  --dry-run                 Validate sources/timing; write SRT, cards and render-plan.json
                            under out/temp/; print commands WITHOUT running any process.
  --out <local.mp4>          Output target (default: out/recallledger-demo.mp4).
                            Existing targets are never overwritten, including in dry-run.
  --narration-audio <file>   Optional existing, regular local WAV/MP3/M4A/AAC/FLAC/OGG/OPUS/AIFF.
                            Must already follow the generated English SRT timing.
  --speech-timing <file>     Local per-cue alignment JSON bound to narration/audio hashes.
  --help                    Print this help without creating any artifacts.

No audio option means captions-only: there is no generated voice or silent audio track.
Normal rendering is a local authorized act and requires ffmpeg with drawtext/libx264.
Dry-run needs neither ffmpeg nor ffprobe; executable discovery uses PATH filesystem checks.
All sources are local regular files; URLs, playlists and symlinked inputs are rejected.
The script never captures a browser, makes network/provider calls, invokes ffprobe or uploads.
`;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function localPath(value, label) {
  requireValue(typeof value === 'string' && value.trim().length > 0, `${label}: supply a local path`);
  requireValue(!/[\x00-\x1f\x7f]/u.test(value), `${label}: control characters are not allowed`);
  requireValue(!/^[a-z][a-z0-9+.-]*:/iu.test(value) && !value.startsWith('//'), `${label}: URLs/protocols are not allowed`);
  return path.resolve(value);
}

function parseOptions(argv) {
  const options = {dryRun: false, help: false, out: path.join(ROOT, 'out/recallledger-demo.mp4'), audio: null, timing: null};
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    requireValue(['--help', '--dry-run', '--out', '--narration-audio', '--speech-timing'].includes(flag), `Unknown argument: ${flag}`);
    requireValue(!seen.has(flag), `Repeated argument: ${flag}`);
    seen.add(flag);
    if (flag === '--help') options.help = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else {
      const value = argv[++index];
      requireValue(value && !value.startsWith('--'), `${flag} requires a local file path`);
      if (flag === '--out') options.out = localPath(value, flag);
      else if (flag === '--speech-timing') options.timing = localPath(value, flag);
      else options.audio = localPath(value, flag);
    }
  }
  requireValue(path.extname(options.out).toLowerCase() === '.mp4', '--out must name a local .mp4 file');
  requireValue(!options.timing || options.audio, '--speech-timing requires --narration-audio');
  return options;
}

function readRegular(file, label) {
  const absolute = path.resolve(file);
  requireValue(fs.lstatSync(absolute).isFile(), `${label}: not a regular file`);
  requireValue(fs.realpathSync(absolute) === absolute, `${label}: symlinked files/ancestors are not allowed`);
  const bytes = fs.readFileSync(absolute);
  return {absolute, bytes, sha256: createHash('sha256').update(bytes).digest('hex')};
}

function loadSources() {
  const files = new Map();
  for (const relative of SOURCE_FILES) {
    const absolute = path.resolve(ROOT, relative);
    requireValue(absolute.startsWith(`${ROOT}${path.sep}`), `Source escapes repository: ${relative}`);
    const file = readRegular(absolute, relative);
    if (relative.endsWith('.json')) file.json = JSON.parse(file.bytes.toString('utf8'));
    else if (relative.endsWith('.png')) {
      requireValue(file.bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${relative}: expected an existing PNG`);
    } else file.text = file.bytes.toString('utf8');
    files.set(relative, file);
  }
  return files;
}

function tableCells(line) {
  const cells = [];
  let cell = '';
  const body = line.trim().slice(1, -1);
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === '\\' && body[index + 1] === '|') { cell += '|'; index += 1; }
    else if (body[index] === '|') { cells.push(cell.trim()); cell = ''; }
    else cell += body[index];
  }
  cells.push(cell.trim());
  return cells;
}

function timedTable(text, label) {
  const lines = text.split(/\r?\n/u);
  const headerIndex = lines.findIndex(line => line.trim().startsWith('|') && tableCells(line)[0] === 'Time');
  requireValue(headerIndex >= 0, `${label}: missing Time table`);
  const header = tableCells(lines[headerIndex]);
  requireValue(header.length === 3, `${label}: expected three table columns`);
  requireValue(lines[headerIndex + 1]?.trim().endsWith('|'), `${label}: missing table separator`);
  requireValue(tableCells(lines[headerIndex + 1]).every(cell => /^:?-{3,}:?$/u.test(cell)), `${label}: invalid table separator`);
  const rows = [];
  for (let index = headerIndex + 2; index < lines.length && lines[index].trim().startsWith('|'); index += 1) {
    requireValue(lines[index].trim().endsWith('|'), `${label}: unterminated table row ${index + 1}`);
    const cells = tableCells(lines[index]);
    requireValue(cells.length === 3, `${label}: wrong column count at line ${index + 1}`);
    const time = cells[0].replace(/\*\*|`/gu, '').trim();
    const match = /^(\d+):([0-5]\d)\s*[–—-]\s*(\d+):([0-5]\d)(?:\s+[—-]\s+(.+))?$/u.exec(time);
    requireValue(match, `${label}: invalid time range at line ${index + 1}`);
    const start = Number(match[1]) * 60 + Number(match[2]);
    const end = Number(match[3]) * 60 + Number(match[4]);
    requireValue(end > start && Number.isSafeInteger(end), `${label}: invalid range ${time}`);
    requireValue(start === (rows.at(-1)?.end ?? 0), `${label}: timeline must begin at zero and be contiguous`);
    rows.push({start, end, label: match[5] ?? '', content: cells[1], evidence: cells[2]});
  }
  requireValue(rows.length === 5, `${label}: expected the five teaching/evidence phases`);
  requireValue(rows.at(-1).end >= 120 && rows.at(-1).end <= 180, `${label}: duration must be 120–180 seconds`);
  return rows;
}

function utc(value, label) {
  requireValue(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(value) && Number.isFinite(Date.parse(value)), `${label}: missing original UTC timestamp`);
  return value;
}

function hash(value, label) {
  requireValue(typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value), `${label}: expected a full SHA-256 hash`);
  return value;
}

function atomic(value, decimals, minimumPlaces = 0) {
  requireValue(typeof value === 'string' && /^\d+$/u.test(value), 'Expected an unsigned atomic amount string');
  const digits = BigInt(value).toString().padStart(decimals + 1, '0');
  const whole = decimals ? digits.slice(0, -decimals) : digits;
  const fraction = decimals ? digits.slice(-decimals).replace(/0+$/u, '').padEnd(minimumPlaces, '0') : '';
  return fraction ? `${whole}.${fraction}` : whole;
}

function domSummary(text, label) {
  const field = name => {
    const value = new RegExp(`- generic: ${name}\\r?\\n\\s*- strong: ([^\\r\\n]+)`, 'u').exec(text)?.[1];
    requireValue(value, `${label}: missing ${name} DOM evidence`);
    return value.replace(/^"|"$/gu, '');
  };
  return {tools: field('Tools spend'), unknown: field('Needs context'), rules: field('Active rules')};
}

function validateEvidence(files) {
  const json = name => files.get(name).json;
  const text = name => files.get(name).text;
  const fixture = json('fixtures/demo-sequence.json');
  const evaluation = json('evidence/fixture-evaluation.json');
  const browser = json('evidence/browser-cua/core-results.json');
  const reconciliation = json('evidence/write-reconciliation.json');
  const manifest = json('evidence/mainnet-manifest.json');
  const frozen = json('evidence/frozen-manifest.json');
  const restore = json('evidence/restore-report.json');
  const live = json('evidence/live-acceptance.json');
  const owner = json('evidence/acceptance.json').wp6b;
  requireValue(fixture.fixtureOnly === true && fixture.events?.length === 12 && fixture.scopePlan?.plannedMemoryEventCount === 12, 'Expected the twelve-event synthetic teaching scenario');
  requireValue(Number.isInteger(fixture.currency?.decimals) && fixture.currency.decimals >= 0 && fixture.currency.decimals <= 18, 'Invalid fixture asset precision');
  requireValue(evaluation.providerMode === 'synthetic_local' && evaluation.status === 'PASS' && evaluation.eventCount === 12, 'Expected recorded local fixture evaluation');
  utc(evaluation.executedAt, 'Fixture evaluation');
  utc(browser.observedAt, 'Historical browser report');
  utc(reconciliation.checkedAt, 'Write reconciliation');
  utc(manifest.verifiedAt, 'Mainnet manifest');
  utc(restore.checkedAt, 'Restore report');
  utc(live.checkedAt, 'Live acceptance probe');
  requireValue(browser.mode === 'synthetic fixture; no mainnet', 'Browser evidence must remain historical synthetic/local');
  requireValue(owner?.realLoop === 'NOT_RUN_OWNER_1B', 'Owner teaching-only/no-real-loop evidence is missing or changed');
  const tatum = live.checks?.find(check => check.name === 'tatum');
  const probe = json('evidence/tatum-probe-J91TcZuh.json');
  requireValue(tatum?.status === 'PASS_READ_ONLY' && tatum.evidencePath === 'evidence/tatum-probe-J91TcZuh.json' && tatum.lookupCount === 1 && tatum.realTransferLoop === 'NOT_RUN_OWNER_1B' && live.mainnetWritesPerformed === 0, 'Expected exactly one recorded successful read-only Tatum lookup, without an operator loop');
  requireValue(probe.ok === true && probe.transport === 'grpc' && probe.method === '/sui.rpc.v2.LedgerService/GetTransaction' && probe.httpStatus === null && probe.summary?.status === 'success' && probe.summary?.checkpoint === '340709151', 'Recorded Tatum probe is not the authorized successful gRPC lookup');
  requireValue(probe.digest === tatum.digest && probe.requestedAt === tatum.requestedAt && Date.parse(probe.requestedAt) === Date.parse(live.checkedAt) && hash(probe.responseSha256, 'Tatum adapter envelope') === tatum.responseSha256 && probe.responseHashScope.includes('not raw gRPC wire bytes'), 'Tatum evidence timestamps/hash scope disagree');
  const capture = json('evidence/video-final/capture-manifest.json');
  requireValue(capture.status === 'PASS' && capture.mode === 'recorded_live' && capture.publicEvidence?.mainnetMemoryCount === 12 && capture.health?.operatorEnabled === false && capture.health?.writesEnabled === false && capture.externalRequestsBlocked === true && capture.errors?.length === 0, 'Fresh local screenshot report is not accepted read-only recorded_live evidence');
  requireValue(capture.baseUrl === 'http://127.0.0.1:3276' && capture.requests.every(request => request.method === 'GET' && new URL(request.url).origin === capture.baseUrl), 'Capture must use loopback GET requests only');
  requireValue(capture.files?.length === CAPTURE_NAMES.length, 'Fresh screenshot set is incomplete');
  for (const name of CAPTURE_NAMES) {
    const entry = capture.files.find(item => item.name === name);
    requireValue(entry && entry.path === `evidence/video-final/${name}.png` && entry.domPath === `evidence/video-final/${name}.txt`, `Unbound screenshot ${name}`);
    utc(entry.capturedAt, `${name} capture`);
    requireValue(entry.sha256 === files.get(entry.path).sha256 && entry.bytes === files.get(entry.path).bytes.length && entry.domSha256 === files.get(entry.domPath).sha256, `${name}: screenshot/DOM hashes differ from capture report`);
    requireValue(entry.expectations.every(value => text(entry.domPath).includes(value)), `${name}: saved DOM does not contain the asserted visible state`);
  }
  requireValue(reconciliation.complete === true && reconciliation.operations?.length === 12 && reconciliation.operations.every(operation => operation.state === 'done') && reconciliation.unresolvedOperationIds?.length === 0, 'Reconciliation must record twelve done operations and no unresolved operations');
  requireValue(manifest.purpose === 'teaching' && manifest.mode === 'recorded_live' && manifest.verifiedCount === 12 && manifest.entries?.length === 12 && manifest.verification?.exactSet === true && manifest.verification?.hashes === true, 'Expected verified recorded Mainnet teaching manifest');
  requireValue(frozen.entries?.length === 12 && manifest.manifestVersion === frozen.manifestVersion && restore.manifestVersion === frozen.manifestVersion, 'Recorded manifest versions/counts disagree');
  requireValue(manifest.scopeId === frozen.scopeId && manifest.scopeId === reconciliation.scopeId && manifest.namespace === frozen.namespace && manifest.namespace === reconciliation.namespace, 'Recorded evidence scopes disagree');
  requireValue(restore.status === 'verified' && restore.source === 'walrus_relayer' && restore.count === 12, 'Expected the recorded verified remote restore');
  const stateHash = hash(restore.stateHash, 'Restore state');
  requireValue(stateHash === frozen.expectedStateHash && stateHash === manifest.expectedStateHash && stateHash === evaluation.localReplayHash, 'Recorded state hashes disagree');
  const ids = Array.from({length: 12}, (_, index) => `M${String(index + 1).padStart(2, '0')}`);
  requireValue(JSON.stringify(manifest.entries.map(entry => entry.eventId)) === JSON.stringify(ids), 'Manifest must contain M01–M12 in order');
  for (const [index, entry] of manifest.entries.entries()) {
    hash(entry.eventHash, `${entry.eventId} event`);
    hash(entry.textSha256, `${entry.eventId} text`);
    const frozenEntry = frozen.entries[index];
    for (const key of ['eventId', 'sequence', 'eventHash', 'textSha256', 'blobId', 'jobId']) requireValue(entry[key] === frozenEntry[key], `${entry.eventId}: frozen ${key} differs`);
    requireValue(reconciliation.operations.some(operation => operation.jobId === entry.jobId) && reconciliation.remoteBlobIds.includes(entry.blobId), `${entry.eventId}: missing reconciled job/blob`);
  }
  hash(reconciliation.operationsHash, 'Reconciliation operations');
  hash(reconciliation.inventoryHash, 'Reconciliation inventory');
  const event = id => {
    const value = fixture.events.find(item => item.plannedEventId === id);
    requireValue(value, `Missing teaching event ${id}`);
    return value;
  };
  const row = sequence => {
    const value = evaluation.rows.find(item => item.sequence === sequence);
    requireValue(value?.summary?.assets?.length === 1, `Missing single-asset evaluation row ${sequence}`);
    return value;
  };
  const replay = (inputId, sequence) => {
    const value = evaluation.ablation.find(item => item.inputId === inputId && item.sequence === sequence);
    requireValue(value?.off?.inputHash === value?.on?.inputHash, `${inputId}: off/on input hashes differ`);
    hash(value.off.inputHash, `${inputId} input`);
    requireValue(value.off.decision.evaluatedAt === value.on.decision.evaluatedAt && value.off.memoryEventsAdded === 0 && value.on.memoryEventsAdded === 0, `${inputId}: replay time/write invariants differ`);
    utc(value.on.decision.evaluatedAt, `${inputId} evaluation time`);
    requireValue(value.off.inputHash === browser.hashes[inputId], `${inputId}: browser and fixture hashes disagree`);
    return value;
  };
  const b = replay('B', 4);
  const e = replay('E', 8);
  requireValue(b.off.decision.classification === 'needs_context' && b.on.decision.category === 'tools' && b.on.decision.basis === 'confirmed_rule' && e.on.decision.classification === 'needs_context' && e.on.decision.reasonCodes.includes('amount_above_maximum'), 'Recorded replay decisions no longer match this storyboard');
  const summaries = {};
  for (const [name, sequence] of [['M02-completed', 2], ['M04-pending', 3], ['M06-completed', 6], ['M07-completed', 7], ['M10-completed', 10]]) {
    const relative = `evidence/browser-cua/${name}.txt`;
    summaries[name] = domSummary(text(relative), relative);
    const expected = `${atomic(row(sequence).summary.assets[0].toolsSpendAtomic, fixture.currency.decimals, 2)} ${fixture.currency.assetRef}`;
    requireValue(summaries[name].tools === expected, `${relative}: DOM and fixture tools amounts disagree`);
  }
  const pending = text('evidence/browser-cua/M04-pending.txt');
  requireValue(pending.includes('Not active yet.') && pending.includes('Complete fixture job') && pending.includes('No Walrus request is sent.') && summaries['M04-pending'].rules === '0', 'Pending DOM evidence no longer proves inactive local simulation');
  const revoked = text('evidence/browser-cua/replay-B-M12.txt');
  requireValue(revoked.includes('As of M12 · Revoked" [selected]') && revoked.includes(b.off.inputHash) && revoked.includes('no AI inference · no writes.'), 'Missing B/M12 revoked replay DOM evidence');
  const notes = text('evidence/browser-cua/screenshot-content-notes.md');
  requireValue(notes.includes('M06-completed.jpg: actually M06 pending') && notes.includes('memory-restore.jpg:') && notes.includes('before restore report painted'), 'Screenshot-content caveats must be retained and reviewed');
  const refund = evaluation.summary.refundLinks.find(link => link.eventId === 'M10');
  requireValue(refund?.status === 'active' && refund.refundObservationId === 'fixture:tx-D' && refund.originalObservationId === 'fixture:tx-B', 'Missing explicit recorded refund link');
  return {fixture, evaluation, browser, reconciliation, manifest, frozen, restore, live, tatum, probe, probeFileSha256: files.get(tatum.evidencePath).sha256, capture, event, row, b, e, summaries, refund};
}

function wrapWords(text, width) {
  const lines = [];
  let line = '';
  for (const word of text.trim().split(/\s+/u)) {
    requireValue(word.length <= width, `Evidence token exceeds readable line width (${width}): ${word}`);
    if (line && line.length + word.length + 1 > width) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function makeCaptions(narration) {
  const cues = [];
  const sentenceCounts = [3, 7, 7, 7, 4];
  for (const [phase, row] of narration.entries()) {
    const spoken = row.content.trim().replace(/\s+/gu, ' ');
    requireValue(spoken.length > 0 && !spoken.includes('-->') && !/[<>`*]/u.test(spoken), 'Narration cells must contain plain, verbatim spoken text');
    const sentences = spoken.split(/(?<=[.!?])\s+/u);
    requireValue(sentences.length === sentenceCounts[phase], `Narration phase ${phase + 1}: sentence structure changed; review evidence-to-speech scene bindings`);
    const chunks = [];
    for (const [sentence, sentenceText] of sentences.entries()) {
      const words = sentenceText.split(/\s+/u);
      let chunk = [];
      const flush = () => { if (chunk.length) chunks.push({phase, sentence, words: chunk.splice(0)}); };
      for (const word of words) {
        const candidate = [...chunk, word].join(' ');
        if (chunk.length && (chunk.length >= 14 || candidate.length > 78 || wrapWords(candidate, 42).length > 2)) flush();
        chunk.push(word);
      }
      flush();
      // Keep a short sentence tail with enough words for intelligible local speech.
      const tail = chunks.at(-1);
      const prior = chunks.at(-2);
      while (tail.words.length < 4 && prior?.sentence === sentence && prior.words.length > 4) {
        const candidate = [prior.words.at(-1), ...tail.words].join(' ');
        if (candidate.length > 78 || wrapWords(candidate, 42).length > 2) break;
        tail.words.unshift(prior.words.pop());
      }
    }
    const totalWeight = chunks.reduce((sum, chunk) => sum + chunk.words.length, 0);
    const phaseFrames = (row.end - row.start) * FPS;
    let weight = 0;
    let startFrame = row.start * FPS;
    for (const chunk of chunks) {
      weight += chunk.words.length;
      const endFrame = row.start * FPS + Math.round(phaseFrames * weight / totalWeight);
      requireValue(endFrame > startFrame, 'Narration is too dense for the timed segment');
      const lines = wrapWords(chunk.words.join(' '), 42);
      requireValue(lines.length <= 2, 'Caption exceeds two readable lines');
      cues.push({index: cues.length + 1, phase, sentence: chunk.sentence, startFrame, endFrame, text: lines.join('\n')});
      startFrame = endFrame;
    }
    const recovered = cues.filter(cue => cue.phase === phase).map(cue => cue.text.replace(/\n/gu, ' ')).join(' ');
    requireValue(recovered === spoken, `Narration phase ${phase + 1}: caption text is not complete/verbatim`);
  }
  return cues;
}

function srtTime(frame) {
  const milliseconds = Math.round(frame * 1000 / FPS);
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor(milliseconds / 60000) % 60;
  const seconds = Math.floor(milliseconds / 1000) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds % 1000).padStart(3, '0')}`;
}

function makeScenes(data, cues) {
  const {fixture, evaluation, reconciliation, manifest, frozen, restore, live, tatum, probe, probeFileSha256, capture, event, row, b, e, refund} = data;
  const recorded = 'Recorded WP6a Mainnet teaching storage · synthetic story · not a new write';
  const restoreScope = 'Recorded WP6a remote restore · not a current availability check';
  const money = value => `${atomic(value, fixture.currency.decimals, 2)} ${fixture.currency.assetRef}`;
  const scenes = [];
  function add(phase, firstSentence, sentenceCount, title, lines, sources, imageName = null, scopeLabel = 'Browser-local teaching · synthetic inputs · no provider requests') {
    const selected = cues.filter(cue => cue.phase === phase && cue.sentence >= firstSentence && cue.sentence < firstSentence + sentenceCount);
    requireValue(selected.length > 0, `Missing captions for scene ${title}`);
    const image = imageName ? `evidence/video-final/${imageName}.png` : null;
    const shot = image ? capture.files.find(item => item.path === image) : null;
    if (shot) scopeLabel = `Fresh local screenshot · ${shot.capturedAt} · capture-time basis in manifest`;
    const wrapped = lines.flatMap(line => wrapWords(line, image ? 42 : 92));
    requireValue(wrapped.length <= (image ? 18 : 15), `Evidence card is too tall: ${title}`);
    const sourcePaths = [...new Set(image ? [image, ...sources, 'evidence/video-final/capture-manifest.json'] : sources)];
    requireValue(sourcePaths.every(source => SOURCE_FILES.includes(source)), `Unmanifested source in ${title}`);
    const sourceLines = wrapWords(`Sources: ${sourcePaths.join('; ')}`, 140);
    requireValue(sourceLines.length <= 2, `Source footer is too tall: ${title}`);
    scenes.push({index: scenes.length + 1, phase, title, scopeLabel, image, sourcePaths, body: wrapped.join('\n'), sourceLabel: sourceLines.join('\n'), startFrame: selected[0].startFrame, endFrame: selected.at(-1).endFrame});
  }
  add(0, 0, 3, 'What moved is not why', [
    `Transfer A: ${money(fixture.transactions['tx-A'].amountAtomic)}`,
    'Unknown is not expense.',
    'A wallet records movement, not purpose.',
    'Context needs user confirmation.',
    'This screenshot is the actual local UI.',
    'The business story is synthetic.',
    'No customer-payment claim.',
  ], ['fixtures/demo-sequence.json'], 'M02');
  add(1, 0, 1, 'A single-item label is not a future rule', [
    'M03: label transfer A as tools.',
    'This applies only to this transfer.',
    'User-reviewed purpose, not chain fact.',
    'Future scope needs another confirmation.',
  ], ['fixtures/demo-sequence.json'], 'single-label');
  add(1, 1, 1, 'Review every condition before reusing context', [
    'M04 · separately confirmed scope',
    'Recipient: COUNTERPARTY_R',
    'Asset: fixture:TEST_USDC',
    'Direction: outgoing · sui:fixture',
    'Amount: 5–30, inclusive',
    'Validity: 30 days',
    'Range is explicit user input.',
    'Not inferred from one 12-unit example.',
  ], ['fixtures/demo-sequence.json'], 'scope-M04');
  add(1, 2, 2, 'Pending is inactive; fixture completion is simulation', [
    'M04 pending: active rules still 0.',
    'Current policy has not changed.',
    'Complete fixture job is local simulation.',
    'No Walrus request is sent.',
    'Pending ≠ active.',
    'Fixture completion ≠ Walrus receipt.',
  ], ['fixtures/demo-sequence.json'], 'M04-pending');
  add(1, 4, 2, 'Correcting transfer C changes this item only', [
    'M06: C matched the original tools rule.',
    `Tools before: ${money(row(6).summary.assets[0].toolsSpendAtomic)}`,
    'M07: C is reimbursement, not tools.',
    `Tools after: ${money(row(7).summary.assets[0].toolsSpendAtomic)}`,
    'The rule remains active.',
    'Purpose comes from the user, not chain.',
  ], ['evidence/fixture-evaluation.json'], 'M07');
  add(1, 6, 1, 'Narrow future matching with a separate confirmation', [
    'M08: replace the 5–30 scope with 5–20.',
    'Recipient, asset and direction unchanged.',
    'User confirms this exact scope again.',
    'Future matching changes.',
    'Past decisions remain available.',
    'The C correction did not change the rule.',
  ], ['fixtures/demo-sequence.json'], 'scope-M08');
  add(2, 0, 1, 'B / M04: same input, same evaluation time', [
    `Input B: ${money(fixture.transactions['tx-B'].amountAtomic)}`,
    `OFF: ${b.off.decision.classification}`,
    `ON: ${b.on.decision.classification} / ${b.on.decision.category}`,
    `Basis: ${b.on.decision.basis}`,
    `Rule: ${b.on.decision.matchedRuleVersionIds.join(', ')}`,
    'Both evaluated at:',
    b.on.decision.evaluatedAt,
    'No remote call; no memory write.',
  ], ['evidence/fixture-evaluation.json'], 'replay-B-M04');
  add(2, 1, 2, 'Full input hash and decision basis', [
    'Memory OFF and ON use the same SHA-256 input hash, not a transaction digest:',
    b.off.inputHash,
    `Both evaluation times: ${b.on.decision.evaluatedAt}`,
    `OFF: ${b.off.decision.classification} · basis ${b.off.decision.basis}`,
    `ON: ${b.on.decision.classification} / ${b.on.decision.category} · basis ${b.on.decision.basis}`,
    `Matched rule: ${b.on.decision.matchedRuleVersionIds.join(', ')} · memory version ${b.on.decision.memoryVersion}`,
    `Reason: ${b.on.decision.reasonCodes.join(', ')} · new memory events: ${b.on.memoryEventsAdded}`,
    'Deterministic policy replay, not model training.',
  ], ['evidence/fixture-evaluation.json']);
  add(2, 3, 1, 'E / M08: outside the narrowed 5–20 scope', [
    `Input E: ${money(fixture.transactions['tx-E'].amountAtomic)}`,
    'OFF and ON both need context.',
    'ON reason: amount_above_maximum',
    'Memory version: 8',
    'Same input hash, join these two lines:',
    e.off.inputHash.slice(0, 32),
    e.off.inputHash.slice(32),
    'Both evaluated at:',
    e.on.decision.evaluatedAt,
  ], ['evidence/fixture-evaluation.json'], 'replay-E-M08');
  add(2, 4, 1, 'An incoming refund needs an explicit link', [
    'Incoming D never inherits Tools.',
    `M10: ${refund.refundObservationId}`,
    `Original: ${refund.originalObservationId}`,
    `Link: ${refund.status} · explicit user confirmation`,
    `Tools after: ${money(row(10).summary.assets[0].toolsSpendAtomic)}`,
    'The screenshot shows the completed state.',
  ], ['evidence/fixture-evaluation.json'], 'M10');
  add(2, 5, 1, 'B / M12: revocation makes future matches ask again', [
    `Rule: ${event('M12').plannedPayload.ruleRef}`,
    `Status: ${event('M12').plannedPayload.newStatus}`,
    'Memory OFF: Needs context',
    'Memory ON: Needs context',
    'ON memory version: 12',
    'Past decisions remain available.',
    'Replay is read-only; no M13 write.',
  ], ['fixtures/demo-sequence.json'], 'replay-B-M12');
  add(2, 6, 1, 'Twelve local teaching changes, not real-user accuracy', [
    '12 / 12 changes explicitly confirmed.',
    `Tools: ${money(evaluation.summary.assets[0].toolsSpendAtomic)}`,
    `Needs context: ${money(evaluation.summary.assets[0].unknownAtomic)}`,
    `Active rules: ${event('M12').expectedState.activeRuleRefs.length}`,
    'Deterministic replay only.',
    'No measured real-user improvement.',
    'Local UI is not a Mainnet receipt.',
  ], ['evidence/fixture-evaluation.json'], 'final-inbox');
  add(3, 0, 3, 'Recorded teaching writes: reconciliation, not a new save', [
    'STATIC RECORDED EVIDENCE · No operator or save action is being reenacted.',
    `Scope: ${reconciliation.scopeId} · namespace: ${reconciliation.namespace}`,
    `Original reconciliation checkedAt: ${reconciliation.checkedAt}`,
    `Done operations: ${reconciliation.operations.length}; unresolvedOperationIds: ${JSON.stringify(reconciliation.unresolvedOperationIds)}`,
    `Complete: ${reconciliation.complete}; snapshot version ${reconciliation.snapshotVersion}`,
    `Synthetic teaching event set: ${manifest.entries.map(entry => entry.eventId).join(', ')}`,
    'Operations SHA-256:',
    reconciliation.operationsHash,
    'Inventory SHA-256:',
    reconciliation.inventoryHash,
  ], ['evidence/write-reconciliation.json', 'evidence/mainnet-manifest.json'], null, recorded);
  const representative = manifest.entries[0];
  add(3, 3, 3, 'Recorded manifest: count 12, exact set and hashes', [
    `Manifest version: ${manifest.manifestVersion}`,
    `verifiedCount: ${manifest.verifiedCount} · exactSet: ${manifest.verification.exactSet} · hashes: ${manifest.verification.hashes}`,
    `Original verifiedAt: ${manifest.verifiedAt}`,
    `Representative entry: ${representative.eventId}; sequence ${representative.sequence}`,
    'eventHash (full SHA-256, not a transaction digest):',
    representative.eventHash,
    'textSha256 (full content hash):',
    representative.textSha256,
    `Blob ID: ${representative.blobId}`,
    'Every M01–M12 entry has event/text hashes in the source manifest.',
    'Mainnet storage is recorded; the business story remains synthetic.',
  ], ['evidence/mainnet-manifest.json'], null, recorded);
  add(3, 6, 1, 'One recorded Tatum read succeeded; no real-transfer loop', [
    `Tatum: ${tatum.status} · ok: ${probe.ok} · exactly one lookup; no retries`,
    `Requested at: ${probe.requestedAt}`,
    `gRPC method: ${probe.method}`,
    `Digest: ${probe.digest} · checkpoint: ${probe.summary.checkpoint}`,
    'HTTP status: null — the gRPC adapter does not expose it.',
    'Response SHA-256 — RFC 8785 canonical adapter envelope, not wire bytes:',
    probe.responseSha256,
    'Probe source-file SHA-256 (separate from the response hash):',
    probeFileSha256,
    'Real-transfer loop: NOT_RUN_OWNER_1B · owner t209u1B.',
    `Probe Mainnet writes: ${live.mainnetWritesPerformed}; no new lookup is performed by this video.`,
  ], ['evidence/tatum-probe-J91TcZuh.json', 'evidence/live-acceptance.json'], null, 'Recorded single authorized Tatum read · not a new request or operator loop');
  add(4, 0, 2, 'Recorded fresh-client remote restore matches frozen state', [
    `Frozen manifest version: ${frozen.manifestVersion}`,
    `Restore manifest version: ${restore.manifestVersion}`,
    `Frozen entries: ${frozen.entries.length} · restored count: ${restore.count} · status: ${restore.status}`,
    `Recorded source: ${restore.source}`,
    `Original restore checkedAt: ${restore.checkedAt}`,
    'Full matching state SHA-256 (not a transaction digest):',
    restore.stateHash,
    'Frozen expectedStateHash = manifest expectedStateHash = restore stateHash.',
    'Saved WP6a remote result, not the local fixture restore screen.',
    'No new restore request is made by this walkthrough.',
  ], ['evidence/frozen-manifest.json', 'evidence/restore-report.json', 'evidence/mainnet-manifest.json'], null, restoreScope);
  add(4, 2, 2, 'Limits remain visible: recorded result, read-only demo', [
    'SYNTHETIC TEACHING DATA · not real customer history.',
    'The demo cannot write.',
    'Mainnet writes belong only to the separately authorized operator host.',
    `Tatum: ${tatum.status} · one recorded lookup · real-transfer loop NOT RUN (owner 1B).`,
    `Original restore checkedAt: ${restore.checkedAt}`,
    `Recorded restore: ${restore.status} · count ${restore.count}`,
    'Full state SHA-256:',
    restore.stateHash,
    'Recorded results are not a current availability guarantee.',
    'Fresh local screenshots only · no upload, public link or live operator reenactment.',
  ], ['evidence/restore-report.json', 'evidence/live-acceptance.json', 'evidence/acceptance.json'], null, restoreScope);
  let nextFrame = 0;
  for (const scene of scenes) {
    requireValue(scene.startFrame === nextFrame && scene.endFrame > scene.startFrame, 'Evidence scenes must cover the narration without gaps/overlaps');
    nextFrame = scene.endFrame;
  }
  requireValue(nextFrame === cues.at(-1).endFrame, 'Evidence scenes do not cover the full narration');
  return scenes;
}

function findExecutable(name) {
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.resolve(directory || process.cwd(), name);
    try {
      if (fs.statSync(candidate).isFile()) { fs.accessSync(candidate, fs.constants.X_OK); return candidate; }
    } catch { /* Filesystem discovery only; never execute a version probe. */ }
  }
  return null;
}

function findFont() {
  for (const candidate of [
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    '/usr/share/fonts/dejavu-sans-mono-fonts/DejaVuSansMono.ttf',
    '/usr/share/fonts/truetype/liberation2/LiberationMono-Regular.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf',
  ]) {
    try { if (fs.statSync(candidate).isFile()) { fs.accessSync(candidate, fs.constants.R_OK); return candidate; } } catch { /* Optional in dry-run. */ }
  }
  return null;
}

function createRunDirectory() {
  let directory = ROOT;
  for (const name of ['out', 'temp']) {
    directory = path.join(directory, name);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory);
    requireValue(fs.lstatSync(directory).isDirectory() && fs.realpathSync(directory) === directory, 'out/temp must be real local directories, not symlinks');
  }
  return fs.mkdtempSync(path.join(directory, 'recallledger-render-'));
}

function writeNew(directory, name, content) {
  fs.writeFileSync(path.join(directory, name), content, {encoding: 'utf8', flag: 'wx', mode: 0o600});
}

function commandPreview(executable, args) {
  return [executable, ...args].map(value => /^[a-z0-9_./:=+-]+$/iu.test(value) ? value : `'${value.replace(/'/gu, "'\\''")}'`).join(' ');
}

function prepare(options) {
  requireValue(!fs.existsSync(options.out), `Output already exists; choose a new --out target: ${options.out}`);
  const sidecar = options.out.slice(0, -4) + '.srt';
  requireValue(!fs.existsSync(sidecar), `SRT output already exists; choose a new --out target: ${sidecar}`);
  const files = loadSources();
  const storyboard = timedTable(files.get('submission/VIDEO_STORYBOARD.md').text, 'VIDEO_STORYBOARD.md');
  const narration = timedTable(files.get('submission/VIDEO_NARRATION.md').text, 'VIDEO_NARRATION.md');
  requireValue(storyboard.every((row, index) => row.start === narration[index].start && row.end === narration[index].end), 'Storyboard and narration timelines do not match');
  const data = validateEvidence(files);
  const cues = makeCaptions(narration);
  const scenes = makeScenes(data, cues);
  const durationSeconds = narration.at(-1).end;
  let audio = null;
  if (options.audio) {
    const format = AUDIO_FORMATS.get(path.extname(options.audio).toLowerCase());
    requireValue(format, 'Unsupported narration audio extension; use a local WAV/MP3/M4A/AAC/FLAC/OGG/OPUS/AIFF, never a playlist');
    const file = readRegular(options.audio, 'Narration audio');
    audio = {path: file.absolute, bytes: file.bytes.length, sha256: file.sha256, demuxer: format};
  }
  let speechTiming = null;
  if (options.timing) {
    const file = readRegular(options.timing, 'Speech timing');
    const alignment = JSON.parse(file.bytes.toString('utf8'));
    requireValue(alignment.status === 'ALIGNED_LOCAL_TTS' && alignment.narrationSha256 === files.get('submission/VIDEO_NARRATION.md').sha256 && alignment.audioSha256 === audio.sha256 && alignment.durationSeconds === durationSeconds, 'Speech timing must bind this exact narration document and audio file');
    requireValue(alignment.cues?.length === cues.length, 'Speech timing cue count differs');
    for (const [index, cue] of cues.entries()) {
      const spoken = alignment.cues[index];
      requireValue(spoken.index === cue.index && spoken.text === cue.text.replace(/\n/gu, ' ') && spoken.startFrame === cue.startFrame && spoken.endFrame === cue.endFrame, `Speech cue ${cue.index}: words or caption interval differ`);
      requireValue(Number.isFinite(spoken.speechStartSeconds) && Number.isFinite(spoken.speechEndSeconds) && spoken.speechStartSeconds >= cue.startFrame / FPS && spoken.speechEndSeconds > spoken.speechStartSeconds && spoken.speechEndSeconds <= cue.endFrame / FPS + 0.0001, `Speech cue ${cue.index}: complete speech does not fit inside its caption`);
    }
    speechTiming = {path: file.absolute, bytes: file.bytes.length, sha256: file.sha256, ...alignment};
  }
  const ffmpeg = findExecutable('ffmpeg');
  const font = findFont();
  if (!options.dryRun) {
    requireValue(ffmpeg, 'ffmpeg is not on PATH; preparation can still be inspected with --dry-run');
    requireValue(font, 'A supported local DejaVu/Liberation monospace font is required for normal rendering');
  }
  const directory = createRunDirectory();
  writeNew(directory, 'narration.srt', cues.map(cue => `${cue.index}\n${srtTime(cue.startFrame)} --> ${srtTime(cue.endFrame)}\n${cue.text}\n`).join('\n'));
  writeNew(directory, 'synthetic-label.txt', 'SYNTHETIC TEACHING DATA');
  writeNew(directory, 'walkthrough-label.txt', 'Screenshot-based walkthrough—not continuous screencast');
  for (const cue of cues) writeNew(directory, `caption-${String(cue.index).padStart(3, '0')}.txt`, cue.text);
  const fontOption = font ? `fontfile=${font}` : 'font=monospace';
  const draw = (file, x, y, size, extra = '') => `drawtext=${fontOption}:textfile=${file}:expansion=none:fontcolor=white:fontsize=${size}:line_spacing=8:x=${x}:y=${y}${extra}`;
  const commands = [];
  for (const scene of scenes) {
    const id = String(scene.index).padStart(3, '0');
    writeNew(directory, `title-${id}.txt`, scene.title);
    writeNew(directory, `scope-${id}.txt`, scene.scopeLabel);
    writeNew(directory, `card-${id}.txt`, scene.body);
    writeNew(directory, `source-${id}.txt`, scene.sourceLabel);
    const filters = scene.image
      ? ['scale=1100:640:force_original_aspect_ratio=decrease:flags=lanczos', 'pad=1920:1080:(1100-iw)/2+52:236:color=0x101826', 'setsar=1']
      : ['setsar=1'];
    filters.push(
      draw('synthetic-label.txt', 64, 24, 34),
      draw('walkthrough-label.txt', 64, 72, 26),
      draw(`scope-${id}.txt`, 64, 116, 23),
      draw(`title-${id}.txt`, 64, 178, 36),
      draw(`card-${id}.txt`, scene.image ? 1190 : 64, 246, scene.image ? 25 : 30),
      draw(`source-${id}.txt`, 64, 892, 19),
    );
    for (const cue of cues.filter(item => item.startFrame < scene.endFrame && item.endFrame > scene.startFrame)) {
      const start = (Math.max(cue.startFrame, scene.startFrame) - scene.startFrame) / FPS;
      const end = (Math.min(cue.endFrame, scene.endFrame) - scene.startFrame) / FPS;
      filters.push(draw(`caption-${String(cue.index).padStart(3, '0')}.txt`, '(w-tw)/2', 966, 38, `:box=1:boxcolor=black@0.92:boxborderw=12:enable='gte(t,${start.toFixed(6)})*lt(t,${end.toFixed(6)})'`));
    }
    filters.push('format=yuv420p');
    writeNew(directory, `segment-${id}.filter`, filters.join(',\n'));
    const input = scene.image
      ? ['-protocol_whitelist', 'file', '-f', 'image2', '-pattern_type', 'none', '-loop', '1', '-framerate', String(FPS), '-i', files.get(scene.image).absolute]
      : ['-f', 'lavfi', '-i', `color=c=0x101826:s=1920x1080:r=${FPS}`];
    commands.push({
      stage: `segment-${id}`, executable: ffmpeg ?? 'ffmpeg',
      args: ['-hide_banner', '-loglevel', 'warning', '-nostdin', '-n', '-filter_threads', '1', ...input, '-map', '0:v:0', '-filter_script:v', `segment-${id}.filter`, '-frames:v', String(scene.endFrame - scene.startFrame), '-r', String(FPS), '-an', '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-tune', 'stillimage', '-crf', '20', '-pix_fmt', 'yuv420p', '-video_track_timescale', '30000', '-f', 'mp4', `segment-${id}.mp4`],
    });
  }
  writeNew(directory, 'segments.ffconcat', `ffconcat version 1.0\n${scenes.map(scene => `file segment-${String(scene.index).padStart(3, '0')}.mp4`).join('\n')}\n`);
  const mux = ['-hide_banner', '-loglevel', 'warning', '-nostdin', '-n', '-protocol_whitelist', 'file', '-f', 'concat', '-safe', '1', '-i', 'segments.ffconcat', '-protocol_whitelist', 'file', '-f', 'srt', '-i', 'narration.srt'];
  if (audio) mux.push('-protocol_whitelist', 'file', '-f', audio.demuxer, '-i', audio.path);
  mux.push('-map', '0:v:0', '-map', '1:s:0');
  if (audio) mux.push('-map', '2:a:0', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-metadata:s:a:0', 'language=eng', '-af', 'apad');
  else mux.push('-an');
  mux.push('-c:v', 'copy', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-metadata:s:s:0', 'title=English verbatim narration (also burned in)', '-disposition:s:0', '0', '-map_metadata', '-1', '-t', String(durationSeconds), '-movflags', '+faststart', '-f', 'mp4', options.out);
  commands.push({stage: 'concat-and-caption-mux', executable: ffmpeg ?? 'ffmpeg', args: mux});
  const plan = {
    schemaVersion: 1, status: 'PREPARED_NOT_MEDIA_VERIFIED', generatedAt: new Date().toISOString(),
    localOnly: true, dryRun: options.dryRun, workingDirectory: directory, output: options.out,
    durationSeconds, fps: FPS, dimensions: {width: 1920, height: 1080},
    audioMode: audio ? (speechTiming ? 'local Piper narration; measured per-cue synthesis fitted without speech truncation' : 'supplied local narration; pre-alignment required') : 'captions-only; no audio stream',
    captions: {srt: path.join(directory, 'narration.srt'), sidecar, completeVerbatim: true, cueCount: cues.length, timing: speechTiming ? 'measured local TTS per-cue speech intervals contained in matching frame-aligned caption intervals' : 'planned word-weighted cues inside each narration-table phase; frame-aligned', burnedIn: true, optionalMovTextTrack: 'English, disabled by default to avoid duplicate captions'},
    captionCues: cues,
    runtime: {ffmpeg, discovery: 'PATH filesystem lookup only; no executable/version/capability probe', monospaceFont: font, capabilitiesVerified: false},
    sourceManifest: [...files].map(([relative, file]) => ({path: relative, bytes: file.bytes.length, sha256: file.sha256, originalRecordedAt: file.json?.verifiedAt ?? file.json?.checkedAt ?? file.json?.observedAt ?? file.json?.executedAt ?? null, ...(relative.endsWith('.png') ? {capturedAt: data.capture.files.find(item => item.path === relative).capturedAt, captureTimeSource: data.capture.files.find(item => item.path === relative).captureTimeSource} : {})})),
    narrationAudio: audio,
    speechTiming,
    timeline: storyboard.map((row, index) => ({start: row.start, end: row.end, title: row.label, storyboard: row.content, storyboardEvidence: row.evidence, narration: narration[index].content})),
    scenes: scenes.map(scene => ({...scene, startSeconds: scene.startFrame / FPS, endSeconds: scene.endFrame / FPS})),
    commands,
    limitations: [
      'Fresh loopback-only local screenshots and static recorded evidence cards, not a continuous screencast.',
      'Old pending-state completed.jpg files and the pre-paint memory-restore.jpg are not used.',
      'Recorded Mainnet teaching evidence is distinct from browser-local sandbox behavior; no new writes/restore/provider calls.',
      'Exactly one previous Tatum read succeeded; real-transfer loop NOT RUN under owner t209u1B; demo cannot write.',
      'ffprobe, actual output inspection and external upload are separate from this render-plan file.',
    ],
  };
  writeNew(directory, 'render-plan.json', `${JSON.stringify(plan, null, 2)}\n`);
  console.log(`Prepared ${durationSeconds}s / ${scenes.length} static scenes / ${cues.length} complete narration cues.`);
  console.log(`Artifacts: ${directory}`);
  console.log(`ffmpeg: ${ffmpeg ?? 'ABSENT (dry-run remains valid)'}; filesystem discovery only.`);
  console.log(`Every command below uses working directory: ${directory}`);
  for (const command of commands) console.log(commandPreview(command.executable, command.args));
  if (options.dryRun) {
    console.log('DRY RUN: no subprocess, ffmpeg/ffprobe invocation, network, upload or MP4 creation occurred.');
    return;
  }
  fs.mkdirSync(path.dirname(options.out), {recursive: true});
  for (const command of commands) {
    const result = spawnSync(command.executable, command.args, {cwd: directory, shell: false, stdio: 'inherit'});
    if (result.error) throw result.error;
    requireValue(result.status === 0, `${command.stage} failed (${result.signal ?? result.status}); intermediates retained in ${directory}; any partial MP4 is not approved media`);
  }
  fs.copyFileSync(path.join(directory, 'narration.srt'), sidecar, fs.constants.COPYFILE_EXCL);
  const rendered = readRegular(options.out, 'Rendered MP4');
  const subtitles = readRegular(sidecar, 'Rendered sidecar SRT');
  writeNew(directory, 'render-result.json', `${JSON.stringify({status: 'ENCODED_LOCAL_NOT_YET_MEDIA_INSPECTED', completedAt: new Date().toISOString(), output: {path: options.out, bytes: rendered.bytes.length, sha256: rendered.sha256}, srt: {path: sidecar, bytes: subtitles.bytes.length, sha256: subtitles.sha256}, commandExitCodes: commands.map(command => ({stage: command.stage, exitCode: 0})), renderPlan: path.join(directory, 'render-plan.json'), providerRequests: 0, mainnetWrites: 0, uploaded: false}, null, 2)}\n`);
  console.log(`Local render command sequence completed: ${options.out}`);
  console.log('ENCODED locally; separate actual-file media inspection is required. Sidecar SRT copied. No upload performed.');
}

try {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) console.log(HELP);
  else prepare(options);
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}

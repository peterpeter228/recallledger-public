#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const endpointHost = 'sui-mainnet-grpc.gateway.tatum.io:443';
const method = '/sui.rpc.v2.LedgerService/GetTransaction';
const responseHashScope = 'SHA-256 of UTF-8 RFC 8785 canonical JSON of the adapter-returned envelope (evidence, transaction, objectTypes); not raw gRPC wire bytes. Includes local evidence.fetchedAt, so repeated lookups may hash differently.';
const help = `Usage:
  node scripts/tatum-probe.mjs --digest <sui-tx-digest> [--out evidence/tatum-probe-<prefix>.json] [--dry-run] [--help]

--help     Show this help without a digest, credential, or network call.
--digest   Sui base58 transaction digest decoding to exactly 32 bytes.
--dry-run  Validate the digest, disable fetch, and print the planned method/host.
           No credential is read, no gRPC adapter/client is created, and no file
           is written (even with --out).
--out      Write local JSON to this new file instead of stdout; no default file.
           Parent directories are created; an existing file is never overwritten.

Credentials: only process.env.TATUM_API_KEY; never an argument or a file.
Normal mode performs one read-only adapter getTransaction call, with no script
retry, transaction signing, or on-chain write. The transport is TLS gRPC to
${endpointHost}, method ${method}.
httpStatus is null because the adapter does not expose an HTTP status.
ok means the lookup and normalization succeeded, not that the transaction did;
summary.status separately reports success or failed. Only whitelisted normalized
evidence fields are emitted, never headers, raw responses, or provider errors.
responseSha256: ${responseHashScope}
On a failed lookup, summary and responseSha256 are null; the failure is fixed text.
Exit codes: 0 help/dry-run/success; 2 invalid arguments/digest or missing credential;
1 adapter, serialization, or local output failure.
`;

function fail(message, code) {
  process.stderr.write(`${message}\n`);
  process.exitCode = code;
}

function parseArguments(args) {
  const options = { help: false, dryRun: false, digest: undefined, out: undefined };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!['--help', '--dry-run', '--digest', '--out'].includes(flag) || seen.has(flag)) {
      return null;
    }
    seen.add(flag);
    if (flag === '--help') options.help = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith('--') || value.includes('\0')) return null;
      options[flag === '--digest' ? 'digest' : 'out'] = value;
    }
  }
  return options;
}

// Never spread a provider-controlled object into the public result.
function summarize(evidence) {
  return {
    network: evidence.network === 'mainnet' ? 'mainnet' : null,
    status: ['success', 'failed'].includes(evidence.status) ? evidence.status : null,
    checkpoint: typeof evidence.checkpoint === 'string' && /^(0|[1-9][0-9]*)$/.test(evidence.checkpoint)
      ? evidence.checkpoint : null,
    timestampMs: Number.isSafeInteger(evidence.timestampMs) && evidence.timestampMs >= 0
      ? evidence.timestampMs : null,
    balanceChangeCount: Array.isArray(evidence.balanceChanges) ? evidence.balanceChanges.length : null,
  };
}

function requestedTime() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('Z', '+08:00');
}

async function emit(result, out) {
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (out === undefined) {
    process.stdout.write(json);
    return;
  }
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, json, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options === null) {
    fail('Invalid arguments. Use --help.', 2);
    return;
  }
  if (options.help) {
    process.stdout.write(help);
    return;
  }

  // This branch occurs before even importing the adapter or its gRPC dependencies.
  if (options.dryRun) {
    globalThis.fetch = () => { throw new Error('Network disabled for dry-run.'); };
  }
  if (options.digest === undefined) {
    fail('A valid --digest is required. Use --help.', 2);
    return;
  }
  let isValidTransactionDigest;
  try {
    ({ isValidTransactionDigest } = await import('@mysten/sui/utils'));
  } catch {
    fail('Digest validation could not be initialized.', 1);
    return;
  }
  // The installed Sui utility base58-decodes and checks for exactly 32 bytes.
  if (!isValidTransactionDigest(options.digest)) {
    fail('Invalid Sui transaction digest; exactly 32 decoded bytes required.', 2);
    return;
  }
  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify({
      dryRun: true,
      digest: options.digest,
      endpointHost,
      method,
      transport: 'grpc',
      networkRequests: 0,
    }, null, 2)}\n`);
    return;
  }

  const apiKey = process.env.TATUM_API_KEY;
  if (!apiKey) {
    fail('TATUM_API_KEY is required.', 2);
    return;
  }

  const result = {
    digest: options.digest,
    endpointHost,
    method,
    requestedAt: requestedTime(),
    transport: 'grpc',
    httpStatus: null,
    httpStatusReason: 'The gRPC adapter does not expose an HTTP status.',
    ok: false,
    summary: null,
    responseSha256: null,
    responseHashScope,
  };
  try {
    // Installed tsx supplies scoped dynamic registration for the existing TS adapter.
    const { tsImport } = await import('tsx/esm/api');
    const { createTatumAdapter } = await tsImport('../src/adapters/tatum/index.ts', import.meta.url);
    const { default: canonicalize } = await import('canonicalize');
    const adapter = createTatumAdapter(apiKey);
    const envelope = await adapter.getTransaction(options.digest);
    const canonicalEnvelope = canonicalize(envelope);
    if (typeof canonicalEnvelope !== 'string') throw new Error('Invalid envelope.');
    result.responseSha256 = createHash('sha256').update(canonicalEnvelope, 'utf8').digest('hex');
    result.summary = summarize(envelope.evidence);
    result.ok = true;
  } catch {
    result.summary = null;
    result.responseSha256 = null;
    result.failure = 'Read-only lookup or response processing failed; provider details withheld.';
    process.exitCode = 1;
  }
  try {
    await emit(result, options.out);
  } catch {
    fail('Local JSON output failed; no retry was attempted.', 1);
  }
}

// Never allow an uncaught exception to echo arguments, credentials, or provider data.
try {
  await main();
} catch {
  fail('Probe failed; details withheld.', 1);
}

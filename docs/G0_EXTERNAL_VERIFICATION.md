# G0 external verification — 2026-10-26

## Evidence levels

**Published SDK types and public discovery verified; authenticated integration BLOCKED.** No account was created, no paid model call was made, no delegate configured, no mainnet transaction or memory write was attempted. Test identifiers starting `fixture-` are deliberately fake provider contracts, never receipts.

Registry snapshots and HTTP timestamps: `evidence/g0/*-registry.{txt,meta.json}`. Installed package/Node/presence probe: `installed-probe.json`. Actual versions: MemWal 0.1.9, Sui 2.37.0, Seal 1.5.1, protobuf-ts grpc-transport 2.11.1, grpc-js 1.14.6. Seal's required peer is Sui ^2.37.0. MemWal requires Sui and Seal; its Walrus/AI/zod peers are optional. Node is 24.22.1.

`memwal.d.ts`, `memwal-types.d.ts`, `sui-types.d.mts` are downloaded published declarations, not invented SDK contracts. Adapter source compiles against installed packages: `remember(text, namespace, {idempotencyKey})`, accepted job ID, `getRememberStatus`, `waitForRememberJob`, `listMemories` and `recall`; Sui native TLS transport with x-api-key metadata and typed Transaction/FailedTransaction branch. Whole-project typecheck evidence is recorded separately; unrelated integration errors must not be reported as SDK failures or a passing project build.

## Current official facts

[Event rules](https://thewalrussessions.wal.app/tatum-total-recall/index.html) read through web on 2026-10-26 05:05 UTC: mainnet memory writes, at least ten stored memories, relevant Tatum RPC data, public blog, working demo/public repository, 2–3 minute video, deadline November 10 2026 17:00 UTC. This is a requirements summary, not eligibility approval. Shell GET returned HTTP403 (`rules.meta.json`); no shell retry was made. Web tool read independently succeeded. [Current event page](https://recall-tatum-walrus.vercel.app/) HTTP200 snapshot is `event.txt`.

[Tatum gRPC guide](https://docs.tatum.io/reference/sui-grpc) supports the mainnet gRPC endpoint and TLS/x-api-key metadata. [Mysten transport docs](https://sdk.mystenlabs.com/sui/clients/grpc) specify native grpc-transport/grpc-js and typed read masks. The downloaded [public discovery](https://sui-mainnet-grpc.gateway.tatum.io/llms.txt) is in `tatum-discovery.txt`; endpoint advertisement is not authenticated transaction proof.

[Relayer config](https://relayer.memory.walrus.xyz/config) returned HTTP200 at the timestamp in `config.meta.json`: mainnet, grpc, internal Sui endpoint mysten-rpc.mainnet.sui.io. [Health](https://relayer.memory.walrus.xyz/health) returned HTTP200, writes ok, build 48e743b714d3ee5bf0bfc99451425e083b1117dc. These are public service status only, not account/delegate verification. MemWal internal RPC is distinct from the application's Tatum business-data path.

## Implemented boundaries

- Writes disabled by default. Persistent caller owns frozen text/key and accepted-job durability. Existing job polls never create a new write. Timeout/not_found stays uncertain, not failed success. No automatic retry is built into adapters.
- Done requires owner/namespace/job receipt agreement and remote recalled body SHA256 verification against the persisted expected hash. A job alone never becomes a portable rule.
- Restore enumerates all owner metadata (bounded 40), detects nonadvancing cursors/snapshot changes, then checks exact namespace blob set and exact remote text/event/hash set against locator-only manifest, followed by deterministic reducer state hash. No fixture/local body fallback, private SDK access or index repair is used. Recall may fail to return all bodies; that is explicit incomplete recovery, not success.
- Chain values retain atomic strings and BigInt aggregation. Unknown precision stays null; failed transactions, SUI gas ambiguity, swaps and unverified transaction semantics stay complex. No chain fact claims spending purpose. SDK error objects/headers never escape through provider errors.
- Model provider is optional server-configured structured JSON transport; results are strictly validated single-transaction proposals requiring confirmation. Missing/failed/malformed output returns manual mode, never fabricated AI or an active rule.

## Remaining blockers

Action: authenticated Tatum read of an approved mainnet digest. Target: fixed Tatum gRPC endpoint. Reason: credential not configured/authorized for this run. Completed: public discovery, official published-type compile and fake fault tests. Status: LIVE_BLOCKED_BY_CREDENTIALS.

Action: authenticated MemWal account read, frozen writes and fresh-process restore. Target: official relayer/account. Reason: no delegate/account configured and no writes authorized in this adapter task. Completed: public health/config, published-type compile, fake exact-set/readback tests. Status: LIVE_BLOCKED_BY_CREDENTIALS_AND_WRITE_AUTHORIZATION. Mainnet receipt count is zero.

Public export note: raw package registry bodies are omitted for privacy. Retained retrieval metadata byte counts describe the original bodies; pinned lockfile/package identities and published declarations remain available.

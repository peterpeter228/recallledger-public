# WP2 Tatum structural-transfer contract gate

## Offline authority and integrity

Inspected the already installed published `@mysten/sui@2.37.0` artifact; no network, credentials, signing, provider request or dependency change was used. `node_modules/@mysten/sui/package.json:6` reports `2.37.0`; the installed link resolves to `node_modules/.pnpm/@mysten+sui@2.37.0_typescript@5.9.3/node_modules/@mysten/sui` inside this worktree.

Both `pnpm-lock.yaml:347–349` and `node_modules/.pnpm/lock.yaml:347–349` record:

```text
sha512-WW5gs8y9EE3sd5u4vqA4Rw9Oo6iiA/yQRmRnj9KAtF59ykYpgUtSw+u9tJKCpZrN+0tPTeTUdUm6+o/eBYCHdw==
```

This is the lockfile's published-package integrity, not a newly downloaded tarball verification. Offline SHA-256 observations:

| File | SHA-256 |
| --- | --- |
| `pnpm-lock.yaml` and installed `.pnpm/lock.yaml` | `6f21ecb4387c5fb4dd6034893fa23b207fdc6cbc219a6974869fa34e256967fd` |
| SDK `dist/client/types.d.mts` | `90fec3c2ced3233faeb21f1a930b4c8120539d65b32a200faadeb7ac83741e55` |
| SDK `dist/transactions/data/v2.d.mts` | `84157fdab4d018c776082c2962b759767ae24fecad157bfa1e06a4a26c4c3257` |
| SDK `src/grpc/core.ts` | `2ffb6e776eb4547928533978bdfd1cde0e8285f3cb38c72cce6e5fb0539d8190` |
| SDK `src/bcs/bcs.ts` | `84cdb3ca7976c2e18b51712af2837cba70b0b9f2fd857662a8d89e19b589192f` |

## Published declarations and serialized shape

All paths below are relative to `node_modules/@mysten/sui/` in that artifact, not a repository's moving main branch:

- `dist/client/types.d.mts:276–318,350–368,385–388`: request `include:{effects:true,transaction:true,balanceChanges:true,objectTypes:true}`. Result is `$kind:'Transaction'`/`Transaction` or `$kind:'FailedTransaction'`/`FailedTransaction`. Status includes `error:null` on success; effects contain their own status and transaction digest.
- `dist/client/types.d.mts:300–305,385` and `dist/transactions/data/v2.d.mts:6–194`: `transaction` is `TransactionData extends SerializedTransactionDataV2`, directly containing `version:2`, `sender`, `gasData`, `inputs` and `commands`. It is **not** a `ProgrammableTransaction` wrapper. `objectTypes` is a separate `Record<string,string>` include mapping changed-object IDs to Move object types.
- `dist/transactions/data/v2.d.mts:43–118`: an owned object input is `{Object:{ImmOrOwnedObject:{objectId,version,digest}}}`; alternatives include shared/receiving/unresolved objects, pure/unresolved pure and funds withdrawal. An argument is `{Input:number}`, `{GasCoin:true}`, `{Result:number}` or `{NestedResult:[number,number]}`. The sole accepted command is `{TransferObjects:{objects:Argument[],address:Argument}}`.
- `src/client/transaction-resolver.ts:410–525,580–663`: actual gRPC conversion adds matching `$kind` metadata to those enums. Published serialized declarations use `EnumInputShape`, which does **not** declare nested `$kind`. The probe retains real runtime metadata in a separately inferred value, checks it structurally against `TransactionData`, then uses `satisfies IncludedTransaction` for both real result branches. The first direct-literal probe exposed this excess-property distinction (TypeScript exit 2); the corrected structural probe below passed before production edits. No `as any` or invented DTO was used.
- `src/grpc/core.ts:1062–1085,1522–1548`: gRPC includes request transaction sender/gas/expiration/kind and changed-object ID/type fields. `objectTypes` is built only from `effects.changedObjects[].objectId/objectType`, never balance changes.
- `src/bcs/bcs.ts:74–92,167–172`: Pure bytes are base64 of BCS bytes. `bcs.Address` is exactly 32 bytes and decodes to a hex address. The proof uses exported `fromBase64`, `toBase64` and `bcs.Address.parse`, requires canonical base64 and exactly 32 decoded bytes, and never guesses a text recipient.
- `dist/grpc/client.d.mts:58–65,113`: `SuiGrpcClient.getTransaction` preserves the requested include generic and is assignable to `IncludedTransaction` with the four selected includes.

## Pre-implementation typed gate

Command (from the execution worktree):

```sh
pnpm exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module ESNext --moduleResolution Bundler --lib ES2023,DOM --types node evidence/g0/tatum-proof-probe.ts
```

Observed final exit: **0**, with no compiler diagnostics. The compile-only probe includes a positive single-owned-coin transfer, a `FailedTransaction` fixture, inferred `getTransaction` include return typing and the supported address decoder. Its include function is never invoked. This proves compatibility with the installed declarations, not live provider completeness or runtime behavior. Subsequent implementation and deterministic behavior tests require the parent's offline acceptance run; no mid-flight tests/builds were run by the worker.

## Locked internal boundary and invariants

`getTransaction(digest)` returns `{evidence,transaction,objectTypes}` from that one result only after the existing digest/status normalization checks. `proveSimpleTransfer(envelope,wallet,coinType)` returns `{ok:true,digest,wallet,coinType,recipient}` or `{ok:false,reason}`. The raw fields stay server-internal; persisted/public observations and read-only reports contain normalized evidence (and optionally the small proof), never the envelope.

The proof accepts a successful wallet sender, one `TransferObjects`, nonempty unique owned object inputs bound by canonical object ID to exactly `0x2::coin::Coin<configured non-SUI type>`, and one Input-resolved Pure BCS recipient distinct from the sender. Successful transfer execution plus `ImmOrOwnedObject` and exact Coin type supplies ownership semantics; balance deltas are not ownership/type/command evidence. Result/GasCoin arguments, extra commands, multiple transfer recipients, shared/receiving/unresolved inputs, missing types, invalid references/indices and malformed bytes fail closed. Downstream normalized balance/status validation remains mandatory, with negative wallet flow and recipient/proof identity consistency; unknown decimals remain null.

Stable proof reason strings are defined by the discriminated union in `src/adapters/tatum/shape.ts`; they are diagnostic structural failures, not business-purpose labels. Synthetic cases are not live evidence. A proven-simple structure still needs user context or an explicitly confirmed matching rule before expense/tools classification.

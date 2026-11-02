/**
 * Walrus Memory — SDK Client
 *
 * Ed25519 delegate key based client that communicates with the Walrus Memory
 * Rust server (TEE). All data processing (encryption, embedding, Walrus)
 * happens server-side — the SDK just signs requests and sends text.
 *
 * The SDK only needs a single Ed25519 private key (the "delegate key").
 * The server derives the owner address from the public key via onchain
 * lookup in MemWalAccount.delegate_keys.
 *
 * @example
 * ```typescript
 * import { MemWal } from "@mysten-incubation/memwal"
 *
 * const memwal = MemWal.create({
 *     key: process.env.MEMWAL_PRIVATE_KEY,  // Ed25519 private key (hex)
 *     accountId: process.env.MEMWAL_ACCOUNT_ID, // Walrus Memory account object ID
 * })
 *
 * // Remember — returns an accepted background job immediately
 * const accepted = await memwal.remember("I'm allergic to peanuts")
 * await memwal.waitForRememberJob(accepted.job_id)
 *
 * // Recall — server: verify → embed query → search → download → decrypt
 * const result = await memwal.recall({ query: "food allergies" })
 * console.log(result.results[0].text) // "I'm allergic to peanuts"
 * ```
 */
import type { MemWalConfig, RememberResult, RecallResult, RecallOptions, RecallParams, EmbedResult, AnalyzeOptions, AnalyzeResult, AnalyzeWaitResult, HealthResult, RememberManualOptions, RememberManualResult, RecallManualOptions, RecallManualHitResult, RestoreResult, NamespacesResult, ListNamespacesOptions, MemoriesResult, ListMemoriesOptions, RememberBulkItem, RememberBulkOptions, RememberBulkAsyncOptions, RememberBulkResult, RememberAcceptedResult, RememberJobStatus, RememberBulkAcceptedResult, RememberBulkStatusResult, RelayerVersionMetadata } from "./types.js";
interface RememberCallOptions {
    /**
     * Optional idempotency key to prevent duplicate writes on retries.
     * Idempotency keys are scoped per (owner, namespace), so identical
     * keys across different namespaces will not collide. Retrying within
     * the same namespace with the same key dedupes, while reusing a key
     * with different text in the same namespace produces HTTP 409 Conflict.
     */
    idempotencyKey?: string;
    pollIntervalMs?: number;
    timeoutMs?: number;
}
export declare class MemWal {
    private privateKey;
    private publicKey;
    private destroyed;
    private serverUrl;
    private namespace;
    private accountId;
    /** Deadline applied to any request that does not name its own. */
    private requestTimeoutMs;
    /**
     * Recall's abort budget, and the independent per-round-trip budget for the
     * unauthenticated preflights that precede it. Separate so a slow
     * `/version`, `/health` or `/config` is never charged against recall.
     */
    private recallTimeoutMs;
    private preflightTimeoutMs;
    private sessionCache;
    private serverConfig;
    private relayerVersionMetadata;
    /** Single-flight guard so concurrent requests share one SessionKey build. */
    private sessionBuildPromise;
    /** Single-flight guard so concurrent requests share one compatibility probe. */
    private compatibilityPromise;
    /** Resolved owner address for this account. See `resolveOwner()`. */
    private ownerAddress;
    /** Single-flight guard so concurrent reads share one owner resolution. */
    private ownerPromise;
    /**
     * Keep a generated idempotency key while a remember request has no
     * acknowledged response. If the transport times out after the server
     * accepted the write, the caller's next identical attempt reuses the key
     * and collapses onto the original paid job.
     */
    private pendingRememberKeys;
    private constructor();
    /**
     * Create a new Walrus Memory client instance.
     *
     * @param config.key - Ed25519 private key (hex or `suiprivkey1...`) — the delegate key
     * @param config.serverUrl - Server URL (default: https://relayer.memory.walrus.xyz)
     */
    static create(config: MemWalConfig): MemWal;
    /**
     * Securely wipe the private and public keys from memory.
     * Prevents key extraction from V8 heap dumps.
     */
    destroy(): void;
    /**
     * Submit a remember request and return as soon as the server accepts the job.
     */
    rememberAsync(text: string, namespaceOrOptions?: string | {
        idempotencyKey?: string;
    }, options?: {
        idempotencyKey?: string;
    }): Promise<RememberAcceptedResult>;
    /**
     * One-shot lookup of a remember job's current state. Returns the
     * full state machine value (`pending` | `running` | `uploaded` |
     * `done` | `failed` | `not_found`) without polling.
     *
     * Useful when the caller wants to drive its own polling loop and
     * surface intermediate states to a UI — `waitForRememberJob` only
     * resolves at the terminal state and hides progress.
     */
    getRememberStatus(jobId: string): Promise<RememberJobStatus>;
    /**
     * Poll an accepted remember job until it reaches a terminal state.
     */
    waitForRememberJob(jobId: string, opts?: {
        pollIntervalMs?: number;
        timeoutMs?: number;
    }): Promise<RememberResult>;
    /**
     * Remember something and wait for the background job to complete.
     */
    rememberAndWait(text: string, namespaceOrOptions?: string | RememberCallOptions, opts?: RememberCallOptions): Promise<RememberResult>;
    /**
     * Remember something and return as soon as the server accepts the job.
     *
     * The relayer continues embedding, encrypting, uploading, and indexing in the background.
     * Use rememberAndWait() when the caller needs the final blob_id before continuing.
     *
     * A plain object in the namespace position is options, so
     * `remember(text, { idempotencyKey })` keeps the client namespace. (#1142)
     */
    remember(text: string, namespaceOrOptions?: string | {
        idempotencyKey?: string;
    }, options?: {
        idempotencyKey?: string;
    }): Promise<RememberAcceptedResult>;
    /**
     * Remember multiple memories in one batched request (ENG-1408).
     *
     * Server handles: verify → embed + SEAL-encrypt all items concurrently →
     * upload N blobs to Walrus in parallel → 1 PTB per wallet slot for
     * set-metadata + transfer. This collapses `N × (2 + 1)` Sui transactions
     * into roughly `2N + K` where K ≤ wallet pool size.
     *
     * Returns `202 Accepted` immediately with `job_ids[]`.
     *
     * @param items - Array of `{ text, namespace? }` items (max 20 per call)
     *
     * @example
     * ```typescript
     * const accepted = await memwal.rememberBulk([
     *     { text: "I love coffee" },
     *     { text: "I live in Tokyo", namespace: "profile" },
     * ])
     * console.log(accepted.job_ids)
     * ```
     */
    rememberBulkAsync(items: RememberBulkItem[], options?: RememberBulkAsyncOptions): Promise<RememberBulkAcceptedResult>;
    getRememberBulkStatus(jobIds: string[], opts?: {
        timeoutMs?: number;
    }): Promise<RememberBulkStatusResult>;
    waitForRememberJobs(jobIds: string[], namespaces?: string[], opts?: RememberBulkOptions): Promise<RememberBulkResult>;
    /**
     * Remember multiple memories and return as soon as the server accepts the jobs.
     */
    rememberBulk(items: RememberBulkItem[], options?: RememberBulkAsyncOptions): Promise<RememberBulkAcceptedResult>;
    /**
     * Remember multiple memories and wait until every job reaches a terminal state.
     */
    rememberBulkAndWait(items: RememberBulkItem[], opts?: RememberBulkOptions): Promise<RememberBulkResult>;
    /**
     * Estimate the token cost of a string using the SDK's default
     * character-based approximation (~chars/4, code-point aware). Useful to weigh
     * a recall payload before injecting it into a model context:
     *
     * ```ts
     * const hits = await memwal.recall({ query, limit: 8 });
     * const joined = hits.results.map((h) => h.text).join("\n---\n");
     * if (memwal.countTokens(joined) > 2048) { /* re-query with maxTokens *\/ }
     * ```
     *
     * This is an estimate, not an exact tokenizer count — see `estimateTokens`
     * for accuracy caveats. For exact counts, pass your own counter to
     * `recall({ maxTokens, countTokens })`.
     */
    countTokens(text: string): number;
    /**
     * Recall memories similar to a query — server handles:
     * verify → embed query → search → Walrus download → decrypt → return plaintext.
     *
     * **Preferred call style**: pass a single `RecallParams` object
     * so call sites read self-describingly:
     * ```ts
     * memwal.recall({ query: "food allergies", limit: 5, namespace: "profile" })
     * ```
     *
     * The legacy positional forms remain supported for backwards compatibility:
     * - `recall(query)`
     * - `recall(query, limit)`
     * - `recall(query, limit, namespace)`
     * - `recall(query, { limit, namespace, maxDistance, topK })`
     *
     * `recall(query, namespace)` is invalid and throws `TypeError`.
     *
     * `topK` and `limit` are aliases; if both are set, `topK` wins.
     *
     * @returns RecallResult with decrypted text results
     *
     * @example
     * ```typescript
     * // Object style — recommended
     * const result = await memwal.recall({
     *     query: "food allergies",
     *     limit: 5,
     *     namespace: "profile",
     * });
     * for (const memory of result.results) {
     *     console.log(memory.text, memory.distance);
     * }
     *
     * // Positional style — still works
     * const result2 = await memwal.recall("food allergies", 5, "profile");
     * ```
     */
    recall(params: RecallParams): Promise<RecallResult>;
    /**
     * @deprecated Positional `recall(query, limit, namespace)` is easy to
     * misread as `recall(query, namespace)`, which throws `TypeError`. Prefer
     * `recall({ query, limit, namespace })`. Positional will be removed in a
     * future major version of the SDK.
     */
    recall(query: string, options: RecallOptions): Promise<RecallResult>;
    /**
     * @deprecated Positional `recall(query, limit, namespace)` is easy to
     * misread as `recall(query, namespace)`, which throws `TypeError`. Prefer
     * `recall({ query, limit, namespace })`. Positional will be removed in a
     * future major version of the SDK.
     */
    recall(query: string, limit?: number, namespace?: string): Promise<RecallResult>;
    /**
     * Remember (manual mode) — user handles SEAL encrypt and embedding.
     * The relayer uploads the encrypted bytes to Walrus and stores the
     * vector ↔ blobId mapping.
     *
     * Trust boundary (ENG-1696): the delegate private key is NOT transmitted on
     * this request. Manual-mode handlers on the server never invoke SEAL
     * decrypt, so the key stays client-side as the name implies.
     *
     * @param opts.encryptedData - Base64-encoded SEAL-encrypted bytes
     * @param opts.vector - Embedding vector (user already generated, e.g. 1536-dim)
     * @returns RememberManualResult with id, blob_id, owner
     *
     * @example
     * ```typescript
     * const encryptedData = Buffer.from(sealEncryptedBytes).toString("base64")
     * const vector = await myEmbeddingModel.embed(text)
     * const result = await memwal.rememberManual({ encryptedData, vector })
     * ```
     */
    rememberManual(opts: RememberManualOptions): Promise<RememberManualResult>;
    /**
     * Recall (manual mode) — user provides a pre-computed query vector.
     * Server returns matching blobIds + distances.
     * User then downloads from Walrus + SEAL decrypts on their own.
     *
     * Trust boundary (ENG-1696): the delegate private key is NOT transmitted on
     * this request. Server returns blob IDs only; decryption happens entirely
     * on the client.
     *
     * @param opts.vector - Pre-computed query embedding vector
     * @param opts.limit - Max results (default: 10)
     * @param opts.scoringWeights - Optional composite-scoring weights
     * @returns RecallManualHitResult with blob_id + distance pairs (no decrypted text)
     *
     * @example
     * ```typescript
     * // 1. User generates query embedding
     * const queryVector = await myEmbeddingModel.embed("food allergies")
     *
     * // 2. Search for similar vectors
     * const hits = await memwal.recallManual({ vector: queryVector })
     *
     * // 3. User downloads + decrypts each result
     * for (const hit of hits.results) {
     *     const encrypted = await walrus.download(hit.blob_id)
     *     const plaintext = await seal.decrypt(encrypted)
     *     console.log(plaintext, hit.distance)
     * }
     * ```
     */
    recallManual(opts: RecallManualOptions): Promise<RecallManualHitResult>;
    /**
     * Generate an embedding vector for text (no storage).
     *
     * @param text - Text to embed
     * @returns EmbedResult with vector
     */
    embed(text: string): Promise<EmbedResult>;
    /**
     * Analyze conversation text and return as soon as extracted facts are accepted.
     *
     * The relayer extracts facts synchronously, returns one job_id per fact, then
     * embeds, encrypts, uploads, and indexes each fact in the background.
     *
     * @param text - Conversation text to analyze
     * @returns AnalyzeResult with extracted facts and accepted job_ids
     *
     * @example
     * ```typescript
     * const result = await memwal.analyze("I love coffee and live in Tokyo")
     * console.log(result.job_ids)
     * ```
     */
    analyze(text: string, namespaceOrOptions?: string | AnalyzeOptions): Promise<AnalyzeResult>;
    /**
     * Analyze conversation text and wait until every extracted fact is stored.
     */
    analyzeAndWait(text: string, namespaceOrOptions?: string | AnalyzeOptions, opts?: RememberBulkOptions): Promise<AnalyzeWaitResult>;
    /**
     * Rebuild missing local index entries for `namespace` from Walrus.
     *
     * The relayer queries Walrus for blobs the caller owns in `namespace`,
     * ignores blobs already indexed locally, downloads the missing ones,
     * SEAL-decrypts them with the delegate key, re-embeds the plaintext,
     * and inserts a fresh vector row per blob.
     *
     * **Response semantics**:
     * - `restored` — blobs that completed the full
     *   download → decrypt → embed → DB insert pipeline this call.
     * - `skipped` — on-chain blobs already in the local success index
     *   (no work needed). Does not include permanent decrypt/UTF-8 failures.
     * - `failed` — permanent decrypt/UTF-8 failures on this on-chain page:
     *   negative-cache hits plus any new permanent failures this call.
     *   Transient download/decrypt/embed errors are not counted here; when
     *   a page yields only those, `truncated` is true so the caller retries.
     * - `total` — on-chain blobs the relayer saw for `(owner, namespace)`
     *   before the limit was applied.
     *
     * **`limit`** caps the *number of missing blobs the relayer selects* from
     * the candidates it sees, in unspecified order. It is not a cap on
     * `restored` directly. The server default is `10` (matches the SDK
     * default).
     *
     * **No pagination cursor** — restore is single-shot. A larger `limit` may
     * help when `truncated` is caused by the request limit, but candidate
     * discovery also has a per-owner source cap shared across namespaces.
     * Hitting that cap requires cursor/pagination support for guaranteed full
     * recovery; increasing `limit` or retrying cannot guarantee it.
     *
     * **Performance** scales linearly in `limit`: up to 10 Walrus downloads
     * in parallel, then 3 SEAL decrypts in parallel, then embeddings.
     * Expect seconds-per-blob on cold caches.
     *
     * @param namespace - Namespace to restore (exact match; no prefix/hierarchy)
     * @param limit - Max blobs to inspect this call (default: 10)
     * @returns RestoreResult with restored / skipped / failed / total counts
     *
     * @example
     * ```typescript
     * const result = await memwal.restore("my-app");
     * console.log(`restored=${result.restored} skipped=${result.skipped} failed=${result.failed} total=${result.total}`);
     * ```
     */
    restore(namespace: string, limit?: number): Promise<RestoreResult>;
    /**
     * List the namespaces this account holds memories in.
     *
     * Recall is similarity-ranked and needs a namespace to search; without
     * this, an agent connecting to an unfamiliar account has to guess names
     * or fall back to `"default"`. Returns metadata only — no blob fetch, no
     * decryption.
     *
     * Paginate with `has_more`, NOT page length: the server clamps `limit`,
     * so asking for more than the cap returns exactly the cap.
     *
     * ```ts
     * let cursor: string | undefined;
     * let more = true;
     * while (more) {
     *     const page = await memwal.listNamespaces({ cursor });
     *     for (const ns of page.namespaces) console.log(ns.name, ns.memory_count);
     *     cursor = page.next_cursor ?? undefined;
     *     more = page.has_more;
     * }
     * ```
     */
    listNamespaces(options?: ListNamespacesOptions): Promise<NamespacesResult>;
    /**
     * List the memories this account holds, without a semantic query.
     *
     * Recall is similarity-ranked and limit-bounded, so it cannot confirm a
     * write or count a namespace. This walks the full inventory instead.
     * Returns metadata only — no blob fetch, no decryption; use `recall()`
     * for content.
     *
     * `namespace` is filtered client-side: the relayer lists every namespace,
     * so a filtered page can be short or empty while `has_more` is true.
     * Paginate with `has_more`, NOT page length.
     *
     * ```ts
     * let cursor: string | undefined;
     * let more = true;
     * let count = 0;
     * while (more) {
     *     const page = await memwal.listMemories({ cursor, namespace: "work" });
     *     count += page.memories.length;
     *     cursor = page.next_cursor ?? undefined;
     *     more = page.has_more;
     * }
     * ```
     */
    listMemories(options?: ListMemoriesOptions): Promise<MemoriesResult>;
    /**
     * Resolve this account's owner address, memoised for the client's life.
     *
     * The owner-scoped read routes take the address in the path and reject a
     * mismatch against the caller's credentials — but `MemWalConfig` carries
     * only the delegate key and account id, so the SDK has to learn its own
     * address from the server.
     *
     * `POST /api/stats` is used because it authenticates with the same
     * delegate scheme, needs nothing but a namespace, is rate-limit weight 1,
     * and returns the owner the server resolved. Using a stats endpoint as a
     * whoami is admittedly indirect; it avoids a server change and keeps this
     * working against relayers older than any such change. If a dedicated
     * self-reference lands (e.g. accepting `me` as the path owner), this
     * method is the only place that needs to change.
     */
    private resolveOwner;
    /**
     * Check server health. The endpoint is public and does not require request signing.
     */
    health(): Promise<HealthResult>;
    /**
     * Fetch and validate the relayer compatibility contract.
     */
    compatibility(): Promise<RelayerVersionMetadata>;
    /**
     * Get the public key (hex string).
     */
    getPublicKeyHex(): Promise<string>;
    private getPublicKey;
    private ensureCompatibleRelayer;
    private fetchCompatibilityMetadata;
    private fetchServerConfig;
    private buildSealSessionInner;
    private buildSealSession;
    /**
     * Make a signed request to the server.
     *
     * Signature format (LOW-23 updated):
     *   "{timestamp}.{method}.{path_and_query}.{body_sha256}.{nonce}.{account_id}"
     *
     * Headers: x-public-key, x-signature, x-timestamp, x-nonce, x-account-id
     *
     * The nonce is a UUID v4 generated per-request and tracked server-side
     * in Redis (TTL=600s) to prevent replay attacks.
     *
     * LOW-23: x-account-id is now included in the signed canonical message so
     * an intermediary cannot swap the account hint without invalidating the
     * signature. Server-side verification in services/server/src/auth.rs must
     * use the matching message format.
     *
     * ENG-1696: Callers set `includeDelegateKey: false` on Manual-mode routes
     * so the delegate private key is not transmitted. Manual-mode docstrings
     * promise the key stays client-side; the server does not need it on those
     * routes because Manual-mode handlers never invoke SEAL decrypt.
     *
     * ENG-1697: On Relayer-mode routes the SDK builds a SEAL SessionKey
     * client-side (emitted via `x-seal-session`). The SessionKey is ephemeral
     * (5-min TTL, scoped to the server's `packageId`) so a wire capture has
     * a bounded blast radius. Requires `@mysten/seal` and `@mysten/sui`.
     */
    /**
     * Make a signed request to the server.
     *
     * @param acceptedStatuses - HTTP status codes to treat as success (default [200]).
     *   Pass [200, 202] for endpoints that return 202 Accepted.
     */
    /**
     * `fetch` plus the JSON body read, with this client's deadline applied across both.
     *
     * For the handshake endpoints that skip request signing — `/health`,
     * `/version`, `/config`. They are the worst place to leave unbounded: the
     * compatibility probe and config fetch run before the first real call, so
     * one stalled socket there hangs every method on the client, not just one.
     */
    /** Deadline for one status poll: the client deadline, clamped so it can
     * never outlive the wait budget it belongs to, but given a usable minimum
     * at or past the deadline so a boundary check does not fail with an
     * artificial 1ms AbortError (#1081). */
    private pollDeadlineMs;
    private fetchWithDeadline;
    private signedRequest;
}
export {};
//# sourceMappingURL=memwal.d.ts.map
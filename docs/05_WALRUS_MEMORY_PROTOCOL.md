# 05 · Walrus Memory 接入、持久化与可携带恢复

> 项目：RecallLedger。核验及文中来源访问日期：2026-10-26（北京时间）。本文是开发规格，不是已经通过主网验收的证明。范围：一个 owner、一个运营者、12 条冻结演示记忆，React + Vite、Fastify Node、Postgres + outbox。公开访客修改停留在自己的临时会话，只有运营者能触发真实写入。

## 1. 最重要的实现决定

采用官方 `@mysten-incubation/memwal` 默认客户端。Walrus 保存可携带的事件记忆；Postgres 保存操作台投影、幂等写入任务及回执。业务状态由严格校验过的事件确定性重放获得。LLM 和语义召回负责提出分类建议、检索解释资料；它们不能决定哪个规则版本生效。

P0 的恢复证明准确名称为 **Walrus-backed relayer portable restore**：停止当前进程后，一个没有旧 Postgres 投影、浏览器缓存和本地事件正文的新进程，使用合法委托凭证，从 Walrus Memory 中继器读取记忆，再恢复出相同状态。这个证明不意味着完全绕过中继器，也不证明任意规模、索引全部丢失后的灾难恢复。

本次确认了 npm 发布物 `0.1.9`，包括 `listMemories`、`listNamespaces`、`getRememberStatus`、`rememberAndWait`。实际编码时安装并锁定精确版本、保存 lockfile，编译本地使用的方法；不要仅凭 `dev` 分支文档推断已部署服务支持相同接口。[npm 发布元数据](https://registry.npmjs.org/@mysten-incubation%2fmemwal/0.1.9) · [0.1.9 发布物类型](https://unpkg.com/@mysten-incubation/memwal@0.1.9/dist/memwal.d.ts)

默认接入还要显式安装运行时使用的 `@mysten/sui` 和 `@mysten/seal`；二者是 MemWal 的 required peer dependencies。`peerDependenciesMeta` 仅把 `@mysten/walrus`、`ai`、`zod` 标为 optional。实际创建 Seal session 时需要 Sui 和 Seal。本次可核对的组合起点是 `memwal 0.1.9`、`sui 2.37.0`、`seal 1.5.1`，其中 Seal 的 peer 为 `@mysten/sui ^2.37.0`，Sui 要求 Node `>=22`。这是发布物及 peer 元数据核验，尚不是组合端到端实测；G0 必须编译和认证读取验证，G4 再完成冻结记忆写入与恢复验收。[Sui 发布元数据](https://registry.npmjs.org/@mysten%2fsui/2.37.0) · [Seal 发布元数据](https://registry.npmjs.org/@mysten%2fseal/1.5.1)

## 2. 已核验事实与尚待实测的边界

| 项目 | 本次证据 | 开发时的处理 |
|---|---|---|
| SDK 包及导出 | npm 0.1.9 存在；Node engine 为 `>=20.0.0`；默认入口和 `/account`、`/manual`、`/ai` 存在 | P0 只用默认入口；不为默认接入引入自管加密与自建 relayer |
| `remember` | 先返回接受任务，不等于存储完成 | 持久保存 `job_id` 并轮询 |
| `waitForRememberJob` | 完成后返回 `id`、`blob_id`、`owner`、`namespace`；类型中 `job_id` 可选 | 必须保留完整回执；`jobId` 优先使用最初已持久化的 accepted job ID |
| `listMemories` | 发布物有此方法；返回 metadata，未下载/解密正文 | 用于枚举 ID、状态和到期信息；正文另取 |
| 主网 relayer | 公开 `/config` 实读为 `network=mainnet`、`suiTransport=grpc`；`/health` 实读 `writes=ok` | 仅证明当时公开服务状态；未验证本项目账户认证或成功写入 |
| Seal | SDK 自行生成短期 session 并签名 | 不自行拼私钥 HTTP 请求头 |
| 主网端到端 | 未使用用户凭证，未写入主网 | G0 补真实凭证读取 smoke test；G4 补 12 条记忆回执和恢复测试 |

源码交叉核对基线：[`MystenLabs/walrus-memory@4eb1fc09abe3f7a5de6407ecdafea0feb19a5cfb`](https://github.com/MystenLabs/walrus-memory/tree/4eb1fc09abe3f7a5de6407ecdafea0feb19a5cfb)，提交时间为 2026-10-25；`packages/sdk/package.json` 为 0.1.9。公开运行中的 relayer `/health` 当时报告的 build commit 为 `48e743b714d3ee5bf0bfc99451425e083b1117dc`，不要把 SDK、仓库 HEAD 和远端部署版本当成同一件事。[源码 package.json](https://github.com/MystenLabs/walrus-memory/blob/4eb1fc09abe3f7a5de6407ecdafea0feb19a5cfb/packages/sdk/package.json) · [公开 health](https://relayer.memory.walrus.xyz/health)

## 3. 凭证与信任边界

### 3.1 服务端变量

```dotenv
MEMWAL_PRIVATE_KEY=<server-secret-delegate-key>
MEMWAL_ACCOUNT_ID=<MemWalAccount-object-id-not-wallet-address>
MEMWAL_SERVER_URL=https://relayer.memory.walrus.xyz
MEMWAL_NAMESPACE=recallledger-demo-v1
ALLOW_MAINNET_MEMORY_WRITES=false
OWNER_MEMORY_INVENTORY_LIMIT=40
MAINNET_MEMORY_WRITE_LIMIT=20
```

账户对象 ID 不是钱包地址。委托私钥只进入后端 secret 配置，不得进入 `VITE_*`、前端 bundle、浏览器存储、提交仓库、日志或导出的证据。公开 API 只返回白名单化的状态和业务数据。项目不需要保存 owner 钱包私钥。

`MAINNET_MEMORY_WRITE_LIMIT=20` 限制本次受控构建可新建的逻辑写入任务；同一已冻结 payload/key 的网络重试不重置预算、不生成新任务。`OWNER_MEMORY_INVENTORY_LIMIT=40` 约束 owner 跨 namespace 的完整受控历史上传，包含旧测试和孤儿上传。公开部署保持写入开关关闭；只有运营者在 G4 明确启用写入时消费构建预算。

委托密钥授权覆盖整个账户。namespace 只是检索分组，不能隔离同一账户上的其他委托；给评委一个委托私钥相当于给了账户级访问能力。P0 不发放公用委托密钥，采用无秘密的证据包，以及通过服务端限权的公开演示。[Ownership and Permissions](https://docs.wal.app/walrus-memory/contract/ownership-and-permissions)

默认客户端把明文交给 relayer 处理 embedding、Seal 加密及 Walrus 上传，不能宣传成“明文从未离开本机”或“中继器看不到数据”。因此冻结演示集只用明确标注的合成业务说明及已获授权的公开交易引用，不使用真实私人账单。原文建议把所有地址哈希化也不等于匿名：低熵标识和可枚举地址不能靠普通 SHA-256 保证隐私。[默认客户端](https://docs.wal.app/walrus-memory/sdk/usage/memwal) · [信任模型](https://docs.wal.app/walrus-memory/fundamentals/architecture/data-flow-security-model)

### 3.2 不重写官方鉴权

默认 SDK 为请求签名，协议包括 nonce、时间戳、请求方法/路径、body hash 和 account hint；解密请求使用 `x-seal-session`。没有必要自建签名层。旧 `x-delegate-key` 私钥传输方式已弃用，不使用。官方 changelog 表明 nonce 与 session 迁移始于 **0.0.2**；原方案把相关版本写成 0.2/0.5 或只以 0.1.8 为起点不准确。[Relayer HTTP API](https://docs.wal.app/walrus-memory/relayer/api-reference) · [SDK changelog](https://github.com/MystenLabs/walrus-memory/blob/4eb1fc09abe3f7a5de6407ecdafea0feb19a5cfb/packages/sdk/CHANGELOG.md)

现行 Seal 策略还包含 `access_counter_version`。撤销委托或冻结账户使未来加密身份轮换，但不能让已经获得的旧明文或旧解密能力消失。使用官方 SDK 管理；不缓存自建的旧 counter 去加密新数据。[权限和轮换机制](https://docs.wal.app/walrus-memory/contract/ownership-and-permissions)

### 3.3 MemWal 内部链访问与 Tatum 的区别

默认 `MemWal.create` 的公开配置不接受通用 `suiClient` 注入。它会从 relayer `/config` 读取网络和 Seal RPC，再自行构造客户端。本次主网 `/config` 返回 gRPC URL `https://mysten-rpc.mainnet.sui.io`。项目自己的交易读取使用 Tatum；不能因此声称 MemWal 内部所有链访问也走 Tatum。不要猴子补丁 SDK，只为满足一个并不存在的“所有请求必须用 Tatum”解释。[公开 config](https://relayer.memory.walrus.xyz/config) · [固定源码中的配置与 Seal session 构建](https://github.com/MystenLabs/walrus-memory/blob/4eb1fc09abe3f7a5de6407ecdafea0feb19a5cfb/packages/sdk/src/memwal.ts)

## 4. 事件正文与回执契约

业务事件的最终字段以数据模型文档为准。接入层接收 `canonicalEventJson`，不另造同义 event schema。统一信封使用 `schemaVersion:'1.0'`、`eventId`、`scopeId`、`sequence`、`kind`、`eventTime`、`recordedAt`、`inputRef`、`evidenceKind`、`payload`、`parentEventIds`、`previousEventHash`、`author`、`confirmation`。分类纠正必须保留用户确认及其作用范围。`rule_revoked` 只影响未来规则匹配；不能重写以前已确认的单笔交易。`correction_confirmed` 只更正其明确指向的 transaction。

### 4.1 规范化与哈希

1. schema 校验成功后，使用项目统一的 canonical JSON 实现生成固定 UTF-8 字节。
2. 金额必须为原子单位十进制字符串，禁止 JSON number 表示资金。
3. event ID、逻辑顺序、发生时间、用户确认结果在首次提交前冻结；重试不得产生新 UUID 或 `new Date()`。
4. `eventHash = SHA256(UTF8(JCS(event)))` 用于 `previousEventHash` 链；hash 不作为 event 自身的内嵌字段，避免自引用。
5. `memoryText` 固定为 `RecallLedger event v1\n` 加 canonical JSON。`textSha256 = SHA256(UTF8(memoryText))` 是**实际交给 remember 的完整文本**的 hash，与 `eventHash` 不同。解析时严格校验前缀和 JSON；不得由 LLM 自由改写回来的正文代替原记录。
6. 不把全部过程推理写入记忆；记录可审计的理由摘要、引用和用户纠正即可。

```ts
// Application-owned interfaces; not third-party SDK type declarations.
export interface MemoryWriteRequest {
  operationId: string;
  namespace: string;
  memoryText: string;
  textSha256: string;
}

export interface MemoryReceipt {
  memoryId: string;
  jobId: string;
  blobId: string;
  ownerAddress: string;
  namespace: string;
  status: 'done';
  textSha256: string;
  verifiedAt: string;
  blobObjectId: string | null;
  endEpoch: string | null;
  expiresAt: string | null;
}
```

字段映射：SDK `id → memoryId`、最初接受的 `job_id → jobId`、`blob_id → blobId`、`owner → ownerAddress`。若最终回执也带 `job_id`，必须与原 job 一致；`RememberResult.job_id` 在 0.1.9 类型中可选，不能用非空断言假定存在。`listMemories` 返回的 `memory_id` 映射相同应用字段；`end_epoch` 的 SDK 类型是 `number|null`，适配器校验非负安全整数后转为十进制字符串；`expires_at` 未提供时保留 `null`。`blob_id` 与 Sui blob object ID 不能混用；没有解析出 object ID 就不编造链接。SDK receipt 本身通常不直接提供 blob object ID。[API 返回形状](https://docs.wal.app/walrus-memory/sdk/api-reference) · [固定类型源码](https://github.com/MystenLabs/walrus-memory/blob/4eb1fc09abe3f7a5de6407ecdafea0feb19a5cfb/packages/sdk/src/types.ts)

## 5. Postgres outbox：一次业务意图，一份可恢复任务

### 5.1 数据库职责

在同一个 Postgres transaction 中写入业务事件及 outbox 行。`operation_id`、事件 ID 建唯一约束。Outbox 至少保存 `namespace`、完整 `memory_text`、`text_sha256`、`idempotency_key`、`job_id`、状态、尝试次数、下次执行时间和最后错误分类。若同一 operation ID 对应不同 payload，返回冲突，不能覆盖。

单进程 worker 足够；用数据库行锁/租约认领任务，避免重启或重复调度并发同一事件。P0每scope只接受一个未决mutation，前序未done则新写返回04的MEMORY_PENDING；memoryVersion只能推进连续done前缀，不能跳过失败序号。P0 不引入 Redis。公开请求不能直接任意调用 `remember`；仅运营者的确认动作创建允许的 outbox 任务。

### 5.2 状态机

| 应用状态 | 含义 | 下一步 |
|---|---|---|
| `prepared` | 事件正文与 key 已持久化，尚未收到接受回执 | 发送同一 payload 与同一 key |
| `submitting` | 已发出，但可能未收到响应 | 若响应丢失，仍用原 key 重试 |
| `accepted` | 已保存 `job_id` | 只轮询该 job |
| `pending` / `running` / `uploaded` | SDK 中间状态 | 按退避计划继续轮询；未计为已持久化 |
| `done` | SDK 已报告完成且完整回执落库 | 标为可携带、可用于已确认规则 |
| `retry_wait` | 暂时失败或轮询超时 | 到期恢复同一任务；不能创建新事件 |
| `failed` | 已确定的终态失败 | 展示具体原因；修复后按明确恢复路径处理 |
| `blocked` | 凭证/版本/配置/预算不满足 | 暂停此写入路径，其他只读功能继续 |

浏览器可以立即显示本地会话的纠正预览，但须标注 `等待持久化`。只有经用户确认且记忆同步完成的规则，才可成为以后新会话默认自动应用的规则。原数据和后来的分类解释必须分开；一次错误自动建议不能自行成为新规则。

### 5.3 SDK 调用形状

以下代码展示文档已核对的调用方式，outbox 持久化与错误处理仍须实现；不是一份已执行的主网程序。

```ts
import { MemWal } from '@mysten-incubation/memwal';

const memwal = MemWal.create({
  key: requireEnv('MEMWAL_PRIVATE_KEY'),
  accountId: requireEnv('MEMWAL_ACCOUNT_ID'),
  serverUrl: requireEnv('MEMWAL_SERVER_URL'),
  namespace: requireEnv('MEMWAL_NAMESPACE'),
  requestTimeoutMs: 30_000,
  recallTimeoutMs: 15_000,
  preflightTimeoutMs: 5_000,
});

// Load text/key from Postgres; do not recompute event fields here.
const accepted = await memwal.remember(row.memoryText, row.namespace, {
  idempotencyKey: row.idempotencyKey,
});
await persistAcceptedJob(row.operationId, accepted.job_id);

// Worker can resume this after a restart.
const result = await memwal.waitForRememberJob(accepted.job_id, {
  timeoutMs: 60_000,
});
await persistReceipt(row.operationId, result);
```

如果在 `accepted` 响应和数据库保存之间崩溃，恢复时使用原 key 再提交，取回同一任务。官方自动生成 key 的 30 分钟 bucket 不能保证跨时间边界、跨进程幂等；本项目总是使用持久保存的显式 key。批量接口上限 20，并不意味着必须使用批量；12 条冻结记忆采用单条顺序提交更容易定位，保存次序仍以事件逻辑顺序为准。[Production Readiness](https://docs.wal.app/walrus-memory/sdk/production-readiness)

### 5.4 错误恢复规则

- 未收到接受响应：重试原 operation，正文/key 都不变。
- 已有 job ID：轮询原 job。等待超时只表示状态未知，不代表失败或取消。
- 429：尊重服务端 retry delay，有限退避并回写 `next_attempt_at`。
- 401：检查 account ID、委托注册和账户状态；禁止无限刷新/换 key。
- 409：同一幂等 key 对应不同 payload，是本地一致性错误，停止该任务。
- 426：读取兼容性信息并更新锁定依赖后验证，不能靠盲重试。
- `failed`：保留错误证据，检查是否已有 blob、是否为永久错误；不无限重新播种。

禁止原方案中的“失败就自动 namespace v2、重新播种”。这样会改变幂等作用域，并可能产生第二份收费写入、遗漏旧记忆和错误比赛证据。namespace 变更必须是明确版本迁移，由操作员看到原因和迁移清单后执行。

## 6. 精确枚举、语义召回和恢复各司其职

### 6.1 精确枚举 metadata

```ts
const rows = [];
let cursor: string | undefined;
let pages = 0;
do {
  const page = await memwal.listMemories({
    namespace: targetNamespace,
    cursor,
    limit: 100,
  });
  if (page.must_resync) throw new Error('METADATA_RESYNC_REQUIRED');
  rows.push(...page.memories);
  if (!page.has_more) break;
  if (!page.next_cursor || page.next_cursor === cursor) {
    throw new Error('NON_ADVANCING_MEMORY_CURSOR');
  }
  cursor = page.next_cursor;
  if (++pages > 20) throw new Error('DEMO_ACCOUNT_LIMIT_EXCEEDED');
} while (true);
```

`namespace` 是客户端过滤，因此空页仍可能 `has_more=true`。继续条件只能看服务端游标状态。若过程中 snapshot 变化导致不能组成一致快照，冻结写入后重走一遍，并检查 `snapshot_version`/`must_resync`。枚举所有 owner 记忆来检查 40 条上限时，必须**省略 namespace 过滤**。[SDK API](https://docs.wal.app/walrus-memory/sdk/api-reference) · [发布源码的 listMemories](https://github.com/MystenLabs/walrus-memory/blob/4eb1fc09abe3f7a5de6407ecdafea0feb19a5cfb/packages/sdk/src/memwal.ts)

### 6.2 语义召回不能证明最新状态

正常业务解释可调用 `recall({query,limit})`，展示相关记忆和引用。状态选择必须由完整事件集中的逻辑版本与 supersession 规则计算。`sort:'recent'` 也只是在语义候选中找较新项；不能证明全账户最新。`maxDistance=0.45` 不是通用正确阈值，更不能用于恢复完整事件集。SDK distance 越低越相似，MCP score 则可能用 `1-distance`，方向相反。[SDK recall 排序和过滤说明](https://docs.wal.app/walrus-memory/sdk/api-reference)

### 6.3 `restore` 是索引修复，不是应用状态恢复

`memwal.restore(namespace, limit)` 尝试从 Walrus 支持的数据重建 relayer 索引。它有 owner 级候选上限、无分页 cursor，`truncated=false` 也不证明发现了全部 owner blob。固定审计源码把 restore limit 限定为 1–100，候选来源范围为 `min(limit×5,100)` 个 owner 持有的 Walrus Blob 对象，在 namespace/package 过滤之前计数；顺序不保证最新。只重复相同 limit 不能构成无限完整遍历。我们只在专用 demo owner 的已知历史不超过 40 条 Walrus 上传的受控规模内使用，并由外部 manifest 检查最终完整性。40 是本项目的保守上限，不是协议保证。[Relayer restore 语义](https://docs.wal.app/walrus-memory/relayer/api-reference) · [固定 sidecar 来源查询实现](https://github.com/MystenLabs/walrus-memory/blob/4eb1fc09abe3f7a5de6407ecdafea0feb19a5cfb/services/server/scripts/sidecar/routes/walrus-query.ts)

`listMemories` 枚举的是中继器 metadata，不是链上所有 blob 的完整证明。专用 owner 应从空白受控历史开始；运营者维护跨 namespace 的上传/任务清单，40 条预算也计入已上传但索引失败的孤儿 blob、测试和旧 namespace。发现未知历史、无法核对的写入或超过预算时，停止宣称该账户满足受控恢复前提；不能靠清空本地表或新建 namespace 隐藏历史。

## 7. P0 冷恢复算法与证据

### 7.1 生成冻结 manifest

教学写入目标仍为 12 条；只有原始 outbox/job 全部对账、写入静止、namespace 完整集合核对通过时，才允许冻结连续 `1..N`（`10 ≤ N ≤ 12`）的前缀。小于 10 不满足参赛最低要求；不能用新 namespace 隐藏未知尾部。Manifest 只含 `manifestVersion/scopeId/namespace/ownerAddress/entries/expectedStateHash`，每个 entry 含 `eventId/sequence/eventHash/blobId/textSha256/memoryId/jobId`。版本绑定 purpose、scope 和 N。**不含事件正文、规则值、私钥或投影答案。** 预期 state hash 只作对照，不用于生成状态。

原始 `memoryId/jobId` 保留作写入回执来源；固定源码的 restore 会为重建索引行生成新的 UUID，因此 memory ID 不是跨索引重建的不变业务身份。恢复的可携带不变量是 `eventId + blobId + textSha256`，另记录本次观察到的索引行 ID 供审计。该重建路径还将 `end_epoch` 置空；不能用新 metadata 的 null 虚构到期时间，也不能用索引时间代替事件 sequence。[固定 restore 实现](https://github.com/MystenLabs/walrus-memory/blob/4eb1fc09abe3f7a5de6407ecdafea0feb19a5cfb/services/server/src/routes/admin.rs)

必须从原始持久事件、outbox 和真实 done/readback 回执形成 manifest，不能人工填写 blob ID。校验事件链、连续序号、正文 hash 以及唯一 event/blob/memory/job ID。待处理、运行中、uploaded、unknown 或无法排除远端写入的 failed 尾部均阻塞冻结。只有原 job 的终态与完整 inventory 能确证未写入，才能省略 failed 尾部；已有 blob 必须对账同一事件/回执或停止。教学事件包含明确的纠正/撤销关系，不用重复偏好凑数。独立的 `real-loop` purpose 恰好四条，不可导出教学 ≥10 计数。

已批准、具备专用服务端配置后，按以下契约运行；本次 WP3 只验证本地合成 provider 和 job-local PG，未执行远端命令：

```sh
pnpm run verify-count -- --reconcile --out evidence/write-reconciliation.json --apply
pnpm run memory:freeze -- --purpose teaching --reconciliation evidence/write-reconciliation.json --out evidence/frozen-manifest.json
pnpm run verify-count -- --manifest evidence/frozen-manifest.json --out evidence/mainnet-manifest.json --events-out evidence/events-public.json --apply
pnpm run verify:restore -- evidence/frozen-manifest.json --out evidence/restore-report.json --apply
```

reconciliation 绑定原始 operations/jobs 和 snapshot；freeze 重新检查，过期或改变的 inventory/operations 要重新对账。`frozen-manifest.json` 是不可变 locator/恢复输入；`mainnet-manifest.json` 是带 `verifiedCount/verifiedAt/mode:recorded_live/verification` 的公开核验输出；`events-public.json` 只含 locators，**没有正文**。count/restore 不带 `--apply` 时只验证，不写证据；`--apply` 只授权本地证据输出，不授权链写入。失败不得覆盖已有证据。real-loop 使用 `real-write-reconciliation.json`、`real-frozen-manifest.json`、`real-restore-report.json`，与教学文件分离。

### 7.2 从空进程恢复

1. 冻结运营者写入。结合受控 owner 历史上传清单、原始 outbox/job 和完整 snapshot-consistent metadata 确认 owner 预算不超过 40；目标 namespace blob 集合恰好等于 manifest 的 N 条，不遗漏未知尾部。单独的 metadata 行数不足以证明没有丢失索引的历史 blob。
2. 启动新的 Node 进程，使用空内存 projection；不提供 Postgres 事件表或本地 fixture 正文。只注入合法委托凭证、账户定位和 manifest。
3. 调用真实 `listMemories` 收齐目标 namespace metadata，校验 blob ID 集合和状态，并记录当前 memory ID。若 blob 集合不同，保持 `RESTORE_INCOMPLETE`，继续做有限修复而非先宣称成功。
4. 正文获取：调用 `recall({query:'RecallLedger event v1',limit:100,namespace})`，不设 `maxDistance`、token 截断或只取 top 5。这里的 recall 只是远端正文获取通道，不把相似度当事实权重。
5. 对每个返回结果按 `blob_id` 对照 manifest；严格解析正文、检查完整文本 hash、事件 ID、schema 和前驱关系。多次查询重复返回同一个 blob 且相同正文时只保留一份；同一 blob 返回不一致正文直接失败。为缺失 event ID 最多执行受限的补充查询；仍缺失则失败。
6. 默认验证是只读；确有索引缺失时返回不完整。只有运营者显式启用 `--repair-index` 并具有相应授权时，运行一次 `restore(namespace,50)`，检查 `failed/truncated`，再重新枚举和取正文。至多再执行一次有限修复。该步骤修改relayer索引，必须记录；不创建第13条应用记忆。专用账户超过限制时停止演示恢复，不能静默忽略多余记录。
7. 只有收到**精确匹配的 event ID + blob ID + hash 集合**，且没有额外 blob、重复业务序号、冲突内容、缺失、循环引用、逻辑顺序断裂，才运行确定性 reducer。传输层的相同结果去重不等于允许多写一份主网事件。
8. 根据逻辑 sequence/前驱链重放，而不是 relayer `created_at`，比对恢复前后状态 hash 与决策结果。
9. 输出恢复报告：account/namespace、expected/observed 数量、missing/unexpected IDs、hash mismatch 数量、state hash、读取耗时、所用版本、结果 PASS/FAIL。失败 exit 非零。

若 `listMemories` 成功但 recall 因下载或解密失败缺正文，即使行数等于 12 也不能通过；若所有正文从本地 fixture 读取，更不能通过。公开演示应保留一次真实新进程恢复的运行证据和录像，网络故障时可以展示已录制证据，但须明确实时恢复未成功。

### 7.3 已知 blob ID 的直接读取

本次检查的默认 SDK 公开接口没有 `getMemory(blobId)` 或 `readBlobAndDecrypt(blobId)`。不要编造调用，也不要调用 SDK private 方法。官方 manual 实现通过 Walrus aggregator 获取密文，再用 Seal 及相应账户策略解密；该路径包含 session、package/registry、策略 PTB 和身份检查，超出 P0。

P0 的可靠性来自“取回全部正文并严格对 manifest”，而不是假设一次语义查询必然完整。若远端接口无法取回完整集合，功能必须报不完整；后续再考虑基于官方 Seal 接口开发独立 direct-blob adapter，不能用明文 manifest 冒充去中心化恢复。[官方 manual 源码](https://github.com/MystenLabs/walrus-memory/blob/4eb1fc09abe3f7a5de6407ecdafea0feb19a5cfb/packages/sdk/src/manual.ts)

## 8. 到期、删除及证据等级

Walrus blob 有存储 epoch 和到期条件。不可变内容不是永久可用的同义词。主网上 epoch 大约两周，实际采用 metadata/链上到期值，不能按“写过就永不丢失”设计。[Tracking Agent-Owned Blobs and Storage](https://docs.wal.app/walrus-memory/fundamentals/architecture/tracking-agent-storage)

在提交前和评审期开始前检查 12 条记录的到期信息；若 `endEpoch`/`expiresAt` 为 null，则显示 `到期信息未取得`，补查而不是编造日期。若只能拿到 epoch，展示 epoch，不自行转换一个没有来源的绝对日期。需要延长存储时由负责 lifecycle 的服务/账户按真实支持方式操作，不能假设默认 SDK 有 `renew` 方法。

`forget` 在 relayer API 中指删除 namespace 的向量索引，不会删除 Walrus 密文；“从 UI 隐藏”“索引移除”“撤销访问”“存储过期”必须分开。原方案“没有删除因此永久保留”的描述应删除。P0 不提供永久擦除承诺，也不在公开 demo 暴露 `forget`。[Relayer API](https://docs.wal.app/walrus-memory/relayer/api-reference)

| 证据级别 | 可以说什么 | 不能推断什么 |
|---|---|---|
| `accepted` | relayer 接受了写入任务 | 记忆已成功存储 |
| `done` + receipt | relayer 报告上传、索引完成 | 任意语义查询一定召回；全部链上证明已独立验证 |
| 远端正文 + hash | 本次取回的正文与冻结事件一致 | relayer 不可作恶；原始商业说明一定真实 |
| Blob object/链上读取 | 核查到了指定对象/存储相关链上事实 | 用户分类说明正确；只是读取 checkpoint 就构成时间锚定 |
| 新进程 exact-set + state hash | 冻结 demo 的规则和投影成功跨进程恢复 | 任意规模灾备；没有中继器依赖 |

## 9. 必须通过的验收

- 同一 operation 重试、进程重启、跨 30 分钟边界均不产生新的逻辑事件；不同 payload 复用 key 明确失败。
- `accepted`、`uploaded`、timeout 均不能计入成功记忆数。
- 完整 receipt 的 blob ID 不丢弃；回执 owner/namespace 不匹配就拒绝入账。
- metadata 分页出现空页但 `has_more=true` 时继续；游标不前进报错。
- 教学 N=10/11/12 连续 exact-set 恢复成功；N<10、断序/断链、重复回执、篡改正文、多余 blob、未知或未完成尾部均失败；四条 real-loop 不能混作教学达标数。
- 恢复脚本不读取 fixture 正文或旧 Postgres 投影；新进程网络轨迹显示真实 relayer 读取。
- 公开访客模拟纠正不会新增主网记忆；运营者写入开关关闭时不能通过 API 绕过。
- 前端 bundle、日志、导出报告均不含委托私钥；其他 namespace 不能靠公用 demo API 任意读取。
- 低权限/已撤销委托、paused relayer、429、轮询 timeout 和过期/缺失正文显示诚实状态。
- 最终 README 不宣称完全无信任或永久存储；公开演示与合成业务数据有明确标识。


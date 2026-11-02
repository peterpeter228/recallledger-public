# 06 · Tatum Sui 交易证据接入

> 核验及文中来源访问日期：2026-10-26（北京时间）。本项目为只读链上交易的自由职业者支出纠正助手，不执行转账、不托管用户资产、不实现支付协议。Tatum 在业务中的作用是取得可核验的交易事实；Walrus 保存后续确认与规则记忆。

## 1. 技术选型结论：Node 服务端原生 gRPC

新实现使用 `SuiGrpcClient` + Tatum 主网 gRPC 网关，封装在 Fastify 后端适配器。API Key 只在服务端 transport metadata 中传递。React 前端只访问本项目 API。

原方案中的“2026 年 4 月公共全节点已关闭 JSON-RPC”日期不准确。Sui 官方记载 Foundation 主网节点在 2026-07-27 当周关闭 JSON-RPC，并把完整移除列入 2026 年 10 月中旬计划。更直接的本次实时证据是：`https://sui-mainnet.gateway.tatum.io/llms.txt` 已只列 GraphQL `/graphql`；独立 gRPC discovery 列出 `LedgerService/GetTransaction`、`GetObject`、`ListTransactions` 等。Tatum 营销页面仍提到 JSON-RPC，存在内容滞后；不能按营销示例把新项目绑在旧接口上。[Sui 官方迁移说明](https://docs.sui.io/develop/accessing-data/json-rpc-migration) · [Tatum 当前 gateway discovery](https://sui-mainnet.gateway.tatum.io/llms.txt) · [gRPC discovery](https://sui-mainnet-grpc.gateway.tatum.io/llms.txt)

本次读取了公开 discovery 和官方 SDK/源码，**没有 Tatum 用户 API Key，未执行认证后的 RPC smoke test**。因此 gRPC 的真实 key、额度、方法兼容性和部署网络可达性是 G0 要验证的事项。public discovery 可用不等于账户已经接通。

## 2. 让赞助商集成真正影响产品

P0 输入一个真实 Sui 主网交易 digest，或运营者明确批准的已知 digest 清单。通过 Tatum 取得交易结果、余额变化、资产类型、gas 和 checkpoint。UI 先呈现事实，再请用户补充用途；用户确认后的纠正经 Walrus 持久化，下一次相同作用域交易出现时应用相同规则并展示依据。

不能从“钱包有出金”直接得出“消费”，也不能用交易成功代替业务语义正确。对方地址没有可验证标签时显示地址/未知对手方，不猜商户；同一笔交易可能是内部转账、兑换、质押、借贷、gas 或复杂 PTB。

### 必须保留的事实与解释分离

| 数据 | 来源 | 产品处理 |
|---|---|---|
| digest、执行成功/失败、checkpoint | Tatum 返回的链数据 | 保留原事实；读取失败不得填默认成功 |
| 各 address、coinType 的余额变化 | Tatum 交易结果 | 按原子单位字符串保存；展示来源 |
| 资产 decimals/symbol | 对应 coin type metadata | 缺失时显示原子单位和 coin type，不能猜为 USDC |
| 支出/收入/内部转账/业务类别 | 用户确认或其已确认规则 | 与链证据分开保存，可纠正或撤销 |
| “推荐归类” | LLM/确定性启发式 | 仅为建议；未知默认 `needs_context` |

链上数据只能支持它实际记录的事实。即使 Tatum 返回了真实交易，也不证明“这笔钱是某个 SaaS 订阅”。冻结演示数据如把一笔真实公开交易配上虚构业务故事，必须标注 **真实链证据 + 合成业务情境**，不得称真实用户账单。

## 3. 服务端配置与依赖

```dotenv
TATUM_API_KEY=<server-secret>
TATUM_SUI_GRPC_URL=https://sui-mainnet-grpc.gateway.tatum.io
TATUM_READ_TIMEOUT_MS=10000
TATUM_READ_CONCURRENCY=2
TATUM_MAX_RETRIES=3
```

依赖为 `@mysten/sui`、`@protobuf-ts/grpc-transport`、`@grpc/grpc-js`。选择与 MemWal peer requirements 相容的已发布版本并锁定；不要把 Mysten monorepo 的全部依赖或 overrides 照搬到应用。Node 原生 gRPC 适配器仅在服务端使用，不能 bundle 到浏览器。官方 SDK 默认使用 gRPC-web fetch；Tatum discovery 确认的是 gRPC，因此本方案选择 Node 原生 HTTP/2 transport，避免默认假设网关也支持所有 gRPC-web 模式。[SuiGrpcClient transport 文档](https://sdk.mystenlabs.com/sui/clients/grpc)

本次实时核对 npm `@mysten/sui@2.37.0` 及其已发布 `.d.mts`，包含下述 `SuiGrpcClient`、`getTransaction`、`Transaction/FailedTransaction` 和 `BalanceChange` 字段。该版本要求 **Node >=22**，故不能只按 MemWal 自身的 Node >=20 要求配置部署。建议以 Sui `2.37.0`、Seal `1.5.1` 为 G0 精确锁定起点；Seal 对 Sui 的 peer 为 `^2.37.0`。transport/grpc-js 也须锁定实际安装版本。发布存在、类型相容和认证实测属于三类证据，分别记录。[Sui 2.37.0 元数据](https://registry.npmjs.org/@mysten%2fsui/2.37.0) · [Sui gRPC 发布类型](https://unpkg.com/@mysten/sui@2.37.0/dist/grpc/client.d.mts) · [Sui client 发布类型](https://unpkg.com/@mysten/sui@2.37.0/dist/client/types.d.mts) · [Seal 1.5.1 元数据](https://registry.npmjs.org/@mysten%2fseal/1.5.1)

### 客户端构造参考

```ts
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { ChannelCredentials } from '@grpc/grpc-js';

const endpoint = new URL(requireEnv('TATUM_SUI_GRPC_URL'));
if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) {
  throw new Error('INVALID_TATUM_ENDPOINT');
}
// Configuration is server-owned; never accept this endpoint from a request.
const transport = new GrpcTransport({
  host: `${endpoint.hostname}:${endpoint.port || '443'}`,
  channelCredentials: ChannelCredentials.createSsl(),
  meta: { 'x-api-key': requireEnv('TATUM_API_KEY') },
  timeout: 10_000,
});

export const tatumSui = new SuiGrpcClient({
  network: 'mainnet',
  transport,
});
```

该配置根据 Mysten 和 protobuf-ts 的正式 transport 契约编写；仍需在锁定依赖上 typecheck，并用实际 Tatum key 验证。禁止把一个 `http://` 明文网关或来自请求参数的任意 host 传给此客户端。Tatum 官方推荐 `x-api-key` 鉴权；RPC metadata 可承载该请求头。[Tatum Sui 鉴权说明](https://tatum.io/chain/sui) · [protobuf-ts RpcOptions](https://github.com/timostamm/protobuf-ts/blob/main/MANUAL.md)

## 4. 稳定应用契约

适配器返回内部固定格式，业务层不依赖旧 JSON-RPC 或 protobuf 字段命名。

```ts
export interface ChainTransactionEvidence {
  network: 'mainnet';
  transactionDigest: string;
  status: 'success' | 'failed';
  checkpoint: string | null;
  timestampMs: number | null;
  sender: string | null;
  balanceChanges: Array<{
    address: string;
    coinType: string;
    amountAtomic: string;
  }>;
  gas: {
    computationCost: string;
    storageCost: string;
    storageRebate: string;
    nonRefundableStorageFee: string;
  } | null;
  fetchedAt: string;
  provider: 'tatum';
  transport: 'grpc';
}
```

`fetchedAt` 由应用记录取证时间，`timestampMs` 来自交易所属 checkpoint，两者不同。`checkpoint=null` 不能替换为最近一次查询到的高度。所有金额均为字符串，内部用 BigInt 运算；仅 UI 格式化时按 verified decimals 输出十进制文本。

可另存原始响应的脱敏归档/摘要 hash、SDK 精确版本和查询方法用于复核，不能保存 API Key。对展示和日志采用白名单字段，避免错误对象包含 transport headers。

## 5. getTransaction：核验执行结果和资金变化

官方新 SDK 用 `getTransaction`，返回 `Transaction`/`FailedTransaction` 判别联合。失败交易并不一定抛异常。必须显式请求 `include.balanceChanges`、`include.effects`、`include.transaction`、`include.objectTypes`，否则相应字段是 undefined。WP2 以已安装的 **`@mysten/sui@2.37.0` 发布物**为契约权威，声明路径、lockfile integrity 与实施前类型探针见 [G0 结构证明契约](../evidence/g0/tatum-proof-contract.md)，不以 GitHub main 分支推断固定版本。[Querying Data](https://sdk.mystenlabs.com/sui/clients/querying) · [共享 include options](https://sdk.mystenlabs.com/sui/clients/executing)

```ts
const response = await tatumSui.getTransaction({
  digest,
  include: {
    effects: true,
    transaction: true,
    balanceChanges: true,
    objectTypes: true,
  },
  signal: AbortSignal.timeout(10_000),
});

const tx = response.$kind === 'Transaction'
  ? response.Transaction
  : response.FailedTransaction;

if (tx.digest !== digest || tx.effects.transactionDigest !== digest) throw new Error('DIGEST_MISMATCH');
if (tx.status.success !== (response.$kind === 'Transaction') || tx.effects.status.success !== tx.status.success) throw new Error('STATUS_MISMATCH');

const normalized = {
  transactionDigest: tx.digest,
  status: tx.status.success ? 'success' : 'failed',
  checkpoint: tx.checkpoint,
  timestampMs: tx.timestampMs,
  balanceChanges: tx.balanceChanges.map((entry) => ({
    address: entry.address,
    coinType: entry.coinType,
    amountAtomic: entry.amount,
  })),
};
```

该固定发布物中的 `SuiClientTypes.BalanceChange` 字段是 `{coinType,address,amount}`；不能照搬旧 JSON-RPC 的 `owner.AddressOwner`。`Transaction` 携带 `checkpoint:string|null` 和 `timestampMs:number|null`。`transaction` 直接是 `SerializedTransactionDataV2`（`version:2`、`sender`、`gasData`、`inputs`、`commands`），**不是** `ProgrammableTransaction` wrapper；`objectTypes:Record<string,string>` 是独立 include，来自 changed-object 的 ID/type，不来自余额。[已编译的固定发布物契约与声明路径](../evidence/g0/tatum-proof-contract.md)

### 5.1 资金语义处理规则

- 对选定观察地址、每种 coinType 单独聚合余额变化，不把所有币种直接相加。
- 证据中的 `amountAtomic < 0` 是该资产净流出，`>0` 是净流入，不等于最终消费/收入分类。映射到TransactionObservation时保存非负绝对金额，direction另列out/in；规则min/max比较的是这个绝对值。
- `gasUsed` 各项原值独立显示。不要把 `nonRefundableStorageFee` 再叠加进已经包含其影响的费用合计；净 gas 按 `computationCost + storageCost - storageRebate` 计算，并允许净值因返还而为负。[Sui Gas Fees](https://docs.sui.io/develop/transaction-payment/gas-in-sui)
- SUI 余额变化可能已经包含 gas。不能“余额流出 + gas”重复计费。若无法从交易结构可靠区分转账本金和费用，标为complex/needs_context，不让该净变化自动命中消费金额规则；P0教学主用已核定精度的非SUI资产。
- 失败交易仍可能消耗 gas。展示失败及费用，不能简单丢弃，也不能当成功业务支出。
- 兑换通常有一负一正资产变化；只凭单个负值不能归类为普通购买。
- Coin symbol 可重名，识别资产必须使用规范化完整 coinType；metadata 名称不能作为身份凭证。
- 钱包不是本次交易的 sender 仍可能受到影响；digest 核验和展示只要求实际余额影响，但只有观察钱包本人发起且满足下面结构证明的转出才可标 `simple`，否则保留 `complex`。

### 5.2 结构性 simple-transfer 证明（WP2）

服务端 `getTransaction(digest)` 在同一个 SDK result 上先执行既有 digest/status/evidence 校验，再返回内部 envelope `{evidence,transaction,objectTypes}`。`proveSimpleTransfer(envelope,wallet,coinType)` 返回 `{ok:true,digest,wallet,coinType,recipient}` 或 `{ok:false,reason}`。`main.ts` 把真实证明交给 `observationFromEvidence`；没有可将实时观察直接标 simple 的布尔开关。raw SDK transaction/type map 不进入公共接口、领域 schema、持久事件或 read-only 报告。

证明只接受以下共同成立的事实：

1. 执行成功，normalized evidence 的 sender 与 serialized transaction sender 都等于规范化观察钱包；所选资产是完整精确的非 SUI coinType。
2. 自有 command list **恰好一个** `TransferObjects`，含至少一个不重复对象，每个对象参数都是安全整数且在界内的 `Input` 索引；不接受 `GasCoin`、`Result` 或 `NestedResult`。
3. 每个引用都解析到完整 `Object.ImmOrOwnedObject {objectId,version,digest}`，对象 ID 通过同一 result 的 `objectTypes` 映射绑定到精确的 `0x2::coin::Coin<配置 coinType>`。共享、receiving、未解析对象或缺少类型绑定一律拒绝。成功的单命令 owned-coin 转移提供所有权语义，余额差额不提供对象类型/所有权/命令证明。
4. 唯一 recipient 参数也是 `Input`，解析到 `Pure.bytes`：按发布物支持的 `fromBase64` → `bcs.Address.parse` 解码，要求规范 base64、恰好 32 字节，且 recipient 不等于 sender；不猜字符串地址、不忽略尾随字节。

序列化声明的 enum 是 `EnumInputShape`，没有声明嵌套 `$kind`；实际 gRPC 转换会附加匹配的 `$kind`。证明同时接受带/不带该 metadata 的正确形状，但拒绝冲突 tag 或多个 enum 分支。MoveCall/额外命令、多个收款人、SUI、失败、错误 sender/type、缺失 type map/binding、未解析对象/recipient、异常索引和畸形 bytes 都返回稳定 reason，保持 `complex`，不能通过用户标签把歧义事实变成可计费支出。

结构证明之外，`observationFromEvidence` 仍核对成功状态、钱包负向净额、单个非 SUI 资产、唯一对方等额正向变化，以及 proof 的 digest/wallet/coinType/recipient 与 normalized evidence 的一致性；未知精度继续保存 `decimals:null`，时间缺失仍拒绝生成观察。已证明 simple 但无上下文/已确认规则时仍是 `needs_context`；只有用户明确标签或明确确认且精确匹配的规则才可给出 `expense/tools`。确定性 SDK-shaped 正反例和该完整流在 `tests/adapters/tatum-shape.test.ts`；它们是 synthetic fixtures，不是主网实测。

**Falsification note:** a proven-simple shape is a *structural* claim about the transaction's own command list; it still does not prove business purpose.

经另行授权运行 `verify:live` 时，`--digest=...` 报告只写 `envelope.evidence`；可附加 `--wallet=... --coin-type=...`（coinType 也可来自 `OBSERVATION_COIN_TYPE`）报告小型判别 proof，不输出 raw transaction 或 objectTypes。只读 probe 成功不代表远端存储/主网写入验收通过；本次 WP2 离线实施未调用 provider。

## 6. 初期读取范围：digest 导入优先

P0 直接导入已知主网 digest，保证一条条核查得清楚，不实现无限钱包历史同步。针对同一 digest 请求去重、短期缓存已有成功证据；每个 digest 可保留最后实时刷新时间。提交演示至少有一条真实 Tatum 主网读取结果，其失败时产品应明确失去链证据，而不是仍显示 `verified`。

如后续需要钱包历史，官方 `listTransactions({filter:{sender},...})` 只保证 sender 条件；它不是“全部收入和支出”的等价接口。新 SDK history pagination 使用 `before/after`、`startCursor/endCursor`、`hasNextPage`，不能直接使用旧 `suix_queryTransactionBlocks` cursor。高级 affected-address 条件可用原生 gRPC list filter，但会扩大范围，P0 不做。[History filters and pagination](https://sdk.mystenlabs.com/sui/clients/querying) · [原生 gRPC 条件与游标](https://sdk.mystenlabs.com/sui/clients/grpc)

## 7. 账户对象检查与真正的存储证据

可通过 Tatum `getObject({objectId,include:{content:true}})` 核查 MemWalAccount 对象，并按官方 Move 类型结构读取 owner、active、delegates 等所需字段。仅有对象存在不证明：账户 active、本委托仍被授权、owner 是当前使用者、记忆已存储或条目内容真实。P0 的鉴权仍以官方 relayer 拒绝/接受和明确的账户检查为准，不能绕过。

新 SDK `include.content` 返回 Move struct BCS；`include.json` 的形状可能因 transport 而变化。若业务依赖字段，应使用由真实 package 定义生成的 BCS 类型或严格校验过的 JSON adapter。不要凭猜测字段名写 `object.active === true`。[Object include contract](https://sdk.mystenlabs.com/sui/clients/querying)

读取“当前最新 checkpoint”只能证明当时读到的链高度；把该数字放进事件正文**不会把该事件的内容 hash 锚定到链上**。本项目不另部署锚定合约。UI 将其命名为 `读取时链高度`，不要叫不可篡改时间戳或结算证明。

对于 Walrus 存储，blob ID 是内容寻址标识，Sui blob object ID 是链上对象标识。只有拿到真实 object ID 并查到对应字段/存储状态后，才增加独立链核验标签；否则显示已有 `job done + 远端正文 hash` 证据，保持级别准确。

## 8. 错误、限流和可用性

下表的 `provider_*` 是 adapter 内部错误标签。HTTP API 统一使用04的错误结构：配置、鉴权、限流和暂时不可用映射为 `CHAIN_UNAVAILABLE`，在脱敏 `details.providerCode` 保留标签；`transaction_not_found` 映射为 `TRANSACTION_NOT_FOUND`。链上执行失败属于已取得的 `status:'failed'` 事实，与查询故障分开。

| 情况 | 后端状态 | UI 行为 |
|---|---|---|
| 无 API Key | `provider_not_configured` | 允许查看合成样例；明确实时链读取未配置 |
| key 被拒绝 | `provider_auth_failed` | 给运营者配置提示；不给访客泄露凭证细节 |
| 限流/RESOURCE_EXHAUSTED | `provider_rate_limited` | 展示暂缓、下次可重试时间 |
| deadline/暂时不可达 | `provider_unavailable` | 保留先前证据时间；禁止标成最新实时数据 |
| digest 不存在/尚未可读 | `transaction_not_found` | 明确尚未核验，不等同交易失败 |
| 执行返回失败 | `status=failed` | 展示链上失败与gas；不能作为成功业务支付 |
| 字段/币种不明 | `needs_context` 或结构错误 | 不猜金额精度、不自动归类 |

应用配置并发和有限重试；不把原方案“免费层固定 3 RPS”当永久合同。实际 key 的套餐和额度以 Dashboard/服务返回为准。gRPC 错误可能通过状态码而不是 HTTP status 表示，因此要处理 `RpcError`/`GrpcStatusCode`，不能只写 `response.status===429`。[gRPC 错误类型](https://sdk.mystenlabs.com/sui/clients/grpc)

只对幂等读取进行 bounded retry，使用 jitter 并遵从服务端提示。未知方法或版本不匹配不应触发无限重试。总请求 timeout 包括响应读取；测试时模拟慢响应和缺失字段。

## 9. G0 必须留下的实测记录

1. `pnpm` 锁文件中实际 MemWal/Sui/transport 版本，Node 版本，构建和 typecheck 结果。
2. Tatum public discovery 快照日期与实际选择的 endpoint；不记录 key。
3. 用运营者提供的真实 Tatum key 读取一笔批准的主网 digest，核对返回 digest、network 配置、执行状态、checkpoint、balanceChanges、gas。
4. 对一笔已知失败或不存在的 digest 验证错误分支；没有适合失败交易时用确定性 fixture 测映射并标注 fixture，不伪造主网失败实测。
5. 保存真实返回 shape 的脱敏样本，测试 adapter 对新 SDK 联合类型和金额精度的转换。
6. API Key 不在 browser network、bundle、错误日志及证据导出中。
7. 说明 MemWal 内部 Seal RPC 与独立 Tatum 业务读取路径，准确披露集成范围。

若没有 key，只能标 `DOCS_VERIFIED / LIVE_BLOCKED_BY_CREDENTIALS`。前端、规则引擎、fixtures、outbox 和离线测试可以继续，不应将整个开发任务停住。

## 10. 验收测试与演示要求

- 同一完整 coinType 按地址聚合正确；大额整数超过 Number 安全范围时仍精确。
- 不同 coinType 同名 symbol 不合并；未知 decimals 不按 6 或 9 硬编码。
- 内部转账、兑换、失败交易、仅gas变化不会被无条件记成普通消费。
- 真实数据 `success` 与 `failed` 走不同分支；未知 digest 与失败交易明确区分。
- 无已确认规则时始终需要用户上下文；LLM 建议本身不能触发自动规则。
- 同一交易事实经不同版本分类规则重新解释时，链证据不被改写；UI可回看原因。
- 供应商下线时旧证据显示更新时间，实时核验按钮显示失败；不会静默切到公共免费节点然后仍标 Tatum verified。
- 输入任意 URL、API host 或 API Key 不得进入公开接口；公开接口只接收受限 digest/已有demo ID。
- 演示清楚呈现“真实链事实 → 用户纠正 → Walrus 持久化 → 新会话恢复 → 同范围下一笔建议改变”。

## 11. 原方案支付模块的处理

本项目 P0/P1 不实现支付，原附件支付代码不得复用。它自造 `x402-sui-direct` scheme，使用客户端传来的时间戳、扫描 sender 最近 20 笔任意正收款、未按提交 digest 检查确切资产金额，并用进程内 Set 防重放，不能称标准 x402，也不能证明收费正确。

截至本次核验，x402 Foundation 有 Sui `exact` 规范，规定完整 transaction + signature 和 `sui:mainnet`，V2 使用 `PAYMENT-SIGNATURE`。但官方 TypeScript `@x402/sui` 实现 PR #2616 仍 open/未合并；规范存在与稳定 SDK 可用应分开。若比赛后扩展支付，必须另开协议兼容性验证任务，使用有来源、实测可用的实现，不能把“自定义 402 + 已上链 digest”冒充标准。[Sui exact 规范](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_sui.md) · [V2 迁移](https://docs.x402.org/guides/migration-v1-to-v2) · [实现 PR #2616](https://github.com/x402-foundation/x402/pull/2616)


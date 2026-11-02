# 14 · 来源、核查深度和待验证项

核验日期：**2026-10-26（北京时间）**。本项目方案依据用户上传原案、比赛一手资料、官方技术文档、发布包类型及部分公开服务发现结果重新设计。网页会更新；以下记录不替代执行当天G0。

## 1. 核查深度

| 已完成的核查 | 未完成、需dot执行的验证 |
|---|---|
| 原案全文、代码示例与3幅内嵌图表阅读 | 当前不存在已提供的RecallLedger源码，因此未编译产品 |
| 主办方活动入口、规则、嵌入页、公开表单说明交叉核查 | 未注册参赛、未取得主办方对歧义的书面答复 |
| dot官方说明与权限/暂停行为 | 未验证下一个dot会话的实际工具和账户可用性 |
| Walrus SDK文档、0.1.9发布元数据/类型、源码基线 | 未使用用户delegate进行认证后的真实主网读写 |
| Tatum gRPC官方说明和匿名方法发现 | 未使用用户Tatum key进行认证交易查询 |
| Walrus公开health/config | 不等于本项目账户已创建或可写 |
| x402 Sui官方规范与实现状态线索 | 未测试支付；支付不在P0 |
| Render/Node官方部署与运行时资料 | 未新建收费资源、部署服务或测试生产URL |
| 文档交叉检查、JSON解析、案例计数和完整稿打包校验 | 不等于应用测试、真实用户试用或获奖结果 |

## 2. 赛事一手来源

| ID | 来源 | 用于什么 |
|---|---|---|
| R01 | [Tatum官方活动入口](https://tatum.io/hackathon/total-recall) | 确认赛事身份、年份、奖池和嵌入活动页关联 |
| R02 | [Walrus Event Rules](https://thewalrussessions.wal.app/tatum-total-recall/index.html) | 截止、资格、10条主网记忆、博客/repo/demo、评分、奖项 |
| R03 | [当前官方活动页](https://recall-tatum-walrus.vercel.app/) | 支付奖公布、独立开发路径、特别奖与主赛道叠加、表单ID说明 |
| R04 | [当前活动页公开前端文件](https://recall-tatum-walrus.vercel.app/_next/static/immutable/chunks/1kd6hiyew5gf-.js) | 当时表单字段和Event Rules模态；hash URL可能随发布失效 |
| R05 | [Walrus General Terms](https://docs.wal.app/docs/legal/walrus_general_tos) | 年龄、受限地区与一般条款；不是针对用户个人的资格保证 |
| R06 | [Tatum Terms](https://tatum.io/terms-of-use) | 一般服务条件；最终提交当天重看具体限制 |

R03来自R01明确链接并读取实际正文；不因Vercel域名就把它当第三方传闻。R02仍列Mystery Bounty而R03/R04已显示Agent Payments，这个冲突保留在01。评分30/30/20/20是正式维度，不是本报告自行分配的获奖概率。

## 3. dot官方来源

| ID | 来源 | 支持范围 |
|---|---|---|
| O01 | [Meet dots](https://learn.chatgpt.com/docs/dots) | 持续任务、云电脑、插件权限、委派及产品间职责 |
| O02 | [Get started with your dot](https://learn.chatgpt.com/docs/dots/getting-started) | 工具连接和任务交接方式 |
| O03 | [Control your dot](https://learn.chatgpt.com/docs/dots/controls) | 暂停主任务、停止委派与取消日程分别管理 |
| O04 | [October 5–9更新](https://learn.chatgpt.com/docs/whats-new/dots-october-9-2026) | 继续已有Codex线程和跨任务上下文能力 |

这些来源支持能力边界，不支持原文所有模型底座、4000+插件、计费仿API或固定“一月免费”表述。产品特性、套餐和实际可用工具应以账户当前状态为准。不要把dot自己的记忆当产品Walrus记忆的替代品。

## 4. Walrus技术来源

| ID | 来源 | 影响实现的结论 |
|---|---|---|
| W01 | [生产实践](https://docs.wal.app/walrus-memory/sdk/production-readiness) | 显式持久幂等key、accepted/done、poll timeout和恢复边界 |
| W02 | [SDK API](https://docs.wal.app/walrus-memory/sdk/api-reference) | remember/listMemories/recall/restore方法、排序与字段 |
| W03 | [Relayer HTTP API](https://docs.wal.app/walrus-memory/relayer/api-reference) | 鉴权、索引修复、forget和接口限制 |
| W04 | [所有权与权限](https://docs.wal.app/walrus-memory/contract/ownership-and-permissions) | 委托账户级权限、namespace非隔离、Seal访问轮换 |
| W05 | [默认SDK模式](https://docs.wal.app/walrus-memory/sdk/usage/memwal) | relayer处理明文/embedding/encryption，不能声称中继器不可见 |
| W06 | [0.1.9 npm元数据](https://registry.npmjs.org/@mysten-incubation%2fmemwal/0.1.9) | 发布包存在、exports、engines、peer依赖和完整性hash |
| W07 | [0.1.9发布物类型](https://unpkg.com/@mysten-incubation/memwal@0.1.9/dist/memwal.d.ts) | 区分发布能力与dev分支文档；确认listMemories等 |
| W08 | [源码核查基线](https://github.com/MystenLabs/walrus-memory/tree/4eb1fc09abe3f7a5de6407ecdafea0feb19a5cfb) | 固定到本次检查的源码版本，避免漂移 |
| W09 | [公开relayer config](https://relayer.memory.walrus.xyz/config) | 本次返回mainnet、grpc和内部Sui endpoint |
| W10 | [公开relayer health](https://relayer.memory.walrus.xyz/health) | 当时服务状态；不证明凭证可用 |
| W11 | [Blob存储跟踪](https://docs.wal.app/walrus-memory/fundamentals/architecture/tracking-agent-storage) | 存储期限与可用性不是永久保证 |
| W12 | [源码中的restore](https://github.com/MystenLabs/walrus-memory/blob/4eb1fc09abe3f7a5de6407ecdafea0feb19a5cfb/services/server/src/routes/admin.rs) | 索引重建可能更换memoryId，稳定业务身份另设 |

本次W09返回`network=mainnet`、`suiTransport=grpc`、`suiGrpcUrl=https://mysten-rpc.mainnet.sui.io`。这是读取到的公开配置，不是本项目把SDK改成走Tatum的证明。默认MemWal与业务Tatum适配器的网络路径分别披露。

原案引用的[release notes页面](https://docs.wal.app/docs/release-notes/walrus-memory)本次只显示没有release条目；不能用这个空页面证明原案声称的历史版本变化。采用发布物和固定源码交叉核对。`MemWal 0.1.9`自身engines>=20不意味着整个依赖图可在Node20运行；Sui/Seal需另查。

## 5. Sui、Tatum与支付来源

| ID | 来源 | 影响实现的结论 |
|---|---|---|
| T01 | [Sui JSON-RPC迁移](https://docs.sui.io/develop/accessing-data/json-rpc-migration) | Foundation主网停用周为2026-07-27，不是原文4月；10月全面移除为计划节点 |
| T02 | [Tatum Sui gRPC](https://docs.tatum.io/reference/sui-grpc) | 实际gRPC endpoint、TLS及x-api-key metadata |
| T03 | [Tatum迁移说明](https://docs.tatum.io/docs/sui-migration-guide-from-json-rpc-to-grpc) | 迁移方式；某些方法名与新发现列表有出入，需实测 |
| T04 | [Tatum原网关llms.txt](https://sui-mainnet.gateway.tatum.io/llms.txt) | 本次公开发现只列GraphQL及`/graphql`，不能再默认其根路径支持旧JSON-RPC |
| T05 | [Tatum gRPC发现](https://sui-mainnet-grpc.gateway.tatum.io/llms.txt) | 现列LedgerService/GetTransaction/GetObject/GetCheckpoint等 |
| T06 | [SuiGrpcClient](https://sdk.mystenlabs.com/sui/clients/grpc) | 当前类型化客户端、native/gRPC-web transport及read masks |
| T07 | [查询API](https://sdk.mystenlabs.com/sui/clients/querying) | 事务结果分支、字段读取；以发布版本编译核对 |
| T08 | [Sui 2.37.0元数据](https://registry.npmjs.org/@mysten%2fsui/2.37.0) | 本次可核查依赖起点；Node要求>=22 |
| T09 | [Seal 1.5.1元数据](https://registry.npmjs.org/@mysten%2fseal/1.5.1) | peer兼容性；不等于组合已实测 |
| P01 | [x402 exact Sui规范](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_sui.md) | 完整签名交易payload与facilitator流程，不是自创digest头 |
| P02 | [x402 v2规范](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md) | 协议版本与标准握手；不要混用X-PAYMENT和v2头 |
| P03 | [Sui TS实现PR #2616](https://github.com/x402-foundation/x402/pull/2616) | 本次独立核查为open且未merge；非永远不支持，执行时应重看 |

本次通过匿名发现确认接口宣传与当前网关存在不一致。尚无Tatum认证请求证据，因此本包不宣布网关根路径“所有请求已经关闭”，也不保证某账户方法和额度。正确工程动作是选gRPC主路并在G0实测。

## 6. 基础工程来源

| ID | 来源 | 作用 |
|---|---|---|
| E01 | [Node发布状态](https://nodejs.org/en/about/previous-releases) | 选择受支持的LTS；G0锁具体补丁 |
| E02 | [Render Node部署](https://render.com/docs/deploy-node-express-app) | Git部署和构建/启动命令模式 |
| E03 | [Render Postgres](https://render.com/docs/postgresql-creating-connecting) | 同区域数据库连接和资源配置 |
| E04 | [RFC8785 / JCS](https://www.rfc-editor.org/rfc/rfc8785) | 规范化JSON的确定性hash字节；它不是业务真实性证明 |

React/Vite/Fastify/Postgres是本报告的工程选型，不是赛事要求。版本、API和部署套餐在实际执行时读取各自官方文档并记录；不因本报告选择它们就假定未来版本兼容。

## 7. 尚待闭合的项目

| 问题 | 当前状态 | 处理 |
|---|---|---|
| 官方引言feedback/form与三赛道不一致 | 未获澄清 | 依详细赛道推进，提交前保留问题；12有询问稿 |
| 合成教学内容加真实主网存储是否足够 | 未找到专门禁止条款，也无主办方专门保证 | 如实披露；真实用户确认与Tatum样本单列；可询问 |
| 三特别奖是否可同时叠加 | 不明确 | 不作为路线和收益前提 |
| AI Builder混合贡献门槛 | “primarily”无量化定义 | 默认不争该奖，不伪造种子血统 |
| 当前SDK组合可运行 | 发布物存在，未认证实测 | G0编译、只读及最小write检查 |
| cold restore12条是否完整可用 | 有界设计，未运行 | exact-set/hash验证，失败即明确不完整 |
| 存储期限覆盖评审 | 尚无项目blob | 写入后检查epoch/保留状态，不假定永久 |
| 真实用户收益/获奖概率 | 无样本/竞争数据 | 只给方向判断和测试目标，不编数字 |
| 账户地域/领奖个体资格 | 公开条款未普遍排除中国国籍，不构成个体保证 | 按真实资料、提交时规则处理；不重复询问已知年龄/个人身份 |

## 8. dot后续维护本表

遇到关键事实变化，把新URL、读取时间、支持片段的简短转述、实际版本和结论写入DECISIONS。不要仅追加“已核实”；要说明核实到文档、发布物、匿名接口、认证读取还是主网写入哪一层。外部页面与本包冲突时，修正实现与有关文档，并让独立审查者检查影响范围。

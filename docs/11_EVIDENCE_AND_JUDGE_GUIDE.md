# 11 · 证据包与评委快速验证

本文件解决“它真的记住了吗”和“它真的用了两家的技术吗”。证据仅在实际执行成功后生成；模板和离线合成 provider 不证明主网存储。本轮 WP3–WP5 只做离线准备，不生成真实 Mainnet 完成声明。

## 1. 四类声明不能混在一起

| 声明 | 足够的证据 | 不能证明的事 |
|---|---|---|
| Tatum查询成功 | 真实请求的网络/endpoint、交易digest、归一化结果、时间和脱敏日志 | 不证明该转账是工具费、报销或退款 |
| 事件存入Walrus主网 | 已完成job、blob ID、账户与namespace、metadata及可读性 | 不证明教学业务事件真实发生 |
| 记忆改变判断 | 固定输入/时间，memory off与指定memory version的决策差异和命中event | 不等于模型权重训练或长期用户效果 |
| 跨会话恢复 | 新进程空投影、远端获取、集合/hash核对、同state hash | 不等于绕过relayer或无限规模灾备 |

界面显示两条独立标签：`Scenario: synthetic / observed` 和 `Storage: local / Mainnet verified / pending`。这样既能使用可复现的教学场景，又不会把真存储包装成真用户行为。

## 2. 验证分成三个等级

### A · 无凭证本地验证

评委clone公开repo，执行`pnpm verify:offline`。检查冻结payload、manifest、引用、哈希链、reducer和state hash；运行同输入的无记忆/有记忆对照。它证明公开文件内部一致和逻辑可复算，**不独立证明这些文件来自Walrus**。

### B · 公开存储与查询证据

公开Evidence页展示账户、blob/对象、receipt、Tatum查询摘要、查询时间与可用的explorer链接；每个链接按真实ID生成后实际打开。加密blob的字节可用性不等于任何人能读到明文；区块浏览器显示账户也不等于证明应用的业务标签正确。

不要假定评委有Tatum key。公开演示可以展示经过脱敏的服务端live核验结果和带时间的录制证据，但要承认评委此时还在信任应用的服务端输出。

### C · 授权的完整读取验证

作者在新进程用自己的合法delegate，从远端恢复冻结manifest所有事件并输出逐条hash比较。日志/录像不暴露secret。可在评审时演示或由有权限的审查者复现；不能为了“无key验证”把账户级delegate放进GitHub。

本项目的公开核验与加密内容核验有边界；不要把一个Suiscan链接包装成对明文的零信任完整证明。

## 3. 实际证据目录

| 文件 | 内容 |
|---|---|
| `evidence/environment.json` | 实际日期、Node/pnpm/SDK、commit、运行环境；无secrets |
| `evidence/write-reconciliation.json` | 原始 outbox/job 与完整 snapshot inventory 对账结果；所有尾部须可解释 |
| `evidence/frozen-manifest.json` | teaching 连续 1..N（10≤N≤12）的不可变 locator，独立恢复输入，无正文 |
| `evidence/mainnet-manifest.json` | 经独立 exact-set/hash 核验的 frozen locator 加 verifiedCount、verifiedAt、recorded_live 与 verification |
| `evidence/events-public.json` | schemaVersion、manifestVersion、verifiedAt、entries locators；不含事件正文 |
| `evidence/tatum-live-check.json` | 至少一条真实交易查询及字段映射证据 |
| `evidence/restore-report.json` | 新进程远端恢复成功才写 status/source/manifestVersion/count/stateHash/checkedAt；失败不覆盖旧证据 |
| `evidence/ablation-results.json` | 固定输入、时间、version、off/on输出、命中规则 |
| `evidence/eval-results.json` | 全部案例期望/实际/通过/失败/跳过 |
| `evidence/browser-acceptance.md` | 实际点击、设备尺寸、结果、截图路径和控制台问题 |
| `evidence/review-resolution.md` | 独立审查问题、严重度、修复SHA及验证 |
| `evidence/submission-receipt.md` | 真实提交后才生成，记回执与公开链接 |
| `evidence/real-frozen-manifest.json` / `real-restore-report.json` | 独立批准的四条 real-loop 事件及恢复；不能计作教学 ≥10 export |

敏感原始响应保留在不公开的证据位置。公开教学事件的链上存储不包含真实姓名、邮箱、未经同意的个人流水。不能把同一个公共账户当所有用户的隐私账户。

## 4. Manifest生成规则

1. 从持久事件/outbox和实际done receipts生成，不从fixture计划直接生成“完成回执”。
2. frozen locator 顶层为 `manifestVersion/scopeId/namespace/ownerAddress/entries/expectedStateHash`；entry 为 `eventId/sequence/eventHash/textSha256/jobId/memoryId/blobId`。校验每条原始 done receipt 的 owner/namespace 和唯一身份；缺关键字段不计完成。正文 hash 包括固定前缀。
3. 12 条是教学计划，不是已完成数。只在原始 job/outbox 与完整远端集合对账后接受连续 N=10/11/12；未知、pending/running/uploaded 尾部和额外 blob 阻塞，不借语义 recall 缺失来省略尾部。N<10 不提交。
4. count export 为 frozen locator 加 `schemaVersion:'1',purpose:'teaching',mode:'recorded_live',verifiedCount:N,verifiedAt,verification:{exactSet:true,hashes:true}`；对应恢复报告的 manifestVersion/count/stateHash 必须一致。stateHash 由真实取回事件经 reducer 计算；SHA/运行时另记于发布证据，不写自指 commit。
5. manifestVersion 绑定 purpose/scope/N；同版本内容冲突拒绝。freeze 重新检查 reconciliation 的 snapshot/operations；变化后必须重新对账。局部 dry-run 或失败不能覆盖既有证据。
6. 独立恢复前不给执行进程本地payload，只给定位/预期hash清单；恢复成功后再比对公开payload或参考state，避免“从答案文件还原”。

命令和文件名不能互换：

```sh
pnpm run verify-count -- --reconcile --out evidence/write-reconciliation.json --apply
pnpm run memory:freeze -- --purpose teaching --reconciliation evidence/write-reconciliation.json --out evidence/frozen-manifest.json
pnpm run verify-count -- --manifest evidence/frozen-manifest.json --out evidence/mainnet-manifest.json --events-out evidence/events-public.json --apply
pnpm run verify:restore -- evidence/frozen-manifest.json --out evidence/restore-report.json --apply
```

最后两条不带 `--apply` 时只验证，不写 evidence；`--apply` 表示本地文件写入，不是远端写入许可。所有远端读取/凭证使用仍须单独授权。本轮仅用 test-only provider 注入和 job-local PostgreSQL 验证实际 CLI 子进程；合成回执不能复制进主网证据目录。

## 5. 评委两分钟路线

此段可放入公开README（用真实链接替换占位）：

> Open the demo and choose **Replay the correction**. The same outgoing transfer starts as **Needs context**. Apply the saved, user-confirmed rule and see which memory changed the decision. Move to the counterexample: a reimbursement corrects an overly broad rule, so a later transfer outside the revised range is no longer treated as an expense. Open **Evidence** to distinguish the synthetic scenario from verified Mainnet memory storage. Finally, watch **Fresh-session restore** rebuild the same policy from the remote memory service, with complete event and hash checks.

公开互动只能操作demo版本或本地session；若没有live授权，不显示“刚刚完成真实写入”。作者实际录制中可以展示真实saving→done过程，录像明确时间与环境。

## 6. 建议证明的最小业务结果

- 未知用途被准确保留为未知，不把所有outflow当支出。
- 用户明确教过的同范围后续转账减少一次重复询问。
- 反例修正后，过宽规则不再错误套用到范围之外。
- 入账不会命中出账规则；退款必须明确关联原交易。
- 撤销后未来判断停止应用规则；历史已确认标签保留。
- 清空会话和投影后，仍从远端恢复相同规则与解释来源。

这些结果用真实测试记录支持，不给出没有实验依据的“准确率提升90%”“节省10小时”或“获奖率80%”。

## 7. 提交前证据检查

必须人工实际打开repo/demo/blog/video，确认无登录墙和失效链接；检查视频中的账户与提交表单相同；核对MEMWAL_AGENT_ID是公钥；检查录屏中没有.env或API headers。证据引用应落到同一release commit，不能视频演示新版而公开仓库仍是旧版。

核验依据：[比赛规则](https://thewalrussessions.wal.app/tatum-total-recall/index.html)、[当前活动页](https://recall-tatum-walrus.vercel.app/)、[Walrus持久化与恢复限制](https://docs.wal.app/walrus-memory/sdk/production-readiness)。上述具体证据格式是本项目的工程设计。

# 参赛文案、技术博客与2分40秒演示

> 版本：1.0｜准备日期：2026-10-26（北京时间）  
> 当前状态：**开发前交接材料**。以下英文文案是待实施、填证据、核对后使用的草稿；没有已完成的demo、视频、博客发表或主网写入声明。`{{TODO_*}}`必须由真实结果替换。  
> 主赛道：Smart Agents for Real Life。重点特别奖：Best Walrus Memory。Dot独立开发；不申报AI Builder或支付奖。  
> 本文件准备材料，不授权本轮助手公开仓库、部署、发帖、联系主办方、报名、签名或付款。

## 1. 统一叙事与用词

一句话：**RecallLedger remembers a correction, not just a conversation.**

产品故事：Sui链上自由职业者不想每次解释同一种支出的用途，又不愿让助手把一次解释扩大成无限规则。RecallLedger核验链上能证明的事实，将未知用途保留为`needs_context`，让用户确认有金额、币种、方向、对手方和有效期的规则，再记住例外与撤销。

所有材料坚持四个区分：

| 必须区分 | 正确表述 | 禁止表述 |
|---|---|---|
| 链上事实与用途 | Tatum返回金额、币种、方向和执行状态；用途是用户提供的上下文 | “区块链证明这笔钱是工具费” |
| 教学样本与真实财务 | Synthetic transaction examples；另列真实链上只读验证样本 | 把演示转账写成真实用户账本或真实业务收入 |
| 内容与存储 | Synthetic content, live Walrus Mainnet persistence（仅成功后） | “这是主网，所以案例一定真实” |
| 可恢复与去中心化边界 | 从Walrus-backed relayer恢复冻结事件集和规则状态，依赖该服务可用 | “完全去中心化、无服务端信任、永久保存、任意规模无损恢复” |

规则学习是确认后的状态变化，不涉及模型权重训练。产品不执行支付，不创建金库，不自动升级权限；不要把未实现的支付扩展塞入视频以争取另一个奖项。

## 2. 发布前必须填齐的事实

| 占位项 | 来源 | 填写规则 |
|---|---|---|
| `{{TODO_LIVE_DEMO_URL}}` | 实际部署 | 用匿名窗口打开，不能仅验证登录后可用 |
| `{{TODO_PUBLIC_REPO_URL}}` | 公开仓库 | 不改造用户旧私库的可见性；按届时授权公开正确仓库 |
| `{{TODO_COMMIT_SHA}}` | 已验收提交 | 视频、demo、证据、博客尽量同一版本 |
| `{{TODO_VIDEO_URL}}` | 实际上传的视频 | 2—3分钟、无需特殊账号即可观看 |
| `{{TODO_BLOG_URL}}` | 实际公开博客 | 技术草稿文件不等于已经发表 |
| `{{TODO_MANIFEST_URL}}` | 发布后的`evidence/mainnet-manifest.json` | 只能含实际返回的标识与证据，禁止假hash/假blob ID |
| `{{TODO_MEMORY_COUNT}}` | 主网证据核验 | 记录实际成功的独立事件数，目标12，规则最低10 |
| `{{TODO_LAST_VERIFIED_AT}}` | 验证运行 | ISO时间加时区；不是手填“今天” |
| `{{TODO_RESTORE_RESULT}}` | 新进程恢复测试 | 成功/失败、事件数、stateHash对比；失败不能改写成成功 |
| `{{TODO_EVAL_RESULTS_URL}}` | 固定评测输出 | 有记忆、无记忆同样本结果及未解决项 |
| `{{TODO_REAL_CHAIN_SAMPLE_URL}}` | 实际只读Tatum核验 | 使用公开且适宜演示的样本；结果与synthetic案例分栏 |
| `{{TODO_LIMITATIONS}}` | 最终审查 | 服务依赖、数据规模、不可验证的部分如实列出 |

所有`TODO`未清空前保留草稿标记。工程状态判定与证据格式以[证据与评委指南](11_EVIDENCE_AND_JUDGE_GUIDE.md)、[评测与验收](08_EVALUATION_AND_ACCEPTANCE.md)为准。

## 3. 英文项目描述

### 3.1 短标题与副标题

**Title:** RecallLedger  
**Subtitle:** A Sui spending assistant that remembers corrections, exceptions, and when to ask again.

### 3.2 提交描述草稿

> 使用前：只有对应行为已实测通过，才能保留下面的现在时描述。未实现的句子必须删掉或改为planned；不得用未来路线补充当前完成度。

RecallLedger helps Sui-based freelancers stop repeating financial explanations without turning one correction into an unlimited rule. Tatum provides read-only transaction facts: token, amount, direction, and execution status. When the purpose is unknown, the assistant asks for context.

A user can confirm a narrowly scoped classification rule. Walrus Memory stores that rule together with corrections, exceptions, replacements, and revocations. A later reimbursement can narrow an overbroad “business tools” rule; an incoming refund does not inherit an outgoing-spending label.

The demo compares the same inputs with and without memory, then restores the confirmed state in a fresh client using remote memory. The learning examples are explicitly synthetic. Their storage status is reported separately, with {{TODO_MEMORY_COUNT}} verified Mainnet memory events and a published evidence manifest. A separate live-chain sample demonstrates Tatum integration.

Our focus is Smart Agents for Real Life and Best Walrus Memory. RecallLedger does not move funds. Its contribution is a visible, reversible learning loop: fewer repeated questions where a rule applies, and renewed questions where it does not.

Demo: {{TODO_LIVE_DEMO_URL}}  
Source: {{TODO_PUBLIC_REPO_URL}}  
Evidence: {{TODO_MANIFEST_URL}}  
Build: {{TODO_COMMIT_SHA}}

### 3.3 评委入口说明

**For judges:** Open the read-only demo, choose “Replay the correction,” compare “Without memory” and “With memory,” then inspect the evidence drawer. The replay itself creates no new Mainnet memories. The portability check uses an empty local projection and restores a frozen set of remote events; its result is available at {{TODO_RESTORE_RESULT_URL}}.

## 4. 英文技术博客完整草稿

> 这是可填写并修订成发布稿的完整结构。任何未验证的实现都保留为设计意图。完成后至少补齐真实架构细节、版本、评测表、截图、限制和链接，再由用户确认最终发表。

---

# RecallLedger: A Spending Assistant That Remembers Corrections

*Built for the Walrus × Tatum Total Recall hackathon. Submission snapshot: {{TODO_COMMIT_SHA}}, verified at {{TODO_LAST_VERIFIED_AT}}.*

## The mistake we wanted the assistant to stop making

A transfer tells us that value moved. It does not tell us why.

Consider a freelancer who sends 12 units of a demo USDC token to the same recipient twice. The first transfer is a business tool expense. It is tempting for an assistant to label every future payment to that recipient as “tools.” But the next payment might be a reimbursement, and a later incoming transfer might be a refund.

Remembering the original answer is useful. Remembering its limits is more useful.

RecallLedger is designed around that distinction. It separates observable transaction facts from the user’s explanation, asks when the purpose is unknown, and applies only rules the user has confirmed. The central interaction is not “chat with your wallet.” It is “correct this once, see exactly what was learned, and change or revoke it later.”

The financial story used in this article is a clearly labeled synthetic teaching sequence. The live-chain integration sample and the Mainnet storage evidence are separate. We do not present the synthetic sequence as a real customer’s finances.

## What the product does

The submitted build supports {{TODO_IMPLEMENTED_SCOPE}}.

Its core workflow begins with a transaction card. Where a live transaction is used, the backend requests the relevant Sui data through Tatum. It normalizes token identity, integer amount, direction relative to the selected wallet, and execution status. These facts are displayed independently from the category.

If no confirmed rule applies, the category remains `needs_context`. The user can supply the purpose and review a proposed rule with an explicit scope: recipient, token, direction, amount interval, and validity period. Confirming a label for one transaction and confirming a rule for future transactions are separate actions.

The interface then explains a later classification using the actual rule and its revision. It also makes the unresolved total visible. An unclassified outflow is not silently treated as zero spending or as a confirmed expense.

## Why Tatum is part of the product

Tatum supplies the chain facts that the application can check. It does not supply the business meaning of a transfer.

For the live integration example, we queried {{TODO_REAL_CHAIN_SAMPLE_DESCRIPTION}}. The evidence records the network, method or transport, verification time, relevant normalized fields, and the submitted build version. The result is available at {{TODO_REAL_CHAIN_SAMPLE_URL}}. API credentials remain on the server.

Failed transactions, unsupported shapes, inconsistent facts, or unavailable providers do not become confirmed expenses. The application shows the relevant failure or uncertainty and preserves the distinction between “not verified” and “verified but unlabeled.” {{TODO_DESCRIBE_TESTED_FAILURE_BEHAVIOR}}

This makes the integration relevant to the actual decision: the assistant cannot apply an outgoing-payment rule to an incoming transfer simply because the amount and counterparty look familiar.

## What Walrus Memory remembers

Walrus Memory is used for the durable learning history: confirmed preferences, observations, confirmed labels, scoped rules, decisions, corrections, a refund relationship, and a revocation.

The application records changes as events. An updated rule explicitly supersedes its predecessor. A revoked rule remains explainable in history but no longer controls a future classification. This is an application-level design choice for an auditable state transition history; it is not a claim that all data on Walrus is necessarily permanent.

The submitted Mainnet manifest contains {{TODO_MEMORY_COUNT}} verified events, at {{TODO_MANIFEST_URL}}. The learning content is synthetic, while the storage mode is {{TODO_STORAGE_MODE_AND_VERIFICATION_LEVEL}}. We show both labels because a real storage operation does not make a fictional financial example real.

SDK versions and observed persistence behavior are recorded at {{TODO_VERSION_AND_PROTOCOL_EVIDENCE_URL}}. A completed write job and an independently verified onchain blob record are different evidence levels. Where the latter could not be established, the manifest says so rather than upgrading the claim.

## The learning sequence

The canonical sequence is published in `fixtures/demo-sequence.json`.

First, the user confirms a tools budget of 60 demo units and a policy that unresolved items stay visible without being counted as confirmed expenses. A 12-unit outgoing transaction arrives with an unknown purpose. The user labels it as tools and confirms a rule covering the same recipient, demo token, outgoing direction, and amounts from 5 to 30 for a limited period.

A second 12-unit outgoing transaction matches that rule. A 25-unit outgoing transaction also matches it, but the user corrects the latter: it was a reimbursement, not a tools expense. That correction applies to the specific item. The assistant proposes a narrower rule, and the user separately confirms a new 5-to-20 range that replaces the old one.

An incoming 12-unit transfer still needs context because direction matters. The user confirms that it refunds the second tools payment. A later outgoing 25-unit transfer remains unresolved under the narrower rule. Finally, the user revokes that rule. A future 12-unit outgoing transfer must ask again.

The point is not that one example teaches a universal financial truth. The point is that the assistant can preserve a user-confirmed boundary, explain a correction, and stop applying a rule after it has been withdrawn.

## Testing whether memory changes behavior

We use a fixed set of inputs and compare two conditions: the same decision procedure without learned memory and with the applicable confirmed memory state. Inputs, normalization, and evaluation targets remain the same. This avoids crediting memory for a different prompt, different transaction, or different model response.

The result is {{TODO_RESULT_SUMMARY_WITHOUT_INVENTED_PERCENTAGES}}. Full results are published at {{TODO_EVAL_RESULTS_URL}}.

| Check | Without learned memory | With confirmed memory | Evidence |
|---|---|---|---|
| Repeated in-scope outgoing item | {{TODO_BASELINE_REPEAT}} | {{TODO_MEMORY_REPEAT}} | {{TODO_CASE_ID_REPEAT}} |
| 25-unit out-of-scope item after narrowing | {{TODO_BASELINE_EXCEPTION}} | {{TODO_MEMORY_EXCEPTION}} | {{TODO_CASE_ID_EXCEPTION}} |
| Incoming transfer | {{TODO_BASELINE_DIRECTION}} | {{TODO_MEMORY_DIRECTION}} | {{TODO_CASE_ID_DIRECTION}} |
| Future item after revocation | {{TODO_BASELINE_REVOKED}} | {{TODO_MEMORY_REVOKED}} | {{TODO_CASE_ID_REVOKED}} |
| Expired rule | {{TODO_BASELINE_EXPIRY}} | {{TODO_MEMORY_EXPIRY}} | {{TODO_CASE_ID_EXPIRY}} |

We report both useful reuse and mistaken automatic classifications. Fewer questions are beneficial only where the confirmed rule actually applies. The tests are a controlled product demonstration, not evidence of population-level accuracy or user demand.

## A fresh client and the boundary of portability

The portability test starts a fresh process with an empty local projection, no old application database, and no saved browser state. It receives authorized credentials and a frozen manifest containing event locators and integrity information, not a precomputed rule state or a hidden copy of event content.

The client retrieves the remote events, checks the exact expected set and content hashes, and rebuilds the state. The outcome was {{TODO_RESTORE_RESULT}}. The expected and reconstructed state hashes are {{TODO_EXPECTED_STATE_HASH}} and {{TODO_RESTORED_STATE_HASH}}.

Missing events cause an explicit failure. The test must not silently substitute local fixtures. Replay and the default restore check are read-only and do not create a thirteenth learning event. Any separately enabled index repair is an operator maintenance action, is recorded as such, and does not add a new learning event.

This proves the tested form of portability for the frozen demo dataset through the Walrus-backed memory service. It does not prove unlimited recovery across arbitrary account sizes, recovery without the relayer, or freedom from all service dependencies. The actual bound and tested failure behavior are documented at {{TODO_RESTORE_LIMITATIONS_URL}}.

## What the public demo can and cannot do

The public demo is read-only. Visitors can replay the story, inspect comparisons, and inspect published evidence. Author operations that create or confirm new learning events are protected and are not exposed as anonymous write endpoints.

RecallLedger does not sign transactions, transfer funds, or change a payment limit. Its memory is not payment authorization. The demonstration also does not require visitors to connect a wallet or reveal personal financial history.

Current limitations are {{TODO_LIMITATIONS}}. Areas that remain unimplemented are {{TODO_UNIMPLEMENTED_FEATURES}}. Payment protocols and the Tatum AI Builder award are outside this submission’s scope.

## What we learned building it

{{TODO_REAL_BUILD_OBSERVATION_1}}

{{TODO_REAL_BUILD_OBSERVATION_2}}

These observations must come from actual integration work. A useful account of a failed restore or a corrected API assumption is more informative than claiming that every integration was effortless.

## Try it and inspect the evidence

- Read-only demo: {{TODO_LIVE_DEMO_URL}}
- Source and exact build: {{TODO_PUBLIC_REPO_URL}} / {{TODO_COMMIT_SHA}}
- Mainnet memory manifest: {{TODO_MANIFEST_URL}}
- Fixed evaluation results: {{TODO_EVAL_RESULTS_URL}}
- Fresh-client restore result: {{TODO_RESTORE_RESULT_URL}}
- Two-minute-forty-second walkthrough: {{TODO_VIDEO_URL}}

**AI assistance:** This project was developed with ChatGPT dot for {{TODO_DOT_ACTUAL_CONTRIBUTIONS}}. Additional tools or models were used for {{TODO_OTHER_ACTUAL_CONTRIBUTIONS_OR_NONE}}. The builder reviewed {{TODO_HUMAN_REVIEW_SCOPE}}. We did not use Tatum AI Builder and are not claiming its dedicated award. If that changes, this disclosure and the submission category must be updated to reflect the real workflow.

**References:** [Total Recall event](https://tatum.io/hackathon/total-recall), [event rules](https://thewalrussessions.wal.app/tatum-total-recall/index.html), [Walrus Memory](https://docs.wal.app/walrus-memory), [Tatum documentation](https://docs.tatum.io/). Accessed 26 October 2026; implementation-specific versions are recorded in the repository.

---

## 5. 2分40秒演示分镜

### 5.1 录制前设置

- 使用最终验收commit；启动时显示版本、最近核验时间、`Synthetic learning examples`标签。
- 公开演示只读，展示实时作者写入时使用保护会话；屏幕不出现密钥、Token、个人联系信息或真实客户数据。
- 提前准备真实Tatum样本与冻结的12条学习事件。读回/回放不再次播种。
- 若网络调用等待较长，可明确加速/剪切等待，但保留动作、响应和成功/失败结果；不可将fixture画面标作live。
- 视频右下角用简洁标签区分`Replay`、`Live read`、`Mainnet storage verified`、`Not independently verified`等实际状态。不存在的证据标签不得出现。

### 5.2 时间轴与英文口播

| 时间 | 画面与操作 | 英文口播要点 | 对应证据 |
|---|---|---|---|
| 0:00—0:12 | 标题+一张未知用途转账卡；顶部清楚写教学数据 | “A wallet records what moved. It does not remember why. RecallLedger remembers a correction—and the limits of that correction.” | 项目定位；不宣称真实个人支出 |
| 0:12—0:30 | 切到真实链上只读样本，展开Tatum facts；再回教学页 | “Tatum gives us the token, amount, direction, and execution status. Purpose is separate. This live-chain check is separate from the synthetic learning story.” | 实际Tatum样本、时间与状态 |
| 0:30—0:52 | M02未知12→M03用户工具费→M04确认规则5–30；显示对手方、方向、币种、有效期 | “I label this outgoing payment as tools. Then I confirm a limited rule. One label does not automatically authorize a permanent rule.” | label与rule分别确认；真实事件定位 |
| 0:52—1:12 | 同输入对照：M05第二笔12；无记忆needs_context，有记忆tools；解释面板显示v1 | “On the same next input, the baseline asks again. The remembered rule can answer—and shows exactly why.” | 固定caseId、state版本与rule引用 |
| 1:12—1:40 | M06出25被旧规则归类→M07用户改报销→M08确认v2收窄5–20；再展示M11新25仍追问 | “The old rule is too broad. This payment was a reimbursement. The correction fixes this item; I separately approve a narrower rule. The next 25-unit payment now asks for context.” | correction与replacement因果关系 |
| 1:40—1:57 | M09入12仍unknown→M10用户确认退款关联B；M12撤销后新12再次unknown | “Incoming money is not an outgoing expense. A refund needs its own link. And once I revoke a rule, the assistant asks again.” | 方向约束、退款关联、撤销 |
| 1:57—2:20 | 新进程空projection恢复；展示远端事件数、hash匹配；缺失时失败分支可用小图注 | “Now a fresh client restores the same confirmed state from remote memory. No old database or browser state is used. Missing events fail the check.” | 实际restore日志、stateHash；不是localStorage导入 |
| 2:20—2:34 | 证据抽屉：12事件manifest、合成内容/真实主网存储分标签、SDK/chain证明分层 | “The financial examples are synthetic. The memory persistence is verified separately. Here are the event records and the checks you can reproduce.” | 真实成功事件数；未验证项如实显示 |
| 2:34—2:40 | Demo/Repo短链接，最后一张“Corrections carry forward. Exceptions do too.” | “RecallLedger: useful memory includes knowing when to ask again.” | 最终可访问链接 |

这份时间轴包含计划中的行为。若某一动作最终未验收，不要用预制动画伪装成功；修复、删减该段或在视频明确标为未实现。没有主网记忆证据时，整体不应作为满足赛事要求的完成品提交。

## 6. 截图与视频叙事清单

正文建议只用五张关键图，按“问题—学习—例外—迁移—证据”组织：

1. **Unknown purpose：** Tatum事实已核验，但分类仍needs_context；解释链上事实的边界。
2. **Same input, different memory：** 相同caseId、相同输入，有/无记忆结果并排；避免只展示两个不同金额的卡片。
3. **Correction narrows scope：** 25报销反例、旧5–30规则、新5–20规则、用户确认状态，突出这不是偷偷改规则。
4. **Fresh-client restore：** 新进程运行结果、远端事件数、stateHash匹配；裁掉凭证与无关终端内容。
5. **Evidence drawer：** data origin、storage mode、provider verification与chain verification状态分开。

截图不能替代视频和可工作demo。截图旁注明所对应的commit和真实状态；如来自回放，明确写`Replay from the frozen demo sequence`。

## 7. 官方提交字段映射

表单字段来自2026-10-26只读核验的[当前活动页](https://recall-tatum-walrus.vercel.app/)及其公开前端资源；提交当天再核查。规则依据见[赛事规则](https://thewalrussessions.wal.app/tatum-total-recall/index.html)。

| 字段 | 准备内容 | 注意事项 |
|---|---|---|
| Email | 用户真实联系邮箱 | 不代填未知信息 |
| Discord handle | 用户真实handle | 不能把自动生成昵称当已存在账号 |
| LinkedIn | 用户真实资料URL | 无资料时先核对表单与主办方要求，不伪造 |
| How did you hear about this event? | 真实来源 | 可写公开活动页/社区来源，以事实为准 |
| First Web3 project? | 按用户真实经历回答 | 用户已有Web3项目，不能为叙事假装首次 |
| Tatum ID | My Account → My Account Info账户ID | **不是Tatum API Key** |
| SUI address | 用户确认的公开钱包地址 | 不是助记词或私钥 |
| Account ID(SUI) | 实际Walrus Memory账户对象ID | 与演示证据一致 |
| MEMWAL_AGENT_ID | Delegate keys中的Public key | **绝不粘贴delegate私钥** |
| Project description | 本文英文稿、明确Smart Agents与Memory奖 | 当前表单未见独立track字段，描述中写明 |
| Short demo video | 2—3分钟视频公开URL | 不是未上传的本地视频路径 |
| GitHub repo | 公开仓库URL | README顶部放demo、博客、视频、证据 |
| Additional documentation | 博客URL、评委入口、证据页 | 字段可选不取消公开博客硬要求 |
| Walrus experience | 真实集成体验，含具体限制和改善建议 | 未遇到的bug不能编造 |
| Tatum AI Builder experience | “We did not use Tatum AI Builder. This was an independent build developed with ChatGPT dot; Tatum was used for read-only Sui integration.” | 只有真实如此才使用；规则允许独立路径 |
| Walrus friction | 一个真实可复现问题，或留空 | 可选 |
| Social post links | 实际已发布链接 | 草稿链接不算分享 |
| Accept terms | 用户阅读后作出真实接受决定 | 准备草稿不等于已接受条款 |

### 提交流程

1. 验收通过后记录版本、数据模式、实际主网事件数及剩余限制，冻结证据。
2. 在匿名窗口验证demo、仓库、博客、视频、manifest；保证没有开发者登录态才能打开的链接。
3. 填充本文所有TODO，执行文档占位符检查；把博客和描述中的未实现能力删去。
4. 为用户准备完整表单预览，汇总真实身份字段中尚缺的最少信息；不重复问已知的中国、成年、个人参赛事实。
5. 用户确认具体材料与提交行为后，在正式入口提交一份作品，保存成功回执和实际提交时间；不因不同奖项重复提交。
6. 提交后保留demo可用和证据可访问，直到评审结束；不要为“更好看”改写已发布证据。

正式截止：**2026-11-10 17:00 UTC / 北京时间2026-11-11 01:00**。内部建议11月8日完成验收材料，11月9日前准备好提交，不把最后一分钟当正常开发计划。来源：[官方日期](https://thewalrussessions.wal.app/tatum-total-recall/index.html)，访问日期：2026-10-26。

## 8. 英文社交草稿（未发布）

### X草稿

> 仅在主网与演示验收完成、替换链接后使用；字符数随最终URL再检查。

RecallLedger remembers corrections—and when to ask again.

Tatum checks Sui transaction facts. Walrus Memory carries confirmed rules and exceptions across sessions.

Synthetic examples; separately verified Mainnet memory.

Total Recall demo: {{TODO_LIVE_DEMO_URL}}

### LinkedIn草稿

RecallLedger started with a small question: why should a freelancer explain the same transaction twice—and why should one answer become an unlimited rule?

Our Total Recall project separates chain facts from financial meaning. Tatum provides read-only Sui transaction data. The user confirms a scoped rule, and Walrus Memory preserves that rule together with its corrections, exceptions, and revocation.

The demo includes a controlled comparison on the same inputs and a fresh-client restore. The learning story uses synthetic data; Mainnet persistence and live-chain integration are evidenced separately.

Current build and limitations: {{TODO_BLOG_URL}}
Demo: {{TODO_LIVE_DEMO_URL}}
Source: {{TODO_PUBLIC_REPO_URL}}

Built with AI assistance, with the actual tool contributions disclosed in the repository.

可按官方活动页选择标记`@Tatum_io`与`@WalrusFoundation`；实际账号提及以平台解析出的正确对象为准，不把错误handle当完成。社交加分无公开固定分值，不能保证。来源：[官方活动页Scoring](https://recall-tatum-walrus.vercel.app/)，访问日期：2026-10-26。

## 9. AI与外部代码披露模板

在最终README和博客保留一个简短、真实的段落：

> **Development disclosure:** ChatGPT dot assisted with {{TODO_ACTUAL_SCOPE}}. {{TODO_OTHER_TOOLS_OR_NONE}} assisted with {{TODO_SCOPE_OR_NOT_APPLICABLE}}. The project author reviewed {{TODO_REVIEW_SCOPE}} and performed {{TODO_HUMAN_TESTS_OR_NONE}}. Third-party libraries and reused code are listed in {{TODO_LICENSE_AND_ATTRIBUTION_PATH}}. The submission contains {{TODO_NEW_WORK_DURING_BUILD_WINDOW}} created or materially advanced during the hackathon window. Tatum AI Builder was not used; this project is entered as an independent build.

不编造“全部人工审计”“生产安全认证”“端到端100%通过”；不把文档中计划运行的测试写成已运行。遇到其他模型/工具实际使用情况变化，更新披露与具体贡献。

## 10. 三个主办方问题模板（只准备，不发送）

这些问题只影响对应不确定项，不阻止继续实施已明确的核心功能。未经用户授权不通过Discord、邮件或社交工具发送。

**Question 1 — track wording**

> We are building RecallLedger for Smart Agents for Real Life: a read-only Sui spending assistant whose confirmed rules and corrections persist through Walrus Memory. The Event Rules introduction mentions a “feedback and form platform,” while the detailed tracks describe memory-enabled agents. Can you confirm that the detailed Smart Agents track governs this type of submission?

**Question 2 — transparent teaching data**

> Our demonstration uses clearly labeled synthetic financial examples, with at least 12 actual Mainnet Walrus Memory events and a separate live Tatum Sui read. We will publish the evidence and distinguish data origin from storage mode. Does this satisfy the Mainnet-memory submission requirement without using real private financial records?

**Question 3 — judging access**

> Is a public read-only demo, public source, a 2–3 minute video, and a reproducible evidence manifest sufficient for judging a project whose memory-write actions are protected? The public demo replays a frozen history without creating new Mainnet writes. We can provide the author-flow video and restore evidence without sharing private keys.

如主办方回复，保存原始链接、日期与明确答复，更新[规则审查](01_AUDIT_AND_RULES.md)与[来源记录](14_SOURCES_AND_UNCERTAINTY.md)。没有答复时保留“未获澄清”，不得改成“官方已批准”。


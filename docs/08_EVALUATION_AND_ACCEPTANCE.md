# 08 · 评测、验收与证据要求

> 当前状态：`NOT RUN`。本文件定义将来必须执行的验证；`fixtures/eval-cases.json` 是32个用例计划，不能当成已实现或通过的测试。所有主网证据、浏览器结果、用户成绩和费用需实际运行后填写。

## 1. 先回答四个可证伪问题

1. 记忆是否改变了下一次具体决定，而非只改变解释文字？
2. 改变是否来自历史记忆，而非输入、提示词、模型或硬编码演示变化？
3. 用户的反例、撤销与范围限制是否真正生效？
4. 去掉应用自己的缓存和数据库后，另一表面是否能从Walrus恢复同一有效规则？

任一项未通过，不能在提交材料中宣称已完成完整学习闭环或可移植恢复。

## 2. 测试分层

| 层 | 输入与工具 | 证明能力 | 不能证明 |
|---|---|---|---|
| 领域测试 | 合成facts、固定事件、纯规则引擎 | 金额、分类、冲突、反例、回放语义 | provider当前可用或已上主网 |
| Adapter契约 | 实际选定SDK类型、记录的脱敏response fixture | 方法/返回形态适配、状态机 | 账户权限、真实上传成功 |
| 集成smoke | 指定账户和真实Tatum/Walrus访问 | 当前环境读写与回执 | 大规模稳定性或所有用户适用 |
| 浏览器E2E | 公开只读和operator fixture会话 | 真实可点的用户流程、错误态 | 所有链操作是真实主网 |
| 冷恢复/CLI | 空应用状态、精确manifest、授权远端读取 | 可移植性及恢复完整性 | 无密钥公众能解密私有内容 |
| 用户小试 | 作者自测，另1–2名真实潜在用户（若招到） | 方向性可用性反馈 | 代表市场、统计显著成效 |

每份结果都必须写清使用哪一层、哪种provider模式，不能让fixture的成功状态流入 `mainnet_observed`。

## 3. 32个用例清单

完整可转为测试的数据在 `fixtures/eval-cases.json`。ID不可随意重用；变更预期需记录理由。fixture里的字段是场景计划，不是HTTP DTO或第三方SDK参数；实现时显式映射到04的规范模型，例如outgoing/incoming转换为out/in、synthetic网络转换为sui:fixture。

| 分组 | 用例 | 关键行为 |
|---|---|---|
| Facts / Amounts | F01–F08 | 成功事实与未知用途分开；完整资产类型；失败/错误网络/owner/复杂交易；故障状态；整数金额 |
| Rules | R01–R10 | 未知与有效范围；确认及持久化门槛；方向/地址/owner；区间边界；过期/撤销；单笔覆盖；取代/冲突；退款 |
| Memory | M01–M08 | 固定输入消融；空状态恢复；Web/CLI一致；检索顺序独立；重复幂等；缺失/异步/篡改失败 |
| Security | A01–A04 | 输入指令无权改规则；客户端篡改无效；公开只读；凭据不泄漏 |
| User outcome | U01–U02 | 因果序列金额及提醒变化；实际按钮/错误态/多宽度交互 |

用例中的counterparty、资产、金额、transaction ref均为合成。`TEST_USDC` 不是可用的主网coin type。每个用例的 `actualResult` 初始值为 `not_run`，执行后另写结果报告，不覆盖原始预期以“修到通过”。

测试实现应验证业务结果与边界，不重复断言实现私有函数如何调用。已有测试证明某条风险后不重复堆叠同义测试。发生具体剩余风险再扩展。

## 4. 记忆消融实验

### 固定项

固定同一规范化交易对象及其hash、同一域引擎版本、同一时间基准、同一预算口径、同一已确认当前指令。历史记忆是唯一切换项。若为了生成解释调用LLM，两边使用相同模型和参数；不依赖自然语言措辞判定正确。

### 实验A：避免重复追问

使用fixture B：出账12，counterparty R，TEST_USDC。以M04为as-of状态：

- `memory off`：没有历史规则，输出needs_context，这是正确的保守行为。
- `memory on`：已确认v1规则适用，输出expense/tools并附rule reference。

评估是否减少重复确认，不要求无记忆系统错误分类。

### 实验B：反例后的边界修正

固定fixture E：出账25。M04时v1适用；M08时v2不适用，输出needs_context。原始facts和input hash保持一致。这个变化证明已确认历史会改变行为。

v1的5–30与v2的5–20都来自用户明确提供/确认；不能宣称系统从单个12样本发现了合理范围。M06按v1正确执行，但后来与用户提供的实际用途不符，是保留的业务反例。分别评价“规则执行正确性”和“已知真实标签一致性”，不能把前者当成后者。

### 实验C：用户撤销

以M12为as-of，对新的12出账预览，必须needs_context。旧M05仍能按当时版本重放。此次操作不写入第13条记忆。

### 记录格式

每次保存：input hash、as-of sequence、engine version、history enabled、policy ids、reason codes、classification、预算影响、耗时、调用次数、数据来源、实际观察结果。不得只保存最后一张成功截图。

## 5. 冷恢复验收

浏览器刷新或清除浏览器localStorage不是充分的冷恢复测试，因为后端可能仍有全部规则。

必须执行：

1. 生成脱敏portable manifest，只包含恢复所需的公开metadata、标识/引用与hash，不把完整策略payload当作恢复“缓存”夹带其中。
2. 创建独立Node进程和空内存投影；不提供旧应用数据库连接或本地事件正文。SDK正常需要的授权凭据仍可提供，但不能从旧应用DB读规则。
3. 使用经过spike核实的Walrus SDK接口找回目标account/namespace的精确记录集。接口细节以集成规格和锁定版本为准。
4. 核对manifest列明的blob/event id精确集合、eventHash、textSha256、序号、前向/后向链接及完整性。原memory/job id保留为写入回执，索引重建后的memory id可变化，不能据此错误拒绝。语义相似度、返回顺序、created_at都不能替代权威版本关系。
5. 按规范事件重建投影，比较warm与cold的projection hash及固定输入结果。
6. 在CLI重复计算，比较Web和CLI的classification、reason codes、rule ids。

判fail的条件：缺一条仍宣称完整、使用旧本地payload补洞而不披露、只验证条数不验证集合、按recall前几条猜当前规则、hash不匹配仍继续、只清前端缓存。

限定范围是单个专用demo账户和可控记录数。若SDK不能证明完整发现，应使用明确导出的bootstrap manifest并披露依赖；不能声称只记住账户名即可自动恢复所有历史。

## 6. 主网持久化与实际链证据验收

### 必须留下的执行事实

- 当前代码commit SHA、依赖lockfile、provider/SDK版本与核查日期。
- 实际账户/namespace的脱敏标识、实际memwal agent public id；绝不放委托私钥。
- 至少10条真实成功存储的memory记录；计划12条并不等于完成12条。
- 每条真实memory id、job id、blob id、最终状态、内容hash、验证时间；实际没有的字段留null/Unknown。
- Tatum实际请求的方法/网络、成功或失败结果摘要、有关transaction digest；API key删去。
- 冷恢复结果、完整性校验输出与projection hash。

主网存储的内容可以是明确标注的合成场景。此时证据只能支持“合成场景成功保存并恢复”，不能支持“真实用户长期使用”或“完成了真实的12笔支付”。

主线另需一条真实链上事实读取：用owner明确指定、已存在且支持的Sui主网交易，通过Tatum核验。**P1加分实验，可选且不阻断P0：** 有真实用途输入时，把该事实及用户确认纳入独立live integration smoke，检查确认→真实持久化→独立读取。该记录不伪装成固定12条synthetic场景，只在显式独立scope/namespace写入并计入同owner总上传预算。没有真实用途输入就保留链事实并标needs_context，不给公共交易编真实账单，不为了演示转真实资金。12条教学manifest不因可选实验悄悄变为13条；40总量预算涵盖两者。

`job accepted`、`queued`、本地记录成功都不算Walrus完成。失败或未知状态先查原job与已有回执，不无条件重新remember。不得通过换namespace重播来假装幂等。

### 公开验证的边界

公开blob/交易metadata与授权读取的解密内容是两种不同证据。评委无私钥可以查看公开链事实和脱敏报告；不能因此声称他能直接解密所有私有记忆。CLI需要的配置应写清楚，公开repo不携带凭据。

## 7. 浏览器按钮验收

使用具备真实交互的浏览器进行，不能只跑build或解析HTML。按 `07_UI_UX_SPEC.md` 逐项点击：

- Inbox交易、Evidence开关/复制、标签选择/保存。
- operator模式下规则提议/确认、反例更正、范围收窄、撤销。
- Memory历史、状态、证据入口。
- Replay固定输入、as-of、memory off/on，检查输入hash未改变。
- pending、失败、重试、权限拒绝、不完整恢复和冲突规则。
- 375、768、1440宽度，键盘路径、焦点与console错误。

大部分交互用fixture provider进行，避免测试反复写主网。主网只运行单独记录的受控smoke。公开demo的所有远端写路由必须拒绝未授权会话，不能只灰掉按钮。

## 8. 验收门槛

以下E1–E6为验收维度，与09的G0–G6开发阶段不同；阶段完成需满足当时相关维度，G5汇总检查全部32案例与证据。

| Gate | PASS要求 | FAIL/BLOCKED示例 |
|---|---|---|
| E1 域行为 | 所有领域相关计划用例实现并按预期执行；失败不可隐藏 | 浮点金额、未知被当消费、冲突随机选规则 |
| E2 真实集成 | 锁定版本、真实Tatum读取、真实Walrus完成和内容读取 | fixture通过但当前SDK不可用；只拿job id |
| E3 记忆完整性 | 精确集合冷恢复和CLI/Web一致；缺失/篡改失败 | 依赖旧DB、仅recall top-k、只核条数 |
| E4 产品可用 | 真实按钮、错误态、三个宽度通过 | 无限spinner、静态按钮、公开写接口 |
| E5 提交真实性 | 实际10+mainnet、repo/demo/blog/video和表单资料齐全 | 草稿博客冒充已发表、未发布demo冒充线上 |
| E6 成效表述 | 所有演示/指标注明实际、合成、未测的边界 | 编造用户、虚构节时/准确率、声称有保证获奖 |

任一验收维度失败都要在handoff和提交准备中显示。缺凭据是BLOCKED不是PASS。E1通过不替代E2，代码存在也不替代浏览器验收。

dot实现的命令统一采用10：`test:domain`、`test:integration`、`test:e2e`、`eval:fixtures`、`eval:ablation`、`verify:offline`、`verify:live`、`verify:restore`。这些名称是待实现契约，不代表现在能运行。

## 9. 成果报告模板

```json
{
  "reportStatus": "not_run",
  "codeCommit": null,
  "executedAt": null,
  "providerMode": null,
  "caseResults": [],
  "gates": {
    "E1": "NOT_RUN",
    "E2": "NOT_RUN",
    "E3": "NOT_RUN",
    "E4": "NOT_RUN",
    "E5": "NOT_RUN",
    "E6": "NOT_RUN"
  },
  "actualMainnetMemoryCount": 0,
  "actualMainnetReceipts": [],
  "coldRestoreProjectionHash": null,
  "browserEvidence": [],
  "observedMetrics": null,
  "blockers": []
}
```

执行完成后保存原始失败与重试证据，给出简明结论：哪些能力已证明、在哪个commit和环境成立、什么仍未证明。不要因迫近截止日期把NOT_RUN改成PASS。

## 10. 时间紧张时保留什么

先保留一条真实读取/确认/存储/恢复闭环、准确领域规则、反例、三页面可用、10+有因果意义的记忆及清楚演示。删除可选资产、漂亮但无信息的图表、额外集成、自动化后台与支付模块。最终录制的内容必须与真实可运行的版本一致。

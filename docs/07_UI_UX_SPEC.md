# 07 · UI 与交互规格

> 英文产品界面，中文开发文档。以下为实施设计，不是已渲染或已测试的界面。只实现 Inbox、Memory、Replay 三个主页面和一个 Evidence 抽屉。

## 1. 产品视觉与信息层级

界面应像安静、可信的个人工作工具。重点是“这笔钱怎样归类、为什么、我能如何纠正”。避免满屏链上指标、钱包地址墙、霓虹科技效果、饼图堆叠或把原始 JSON 当作主界面。

建议初始 design tokens：

| 项目 | 值/要求 |
|---|---|
| Canvas | `#F6F7FB` |
| Surface | `#FFFFFF` |
| Main text | `#18212F` |
| Secondary text | `#526174` |
| Border | `#DDE3EB` |
| Primary action | `#166F63`，文字白色；实现后实际检查对比度 |
| Warning | 深琥珀文字 + 淡琥珀背景，始终带状态文字 |
| Destructive semantic | 仅用于撤销确认、验证失败；不把所有未知标红 |
| Font | 系统 sans；金额使用 tabular numerals；正文至少16px |
| Radius / spacing | 卡片12px；8px间距体系；页面最大宽度1200px |
| Motion | 轻量状态过渡；尊重 reduced-motion；记忆变化不靠动画证明 |

375px：单列，三项页签允许正常换行/压缩但不横向溢出；Evidence 为全屏面板。768px：主体单列、卡片并排可用时才启用。1440px：列表与当前交易区域双列，Evidence 为右侧抽屉。状态文字不因小屏消失。

所有主要交互触控区至少44×44 CSS px，键盘可达、focus可见，抽屉正确管理焦点并支持 Escape；状态不只用颜色。数字截断时必须可展开完整值，不能将不同资产金额汇总为一个数字。

## 2. 常驻导航和环境标识

左上：`RecallLedger`。副标题：`Your wallet facts. Your remembered context.`

主导航：`Inbox` / `Memory` / `Replay`。右上标识当前环境与权限：

- 公开场景：`Recorded scenario · Read only`，旁边固定 `Synthetic inputs`。
- 配置好且实际成功核验的主网数据：`Mainnet evidence`，显示核验时间。
- 操作会话：`Operator session`；凭据来源不向页面输出。
- fixture provider：必须显示 `Fixture provider`，不能只换个绿色点伪装 mainnet。

公开用户切换页签、展开证据、选择回放时点只是读取，不写主网。写操作必须由后端检查 operator session，不能仅靠隐藏按钮。

## 3. Inbox

### 导入与记录

公开首页主入口统一为 `Replay the correction`，进入冻结教学演示。operator顶部提供交易digest和观察钱包两项输入，按钮 `Inspect transfer` 只查询/预览，不存记忆；新数据明确标未保存。作者可用 `Record transfer` 保存观察，或在预览分类后 `Record this decision` 保存带输入事实的决策，分别映射04的observations/import与decisions/record。不要只实现脚本seed入口。

单笔 `Save label`、后续 `Save correction` 和未来规则 `Confirm this rule` 是不同命令。预算行 `Edit budget` 打开小表单，保存映射preferences/confirm，用户明确选择资产、类别、周期、预算60和提醒45。任何写入pending时保留只读/提议能力，暂停新写按钮并显示原操作进度；不能为绕过pending创建第二个版本。

### 顶部摘要

三张紧凑卡片：

1. `Tools spend`：只计算当前预算口径；如 `12.00 TEST_USDC`，并标注 synthetic。
2. `Needs context`：金额与笔数，例如 `25.00 TEST_USDC · 1 transfer`。未知不能算零或藏到已分类金额里。
3. `Active rules`：显示有效规则数量和最近更新状态；不把proposed/pending算active。

预算行：`Tools budget: 60.00`；用户明确设置提醒阈值45。M06演示中误归类导致49触发 `Approaching your Tools budget`；M07纠正到24后解除。阈值不因算法“学习”而自动提高。

### 交易列表

每行展示：方向、金额/资产、短counterparty别名、日期、分类、依据类型。长地址只放 Evidence 中；别名不是经认证的商家名称。

状态文案：

| 领域状态 | 英文文案 | 行为 |
|---|---|---|
| `needs_context` | `Needs context` | 主按钮 `Add context` |
| 用户单笔分类 | `Confirmed by you` | `Correct this transfer` |
| 规则分类 | `Applied rule v2` | `Why this category?` 与 `Correct` |
| 事实未完成 | `Verifying transaction…` / `Proof pending` | 不显示 verified；可保留草稿，不能生效 |
| 不支持交易 | `This transaction needs manual review` | 解释支持边界，不强推分类 |
| provider失败 | `Could not verify this transaction` | 展开原因和有限重试；不无尽转圈 |

### 当前交易详情

用三个分开的区域表达证据：

- **Onchain facts**：方向、完整资产标识入口、整数金额换算、网络、交易状态、核验时间。
- **Your context**：当前分类、category、用户确认来源和说明。
- **Why this result**：应用条件的短句和rule id；未匹配时显示最关键原因，例如 `Amount exceeds this rule's 20.00 upper bound`。

主操作：`Add context`、`Correct this transfer`、`Teach a reusable rule`。公开模式禁用写操作并说明 `Open an operator session to make changes`，不要点击后假成功。

## 4. 用户标注、规则与反例

### 单笔标注

分类选择必须与领域枚举一致：

| 值 | UI |
|---|---|
| `expense` | `Expense` |
| `internal_transfer` | `Internal transfer` |
| `reimbursement` | `Reimbursement` |
| `refund` | `Refund` |
| `income` | `Income` |
| `needs_context` | `Leave unclassified` |

选择 Expense 时可选择 `Tools`；当前MVP不扩展复杂会计科目。选择 Refund 时必须选择明确的原交易并通过服务端关联校验；不要只给自由文本“退款”就冲账。

保存前一句提示：`This describes the transfer's purpose. The blockchain does not verify this context.` 保持短句，不在用户流程展示实现说明。

### 规则提案

提案不是保存即激活。先显示可编辑的自然语言摘要：

> For outgoing TEST_USDC transfers to this counterparty, between 5.00 and 30.00, use Tools for the next 30 days.

下方可展开精确条件：network、完整asset、owner、direction、counterparty、min/max、有效期。每项默认保守，不从单笔12的样本擅自推断5–30范围；演示里该范围由用户明确输入。没有LLM凭据时用同一表单人工填写，规则引擎行为不变。

主按钮：`Confirm this rule`。确认后：

1. `Confirmed · Saving memory…`；规则暂不作用于新交易。
2. 完成后 `Active · Memory persisted`，可点开回执。
3. 失败或未知：`Not active yet · Memory sync needs attention`。重试复用同一操作ID；不能再点一次就创建重复版本。

LLM可以解释和提议，但不能直接点击确认、放宽预算、改金额或把输入文本当高优先级指令。

### 纠正与反例

用户将C从Expense改为Reimbursement时，先保存明确针对C的更正。提示：`This correction applies to this transfer.` 其他交易不随之被改写。

随后可提议 `Narrow the matching range`。v2范围5–20仍需用户明确确认。比较框只列改变项：`Maximum amount: 30.00 → 20.00`；其他谓词不变。不要展示“AI发现该商户其实是报销”的未证实结论。

### 撤销

操作文案 `Stop using this rule`。确认说明：`Future transfers will need context again. Past decisions remain available to replay.`

不使用 `Delete permanently` 或 `Forget everything`，因为本功能只停止未来使用规则，并不承诺删除已持久化blob。规则状态变成revoked，历史仍可查看。

## 5. Memory

页面回答两个问题：现在有效的规则是什么？它为什么变成这样？

顶部显示真实验证计数：`Mainnet memories verified: N`；N必须来自实际完成的记录，不是HTTP调用数、fixture条数、队列长度。没有实时证据显示 `Not verified`。在纯fixture界面显示 `Planned scenario events: 12`，不改成“12已上链”。

规则卡：自然语言范围、状态、来源事件、有效期、最后确认时间、`View history`。时间轴展示M01–M12的实际内容和类别，记忆写入回执与用户判断分开。

选中历史项可查看：

- 用户说了什么/系统当时用了什么规则。
- 当前记录取代了谁，后续被谁取代。
- 哪个已记录决定受它影响。
- 真实持久化的memory id、blob id、内容hash入口。

不要把walruscan链接当作解密明文的保证。若只能核对存储元数据，明确展示 `Storage metadata`；可读内容来自授权读取，则写清授权读取来源。

## 6. Replay

顶部说明：`Replay never changes your memories.`

页面固定一条输入，显示短 input hash 和 `View input`；左侧选择 `As of M04` / `As of M08` / `As of M12`，右侧比较两列 `Without saved context` 与 `With saved context`。两列使用同一facts和同一域引擎。

默认演示：B的12在M04。关闭记忆是Needs context；开启记忆按v1变Expense/Tools。差异体现为“需要确认”与“已引用确认规则”，不是要求关闭记忆时胡乱分类。

反例演示：固定E的25，分别在M04和M08运行；v1会应用，v2会保留未知。输入hash不得改变。M12则演示撤销后重新需要说明。

侧边信息：使用的policy ids、匹配谓词、归类依据、预算影响、engine version。不要写“AI准确率提升X%”或“节省X小时”，除非实际测量且解释样本。

Cold restore按钮仅在operator验证界面启用，启动独立进程；普通public页面显示已完成恢复报告的状态与证据入口。CLI恢复是独立验收步骤，不伪装成清浏览器缓存。

## 7. Evidence 抽屉

采用四个区块：

1. `Transaction facts`：provider、network、digest/示例ref、coin type、owner、方向、最小整数金额、状态、核验时刻。
2. `Context and rule`：用户声明、确认事件、适用谓词、rule version。
3. `Memory receipt`：真实memory/job/blob id、status、hash和实际可获得的到期信息；未知字段明确Unknown。
4. `Limits of this evidence`：一句说明用途属于用户说明、存储不证明世界事实；纯fixture持续标识。

所有外链应来自真实已验证ID构造，不拼出貌似主网交易的虚假地址。复制按钮应给可读反馈；完整JSON是高级展开项。

## 8. 错误态与浏览器验收

必须覆盖empty、loading、pending、failed、retry、unsupported、unauthorized、incomplete restore、conflicting rules、rate-limited。每个错误态都给出下一步，保留已完成数据和待处理操作id。

Dot必须实际在浏览器点击：交易行、Evidence打开/关闭、复制证据、标签选择、保存、规则提案/确认、反例纠正、收窄确认、撤销、三页导航、replay时点和memory开关。operator写操作默认用fixture adapter做功能测试；实际主网写入由单独受控验收执行。

记录375/768/1440宽度的观察、console错误和失败步骤。截图若被做成正式交付物应脱敏。仅“编译成功”不算UI完成。

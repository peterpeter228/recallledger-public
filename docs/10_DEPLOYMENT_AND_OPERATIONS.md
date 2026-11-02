# 10 · 部署、配置与评审期运行

范围：Q3 已选择 **Vercel、无数据库、recorded-live 公开视图**。本轮只准备配置并验证 localhost，不创建服务、不部署。实际公开 URL、平台运行时、费用及回滚须在 WP6b 授权后核验；本地成功不是 Vercel 部署回执。

## 1. 主路径

公开入口：Vite 静态 UI + 只读 Node API function。function 只构造无 operator/store/provider 的应用，`operatorEnabled:false`、`writesEnabled:false`；不导入 operator 启动入口 `main.ts`，不启动 outbox/timer，不注入 Tatum/Walrus/DB 凭证。`/api/*` 先于 SPA fallback，API 错误不能返回 HTML 假成功。

交互教学状态在**浏览器当前页内存**，不依赖 Vercel 实例会话黏性；刷新/关页丢失，不写 localStorage，不是 Walrus 账户或持久 operator。与服务端共用事件构造/校验和领域 reducer；pending 不能提前生效。固定输入 off/on 仍为冻结场景比较，不追加记忆。

公开存储证据只读取打包的 `evidence/mainnet-manifest.json` 与 `evidence/restore-report.json` 核验摘要；不把整个 evidence 树设为静态目录。两文件缺失、部分存在、hash/count/version/状态不匹配时返回零/未核验。有效对显示 `recorded_live` 和原始 UTC 核验时间，不表示请求时重新查询主网或当前仍可恢复。Vercel 不持有 delegate。

有数据库的 operator 保留在独立操作主机，按原始 outbox/job 和有界授权运行；不是公开 Vercel 服务。`render.yaml` 仅保留为历史候选，本轮不部署 Render，不创建其数据库。

## 2. 脚本契约

当前脚本以 package.json 为准；命令存在不等于外部验收通过：

| 命令 | 行为 | 默认是否触及外部/主网 |
|---|---|---|
| `pnpm dev` | 本地前后端，fixture模式可用 | 否 |
| `pnpm build` | 类型检查、前端和服务端构建 | 否 |
| `pnpm start` | 编译后的本地 Node 服务，显式 HOST/PORT | 按显式配置；CLEAN 环境不触及 provider |
| `pnpm db:migrate` | 版本化数据库迁移，单实例执行 | 仅目标DB |
| `pnpm doctor` | 环境与配置报告；live选项须显式 | 默认否 |
| `pnpm test:domain` | 金额、规则、事件和reducer风险测试 | 否 |
| `pnpm test:integration` | 本地DB与adapter contract | 不写主网 |
| `pnpm test:e2e` | 真实浏览器fixture/本地测试 | 不写主网 |
| `pnpm eval:fixtures` | 12事件本地 replay 和固定输入对照 | 否；不是完整32案例已通过声明 |
| `pnpm eval:ablation` | 同输入/相同时间的记忆对照 | 否 |
| `pnpm memory:seed` | 默认 dry-run，显示稳定事件及hash | 否 |
| `pnpm memory:seed -- --apply` | 经配置允许的逐事件写入/续写 | 是，必须显式 |
| `pnpm verify:offline` | typecheck、web build、tests、fixture evaluation；DB测试需显式本地 URL | 否 |
| `pnpm verify:live` | Tatum 与 Walrus inventory probe，不代表完成写入 | 只读，须另外授权凭证使用 |
| `pnpm verify-count -- --reconcile --out <path> --apply` | 原始 DB/outbox/job 与完整 inventory 对账 | 远端只读；--apply 仅本地写 |
| `pnpm memory:freeze -- --purpose teaching --reconciliation <path> --out <path>` | 重核对账，保存不可变 locator | DB/本地文件；不写链 |
| `pnpm verify-count -- --manifest <frozen-path> --out <count-path> --events-out <locators-path> --apply` | exact-set/receipt/hash/replay 独立计数 | 远端只读；省略 --apply 不写证据 |
| `pnpm verify:restore -- <frozen-path> --out <report-path> --apply` | 无 DB 投影的新进程远端恢复 | 只读；不含索引修复，不写新记忆 |
| `pnpm evidence:export` | 当前同 fixture evaluator，非完整 live evidence export | 不写外部 |

CI只执行默认离线路径。mainnet seed不能挂在`postinstall`、build、启动或健康检查里；重部署不能再次生成12条记忆。

## 3. secret与公开配置

公开 Vercel 部署**不配置任何 provider、delegate、数据库或 operator secret**。操作主机的变量名见 `templates/env.example` 和 README；专用秘密只由授权 wrapper 从受限 secret 文件注入，不写前端 `VITE_`、报告或日志。build 仅打包两个白名单证据文件的公开核验摘要，不读取秘密文件。

`MEMWAL_AGENT_PUBLIC_KEY`用于展示/提交，`MEMWAL_PRIVATE_KEY`用于签名；两者不能混淆。Tatum账户ID另在提交材料里填写，不与API key共用字段。

本地验收使用 job-local HOME/缓存和既有 PG18.1 集群，显式 localhost55432 测试连接；operator-data 保留于独立55433。当前不得访问其他服务的数据/端口。钱包 owner 签名只在单独授权流程，应用不需要 seed phrase 或资金私钥。

## 4. 初始化与权限

所有离线工作先完成。STEER.1 仅报告 Tatum 配置字段已设置、Walrus/operator 字段仍为空；本轮不读取秘密文件、不做 authenticated probe。WP6a 才集中核对专用账户、delegate、公钥、两笔既存交易、写入范围和费用授权；WP6b 才确认发布目标/账户/费用。

创建/资助钱包、注册账户或delegate的链上签名由用户按钱包显示信息确认，不能推断“准备文档”已授权转账。已有明确授权的操作不重复请求。部署或主网读写遇到平台自动审批拦截时按实际拒绝原因处理。

## 5. 发布前检验

1. 用干净checkout在锁定Node版本执行install/build/test，确保没有依赖本地未提交文件。
2. CLEAN 环境生产构建并 localhost 启动；实际点击完整12步、pending、纠正/退款、scope收窄、撤销、fixed-input off/on、明确 fixture restore；同时核对 HTML/health/evidence 精确字段。关闭临时浏览器和服务。
3. WP3 数据库套件在既有 job-local PG18.1 通过后停止 test PG；Vercel 无数据库，不自动迁移。操作主机迁移单独执行，禁止每次启动重写数据。
4. 检查 Vercel 静态/函数路由与只读证据 bundle，记录本地验证范围；实际平台配置、运行时/region/费用在授权部署时核对。
5. 只提交允许的离线变更；本轮无网络私有性查询，跳过 push。发布门通过后才使用已授权非 main 分支，记实际部署 SHA/URL/时间。
6. WP6b 在 logged-out 浏览器实际验证 Vercel correction/on-off、recorded count/hash、operator/writes disabled 和无登录墙；本地浏览器不能替代该门。
7. 检查repo、构建产物、浏览器network和日志无secret；此检验针对具体secret暴露风险，不展开为泛化安全工程。

## 6. 公开演示运行策略

公开入口明确 `Scenario: synthetic`，与 `Storage` 分开。有效 count/restore 对显示 `Storage: Mainnet verified (recorded <UTC>)`；没有有效对则0/未核验。用户操作仅在页面内教学内存，不产生主网写入。Replay 对固定 synthetic 输入和冻结规则版本做纯计算，不依赖公开访客的教学会话。

如实时依赖不可用，仍可查看**明确标为recorded**的历史证据和录像，同时把live检查显示为不可用。禁止把录制的回执时间改成当前时间，或把本地fixture升级成live。

默认不创建持续cron或“无限修复”。outbox只在存在待处理任务时工作，指数退避有上限。健康请求不得花费LLM调用或新建记忆。公开API限制仅针对固定demo输入，避免成本被任意请求放大。

## 7. 评审期保存与可用性

官方评审11/11–11/16（活动页时间叙述），结果11/17；建议演示至少运行到北京时间11/20，并在结果后保留必要材料。存储的`endEpoch/expiresAt`必须覆盖实际评审窗口；SDK done不等于永久保存。无法取得精确到期日期时保留epoch原值和未知状态，向用户报告需要确认的具体续存动作，不编造日期。

部署当天核对服务休眠、DB过期和套餐限制；不要为“全免费”牺牲评委首次访问的可用性。若必须付费，先准备具体资源/时长/费用再按当前用户授权启用。

## 8. 故障处理与回滚

| 故障 | 判断 | 处理 |
|---|---|---|
| Tatum认证失败 | 实际gRPC UNAUTHENTICATED/权限错误 | 校对secret/key范围；不无限重试 |
| SDK426 | 版本/协议兼容错误 | 固定已验证发布物；改动后重新contract smoke |
| Walrus已接job但超时 | 状态unknown/pending | 保存job继续查询，不再seed |
| hash/集合不符 | 数据完整性失败 | 禁止激活部分恢复；保留证据与上个可用投影 |
| Vercel新版本失败或证据不匹配 | health/API/recorded配对未通过 | 授权后回滚到前一已验证 deployment URL；保留 locator/历史证据，不重播主网写入 |
| DB迁移失败 | migration记录不一致 | 停止对应发布并修复，不假装应用层可自动补齐 |
| delegate撤销 | 旧密钥不能继续取得新解密授权 | 走用户钱包重新授权；已有旧明文不声称可远程收回 |

主网记忆不能靠回滚应用二进制“撤销”。业务规则修正用新事件；关停公开演示只影响服务访问，不能承诺删除所有第三方缓存或链上数据。

## 9. 交付记录

最终记录：GitHub URL、branch、源码/构建/部署 SHA、Vercel deployment URL与时间、回滚 URL、已核验的运行时与费用、manifest版本/recorded UTC时间、实际存储期限、评审维护负责人。operator DB迁移/备份另记；公开服务无 DB。离线 WP4 无部署 URL，保持未部署，不造链接。密钥值永不写入报告。

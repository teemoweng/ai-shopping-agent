# Chat-first 轻量 AI 导购设计规格

> 日期：2026-08-10  
> 状态：用户已批准进入实施  
> 范围：TikTok Shop-inspired 可购物短视频中的“问问这款”体验  
> 不改变：美国市场、K-Beauty 防晒、合成商品数据、模拟加购终点、三控制面与安全/交易边界

## 1. 问题与目标

当前 AI Commerce Sheet 虽然链路完整，但把上下文、能力披露、决策结论、三张推荐卡、证据台账、比较工具和作品集说明同时摆在用户面前。它更像一张“AI 产品能力说明板”，而不是用户在刷短视频时会自然使用的导购。

本轮目标不是继续美化旧面板，而是把前台范式改为：

> 用户从当前商品发起一个轻量问题，AI 每轮只处理一个任务；只有当用户明确需要推荐、比较或依据时，才逐步展开对应内容。

成功标准：

1. 首次打开时仍能看到视频上下文，Sheet 目标高度约为移动 viewport 的 40%–44%。
2. 首屏只有一条商品相关开场、恰好三个具体问题和自由输入框；没有完整推荐、比较表或证据台账。
3. 简单事实问题直接短答；只有确实会改变结果时才追问，且每轮最多一个问题。
4. 默认只显示一个主结论和一款首选；替代商品、比较和依据按用户动作渐进披露。
5. 关闭重开、从 PDP 返回以及同一次页面刷新后，可以通过服务端权威 session 恢复会话；API 进程重启后的持久化不在本轮承诺内。
6. 安全、无匹配、证据不足、价格变化、显式确认和未知提交对账不能因界面减重而弱化。

## 2. 已比较的三个方案

### 方案 A：自适应 Bottom Sheet + 真实短会话（采用）

- 首次打开为约 40%–44% 高度的轻量 Sheet。
- 普通问答和澄清保持紧凑；只有显式比较才展开到约 72%–74%。
- 服务端保存有上限的 session transcript，前端只渲染权威消息。
- Feed、PDP、Guide 和 Commerce 继续使用同一条真实链路。

采用理由：最符合短视频注意力分配，也避免只把状态快照“画成聊天气泡”的伪会话。

### 方案 B：只改前端，把最新状态快照投影成聊天（拒绝）

- 工程代价最低，API 不变。
- 但 GET 只能恢复最新结果，用户与 AI 的历史消息会丢失；网络重试也不能利用现有 `message_id` 去重。

拒绝理由：界面看起来像聊天，实际仍是结果面板，会在演示追问和面试追问中暴露产品逻辑不完整。

### 方案 C：点击后进入全屏、长期持久化的通用购物 Assistant（延期）

- 适合未来真实 LLM、跨内容搜索和长期偏好。
- 需要认证、数据库、TTL、删除、跨进程恢复和更完整隐私治理。

延期理由：当前用户是在一条可购物内容里判断“这款是否适合我”，全屏长期助手会丢失内容现场并扩大 MVP。

## 3. 核心体验

### 3.1 入口

可购物 Feed 的次级入口文案由“问 AI”改为“问问这款”。商品主体仍直达 PDP；普通 Feed 仍不显示商品或 AI 能力。

### 3.2 首屏

打开 Sheet 后显示：

1. 顶部拖拽提示条、紧凑商品上下文 chip 和关闭按钮；
2. 一条 AI 消息：“我看到你在看 Seoul Shade。你最想确认什么？”；
3. 三个具体问题：
   - “适合油皮吗？”
   - “会不会泛白？”
   - “和防水款比比”
4. 固定在底部的自由输入框，placeholder 为“问问这款商品…”；
5. 一处低权重披露：“AI 生成 · 合成原型”。详细能力边界通过可访问说明展开，不再在正文、页脚和桌面面板重复。

首屏不得出现“AI 决策”“已继承上下文”“基于已验证资料”“Guide revision”、推荐矩阵、claim ledger 或交易 CTA。

### 3.3 逐轮规则

系统先识别当前任务，再选择最轻的回答形式：

| 用户任务 | 默认行为 | 是否展示商品 |
|---|---|---|
| 具体事实，如“会不会泛白” | 一句结论 + 一句证据边界；可继续追问 | 否 |
| 适配问题，如“适合油皮吗” | 记录软偏好；若使用场景会改变推荐，只追问“日常通勤还是户外出汗/玩水？” | 否 |
| 完整推荐，如“帮我选一款” | 必要时问一个高信息量问题；条件足够后给一款首选 | 是，默认一款 |
| 明确比较，如“和防水款比比” | 先形成合法候选，再以当前商品和最佳防水替代品生成两款比较 | 是，两款比较 |
| 依据/为什么 | 解释当前结论的 1–2 个关键事实；来源默认折叠 | 不新增商品 |
| 医疗、严重过敏或药物问题 | 进入安全边界；隐藏商品、比较和交易动作 | 否 |

任何一轮不得用多个问题同时审问用户。简单问题不为了展示 Agent 能力而强制澄清。

### 3.4 决策消息

条件足够时，主消息只包含：

- 一句结论，例如“日常通勤更适合这款；如果会出汗或玩水，换防水款更稳妥。”
- 最多两条适配理由；
- 一条关键取舍；
- 一款紧凑首选卡：图片、名称、当前 fixture 起价、一条匹配理由、一条取舍；
- 轻操作：“为什么”“和另一款比比”“看商品”。

其他候选通过“看看其他选择”进入单一子视图，不与主结论同时展开。历史推荐卡只读，只有最新权威状态及 `allowed_actions` 可以打开商品。

### 3.5 比较

只有用户主动提出比较或点击比较动作时，Sheet 才进入 expanded 模式：

- 高度约 72%–74%，视频仍保留少量可见上下文；
- 默认比较两款，不让用户先勾选三张大卡；
- 维度只保留对当前决策有用的 3–5 项：使用场景、防水、妆效、泛白风险、起价；
- 先给一句胜负条件，再给紧凑语义化表格；
- 比较后仍可继续提问或打开商品，不把比较当不可继续的终态。

### 3.6 关闭、返回与恢复

- 关闭 Sheet：回到原视频、原滚动位置，焦点返回“问问这款”。
- AI → PDP → AI：保留同一 Guide session、transcript、Sheet 模式和滚动位置。
- 页面刷新：浏览器仅在 `sessionStorage` 保存不透明 session id，随后 GET 服务端恢复 transcript；不在浏览器持久化完整对话。
- API 进程重启：当前内存仓库会丢失 session，前端清除失效 id 并建立新会话，同时如实提示。这不是跨服务持久化。

## 4. 信息架构与视觉规则

### 4.1 Sheet 模式

| 模式 | 触发 | 高度目标 |
|---|---|---|
| `compact` | opening、普通问答、单轮澄清、短结论、no-match、evidence insufficient、safety | 40%–44% viewport；内容可内部滚动 |
| `expanded` | comparison pending、comparison ready、用户主动展开其他选择 | 72%–74% viewport |

消息数量增加不能自动把 Sheet 变成全屏。320×700 或 200% 字号等可访问性场景允许提高容器高度或内部滚动，优先保证关闭、最后一条消息和 composer 可达。

### 4.2 视觉调性

- 使用白色/浅灰内容层、黑色正文和低饱和分隔；TikTok 粉只用于发送和主要动作。
- 不使用大面积渐变、发光“AI 大脑”、仪表盘、分数、能力标签墙或多层卡框。
- AI 与用户消息采用轻量对话排版，不为每条消息增加头像和厚重气泡。
- source chip 是一行上下文，不重复展示达人 caption 和大图。
- loading 使用短状态，如“正在核对商品信息…”，不显示内部 Workflow 步骤。
- 消费者文案不出现“确定性降级”“状态对账”“硬约束”“revision”等工程语言。

## 5. 系统设计

### 5.1 控制面保持不变

- `NavigationState`：只管理 Feed / Sheet / PDP、入口来源、返回栈与焦点。
- `GuideSession`：管理会话、偏好、决策、比较、`guide_revision` 和新的 conversation transcript。
- `CommerceOperation`：管理 SKU、动态事实、`transaction_revision`、确认 token、幂等和模拟加购。

AI 仍然不能直接写购物车。任何“看商品”都进入 PDP，Commerce Workflow 重新读取价格、库存和 SKU，并要求用户显式确认。

### 5.2 两类 revision 分离

| 字段 | 增加时机 | 用途 |
|---|---|---|
| `conversation_revision` | 成功接受一条用户消息或比较动作 | 消息顺序、并发、网络恢复 |
| `guide_revision` | 约束、偏好或推荐授权发生语义变化 | 推荐来源与 Commerce provenance |

普通“为什么”追问只增加 conversation revision，不应让 PDP 交易来源失效。

### 5.3 Conversation contract

新增有上限的服务端 transcript：

- `role`: `USER | ASSISTANT`
- `kind`: `OPENING | USER_TEXT | QUESTION | ANSWER | RECOMMENDATION | COMPARISON | NO_MATCH | SAFETY | RECOVERY`
- `sequence`: 服务端单调递增序号
- `text`: 纯文本
- 可选附件：quick replies、当前只读推荐、证据或比较
- `redacted`: 安全相关原文是否被固定占位文本替代

每个 session 最多接受 12 个用户轮次。达到上限后明确提示建立新会话，不静默截断。Transcript 只用于呈现，不授权交易；顶层当前 `allowed_actions`、`guide_revision` 和当前决策快照仍是唯一业务权限。

### 5.4 消息可靠性

现有客户端 `message_id` 正式用于幂等：

1. 新请求携带 `expected_conversation_revision`。
2. 同 message id、同 payload 重试：不重复执行 Workflow，返回当前权威快照。
3. 同 message id、不同 payload：返回 `409 MESSAGE_ID_REUSED`。
4. conversation revision 过期：返回 `409 STALE_CONVERSATION`，不改变状态。
5. user message、assistant message、processed request、conversation revision、latest snapshot 和 trace 摘要在同一个 repository transaction 中提交或回滚。

比较请求同样增加 request id 与 expected conversation revision，避免响应丢失后重复追加比较。

### 5.5 隐私与 Trace

- Transcript 只存在 session repository，不写入 Git、trace、access log 或评测制品。
- Trace 继续只记录状态、工具摘要、结果 ID 和安全分类码，不记录用户原文、client message id、健康描述或隐藏思维链。
- 医疗/高风险输入在 transcript 中保存固定占位语句并标记 `redacted=true`。
- 前端只按纯文本渲染，不使用 `dangerouslySetInnerHTML`。
- 本地 Demo 无认证，不把不可猜 session id 描述为生产权限模型。

## 6. 前端组件边界

### `GuideSheet`

保留创建/恢复 session、revision 校验、过期响应失效、comparison 对账、动作冻结、modal/focus/scroll 管理和 PDP provenance；不再负责全部视觉结构。

### `GuideChatView`（新增）

纯展示组件：上下文 chip、message log、快捷问题、inline result、compact/expanded mode 和 sticky composer。它不发 API、不推导业务权限、不保存 session。

### `RecommendationCard`

增加 compact/inline 形态，只显示图片、名称、一条理由、一条取舍、依据入口和“看商品”。旧的三张完整报告卡不再进入默认主流。

### `ComparisonTable`

保留语义化 table 与结构化事实，但改成两款紧凑比较卡，只在 expanded mode 出现。

### `DemoShell`

继续负责 Feed/PDP/Overlay 和视频暂停恢复。桌面作品集说明降为次级，不与手机中的对话争夺主视觉。

## 7. 无障碍与移动端行为

- 继续使用 `role="dialog"`、`aria-modal="true"`、body scroll lock、Tab focus trap、Escape 关闭、关闭后焦点恢复和底层 `inert`。
- 消息列表使用 `role="log" aria-live="polite"`；loading 使用 `role="status"`；错误使用 `role="alert"`。
- 首次打开不自动聚焦输入框，避免移动键盘立刻遮住视频。
- composer 使用 1–3 行自增高 textarea；中文输入法 composition 期间 Enter 不发送。
- 新消息只有在用户已接近底部时才自动滚动；用户回看旧消息时不抢滚动。
- 使用 `100dvh` 与安全区 padding 处理移动键盘和底部 Home indicator。
- 快捷操作最小触控尺寸 44×44 CSS px；`prefers-reduced-motion` 下关闭位移动画。

## 8. 错误与降级呈现

| 系统状态 | 用户界面 |
|---|---|
| Tool/网络进行中 | 一条“正在核对商品信息…”状态，不复制旧决策 |
| 响应未知 | 冻结旧业务动作，使用同 message id 重试或 GET 对账；显示“正在恢复回答…” |
| `NO_MATCH` | 一条冲突说明 + 最多一个可放宽条件，不展示空商品卡 |
| `INSUFFICIENT_EVIDENCE` | 明确“已知/暂时无法确认”，依据折叠，不伪造首选 |
| `SAFE_BOUNDARY` | 安全提示；清空当前商品、比较和交易动作，历史卡只读 |
| session 失效 | 清除 sessionStorage id，提示会话已结束，并允许重新开始 |
| fatal contract/state error | 关闭业务动作，提供返回 Feed；不让前端自行修补权限 |

## 9. 测试与证据

### 9.1 TDD 门

先写失败测试，再实现：

- API contract：transcript schema、两类 revision、message/compare 幂等、stale conflict、事务回滚、隐私和安全脱敏。
- Web component：轻量首屏、恰好三个商品问题、消息顺序、渐进披露、compact/expanded、composer、无障碍和恢复。
- Commerce regression：普通追问不改变 `guide_revision`；改约束会使旧 provenance 失效；安全边界后历史推荐不能授权交易。

### 9.2 E2E 门

保留现有 8 条产品/交易旅程的网络和业务断言，只更新 UI selector。新增独立 `chat-first.spec.ts`：

1. 轻量 opening 保留视频上下文；
2. 每轮最多一个澄清问题；
3. 普通答案不出现推荐矩阵；
4. 决策默认只展开一款首选；
5. 用户主动比较后才展开 Sheet；
6. 关闭重开恢复同一 transcript；
7. AI → PDP → AI 恢复同一 transcript；
8. safety 隐藏所有商业动作；
9. 390×844、320×700、200% 字号、桌面面试态均可操作；
10. Tab、Escape、焦点返回、reduced motion 不回归。

### 9.3 正式证据

历史 `tiktok-redesign-*` 截图不覆盖。新增：

- `artifacts/screenshots/chat-first-opening-mobile.png`
- `artifacts/screenshots/chat-first-decision-mobile.png`
- `artifacts/screenshots/chat-first-desktop.png`
- `artifacts/evidence/chat-first-verification.md`
- `artifacts/evidence/chat-first-run-manifest.json`

正式截图必须来自 fresh API + production Next build、固定浏览器时间、字体 ready、视频固定帧、禁动画和真实 Chromium。结构/几何自动断言与人工视觉检查共同作为首版基线；checksum 只证明文件身份，不证明视觉正确。

## 10. 非目标

- 不接真实 LLM、向量数据库、Hybrid RAG、TikTok API、支付或真实用户数据。
- 不实现搜索 UI、长期跨内容记忆、跨 API 进程持久化或多 Agent。
- 不宣称入口发现率、信任、转化、业务增量或真实推荐质量得到验证。
- 不复刻 TikTok 官方 logo、素材或未确认的灰测功能。

## 11. 完成定义

本轮只有同时满足以下条件才可结束：

1. 首屏、短答、澄清、推荐、比较、安全、恢复均通过自动化路径；
2. conversation transcript 和 message/compare 幂等可由 API 测试复现；
3. 现有 8 条交易旅程语义未弱化；
4. production build 的三张新截图人工检查通过；
5. README、PLAN、TASKS、工程验证记录、知识层 ADR、产品日志和面试索引同步；
6. 所有“已实现/已评测”都只指向合成 fixture 与本地 Chromium 证据。

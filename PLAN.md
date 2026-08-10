# AI Shopping Agent 总路线图

> 状态：Foundation Baseline、TikTok 真实体验重设计与 Chat-first 轻量导购切片均已验证，Phase 1 的真实 LLM、Hybrid Retrieval 与数据扩展仍未完成。本文管理“先验证什么、每阶段交付什么、何时可以进入下一阶段”，不代替实施级任务拆解和测试步骤。

## 1. 项目目标与成功定义

项目要证明的不是“可以调用一个大模型”，而是三件事：

1. AI 能在内容电商上下文中缩短从种草到可信购买决定的路径；
2. Agent 的开放决策可以被 Workflow、Tools、Verifier、评测与产品界面约束；
3. 所有关键判断都能留下工程证据与产品叙事，支持 AI 产品经理岗位面试。

北极星指标为**质量门槛通过后的有效导购完成率**：只有当会话满足事实、硬约束、引用、安全和体验质量门槛，且用户完成比较、收藏或模拟加购等有效动作，才算一次有效完成。原始加购率不是北极星，避免系统靠迎合用户或强推商品获得虚假提升。

初始指标值都是设计门槛，不是已取得的结果；第一轮基线跑通后需要依据数据难度、模型价格和体验研究校准。

## 2. 阶段总览

| 阶段 | 核心问题 | 主要工件 | 进入下一阶段的出口条件 |
|---|---|---|---|
| Phase 0 — Planning / Foundation | 产品、技术、评测和留证据方式是否可执行 | 双层文档、ADR、详细计划、仓库与任务台 | 边界无冲突；事实源明确；首个纵向切片有可测试计划；未完成项均如实标记 |
| Phase 1 — Vertical Slice | 一条内容导购路径能否端到端可信运行 | 12 SPU / 36 SKU 数据、内容上下文、受控 Agent、Workflow、核心工具、模拟加购、首批评测 | 一条黄金路径和关键失败路径自动可复跑；硬约束、结构化事实和 trace 通过门槛 |
| Phase 2 — Complete MVP | 能否覆盖代表性的用户与商品差异 | 扩展数据、混合检索、比较、偏好记忆、高保真 UI、完整回归集 | 主要任务族覆盖；P0 风险为零；质量、延迟和成本达到经基线校准后的发布门槛 |
| Phase 3 — Evaluation & Optimization | 哪种模型、检索、路由和交互组合最有效 | 实验矩阵、坏例聚类、Pareto 分析、迭代报告、用户研究 | 关键优化有对照证据；回归未恶化；产品结论能区分事实、推断与局限 |
| Phase 4 — Portfolio Delivery | 如何把真实过程转成可验证的求职作品 | 部署演示、案例视频、架构图、评测报告、面试证据索引 | 第三方可独立体验；所有对外数字可追溯；演示失败时有降级方案 |

## 3. Phase 0 — Planning / Foundation

### 目标

把需求共识转成可执行契约，先锁定事实源、安全边界、证据路径和阶段出口，防止开发过程中为了“像 Agent”而无边界扩张。

### 工件

- 工程层 README、总路线、任务台、项目级 Agent 规则和实施级计划；
- 知识层项目总控、机会判断、产品定义、AI 方案、概念证据矩阵、评测策略和面试索引；
- 项目范围 ADR，以及后续产品决策、实验和评测报告模板；
- 独立 Git 仓库与项目状态登记。

### 出口条件

- 主入口、用户、首品类、交易终点、非目标和搜索后续范围均无歧义；
- Agent、Workflow、Tools、Verifier 的责任边界和失败降级已定义；
- 价格、库存、SKU、规则、评论与创作者主张各自的事实等级已定义；
- Phase 1 的代码、数据、测试与 trace 可以按实施计划逐项验收；
- 所有“planned / implemented / evaluated”状态可以被文档和文件路径核对。

## 4. Phase 1 — Vertical Slice

### 2026-08-05 已验证的 Foundation 子切片

这不是整个 Phase 1 完成标记。它只冻结了一条小而可复跑的确定性基线，用来让后续真实 LLM、Hybrid Retrieval 和数据扩展有同一对照物。

| 已验证子范围 | 证据 | 尚未覆盖的 Phase 1 目标 |
|---|---|---|
| 3 SPU / 6 SKU、1 个 `ContentContext`、3 份证据文档 | [fixtures](./data/fixtures) · [验证记录](./artifacts/evidence/foundation-verification.md) | 约 12 SPU / 36 SKU、12 个内容上下文和更丰富异常数据 |
| 确定性 Workflow、白名单 Tools、词法证据检索、硬过滤后排序 | [六案例评测](./evals/cases/foundation-cases.jsonl) · [1 条黄金 Trace / 11 条脱敏事件](./artifacts/traces/samples/foundation-golden.jsonl) | 真实 LLM Shopping Agent、生成式 Verifier、Hybrid/RRF/Reranker |
| 内容入口 → 约束 → 推荐 → 2 款比较 → SKU 预览 → 用户确认 → 模拟加购 | [移动截图](./artifacts/screenshots/foundation-mobile.png) · [E2E](./apps/web/e2e/guide.spec.ts) | 更广失败/超时旅程、搜索 UI、多模态实时输入、长期偏好 |
| 119 个 API 测试、68 个 Web 单元测试；6 个规则评分案例 6/6；2 条旅程 × 2 个 Chromium viewport = 4/4 | [Foundation verification](./artifacts/evidence/foundation-verification.md) | 正式大样本 Benchmark、真实模型质量/延迟/成本、用户研究与业务结果 |

因此当前可以声称“Foundation 子切片已实现并在冻结合成集上评测”，不能声称 Phase 1 的 12 SPU / 36 SKU 纵向切片、Agent 模型能力或整体 MVP 已完成。

### 2026-08-07 已验证的 TikTok 体验纠偏切片

这次切片不是扩大业务范围，而是纠正 Foundation “链路能跑、产品不像真实内容电商”的体验缺口。它保留 3 SPU / 6 SKU 的确定性事实底座，把页面和交易边界重构为可购物 Feed、AI Commerce Sheet、PDP 与模拟加购，并以生产构建的 Chromium 回归验证。

| 已验证子范围 | 产品结论 | 证据 |
|---|---|---|
| 普通 / 可购物 Feed 与轻量双入口 | 商业和 AI 是条件式能力；没有可信商品上下文时不展示商品或“问 AI” | [可购物 Feed](./artifacts/screenshots/tiktok-redesign-mobile.png) · [普通 Feed](./artifacts/screenshots/tiktok-redesign-normal-feed.png) |
| `NavigationState` / 可选 `GuideSession` / `CommerceOperation` | 页面返回、AI 决策、交易写入必须是三个独立控制面；Feed 直达 PDP 不依赖 AI | [产品规格](../../AI产品经理/项目实战/AI导购Agent/07-TikTok真实体验重设计规格.md) · [E2E](./apps/web/e2e/tiktok-demo.spec.ts) |
| AI → 推荐 / 替代 PDP → 返回 AI | AI 负责决策支持，PDP 负责 SKU 与当前交易事实；返回不丢已验证决策 | [桌面 AI Sheet](./artifacts/screenshots/tiktok-redesign-desktop.png) · [验证记录](./artifacts/evidence/tiktok-redesign-verification.md) |
| 价格变化与未知提交结果 | 旧事实必须失效并重新确认；写结果未知时按同一幂等键对账，禁止盲重试 | [八条旅程](./apps/web/e2e/tiktok-demo.spec.ts) · [逐旅程网络证据](./artifacts/evidence/tiktok-redesign-verification.md#eight-required-journeys) |
| 生产态响应式 Demo | 8/8 必需旅程；production E2E 28 passed / 10 intentional skips / 0 failed；PDP focus 双 project 6/6；正式图为 390×844、1440×1000、390×844 | [重设计验证记录](./artifacts/evidence/tiktok-redesign-verification.md) |

成熟度只升级为“冻结合成 fixture 上已实现并完成浏览器评测”。浏览器脚本和视觉检查不等于真人可用性研究；入口发现率、理解度、决策负担、转化增量与真实业务价值仍待验证。真实 LLM Shopping Agent、Hybrid RAG、TikTok API、支付和生产可观测也不因 UI 完成而提前升级。

### 2026-08-10 已验证的 Chat-first 轻量导购切片

这次切片不扩大品类、数据或交易终点，而是把默认 65%–75% 的重型决策 Sheet 改为保留视频上下文的渐进式会话。它继续使用 `NavigationState`、可选 `GuideSession` 与 `CommerceOperation` 三控制面，不让 transcript 或历史推荐获得交易权限。

| 已验证子范围 | 产品结论 | 证据 |
|---|---|---|
| 约 40% 高度开场、3 个具体问题、自由输入 | 用户先处理一个当前商品问题；短答与澄清不为了展示能力而提前铺开推荐、比较或证据台账 | [开场截图](./artifacts/screenshots/chat-first-opening-mobile.png) · [Chat-first E2E](./apps/web/e2e/chat-first.spec.ts) |
| 单问题澄清、默认一款首选、显式比较后展开 | 信息量与界面重量随任务增加，比较仍可继续对话，不把一次结果做成终态报告 | [结论截图](./artifacts/screenshots/chat-first-decision-mobile.png) · [验证记录](./artifacts/evidence/chat-first-verification.md#chat-first-browser-journeys) |
| 服务端有界 transcript 与双 revision | `conversation_revision` 约束消息顺序/恢复；`guide_revision` 只表达偏好、约束或推荐授权语义变化；历史消息只读 | [machine manifest](./artifacts/evidence/chat-first-run-manifest.json) · API/Web 回归 |
| 关闭重开、AI → PDP → AI、比较恢复 | 浏览器只保存不透明 session id，UI 从服务端权威 snapshot 恢复，不在客户端伪造聊天历史 | [Chat-first E2E](./apps/web/e2e/chat-first.spec.ts) |
| 安全与原交易链不因减重而弱化 | 安全态移除商业动作；PDP 继续重查 SKU/价格/库存并要求显式确认；价格变化与未知提交仍走 revision/幂等闭环 | [8 条保留交易旅程](./artifacts/evidence/chat-first-verification.md#existing-commerce-journeys-preserved) |
| 当前 release gate | API 318、Web 280、Foundation eval pytest 15/15、规则 runner 6/6；普通 E2E 39 passed / 31 routed skips，production capture 42 passed / 28 routed skips | [验证记录](./artifacts/evidence/chat-first-verification.md) |

成熟度仍是“冻结合成 fixture 上已实现并在本地 Chromium 评测”。API 进程重启后的持久化、认证、真实 LLM/Hybrid、跨浏览器、真人理解、延迟成本、转化与生产可靠性没有因本切片完成而升级。

### 要验证的产品假设

当系统继承短视频与商品上下文，并只追问一个最能改变决策的问题时，用户可以更快理解当前商品是否适合自己；当不适合时，系统能够在不违反硬约束的前提下给出有证据的替代方案并完成模拟加购。

### 最小范围

- 约 12 个 SPU、36 个 SKU、12 个内容上下文和约 60 个代表性场景；
- 一个移动端内容流页面、一个 AI 底部抽屉、决策卡、比较卡和模拟购物车；
- 离线生成的 `ContentContext`，包括时间戳字幕、关键帧 OCR、商品识别与创作者主张；
- 一套受控 Shopping Agent、确定性状态机、工具白名单和输出 Verifier；
- 结构化商品事实、最小证据库、混合检索、硬过滤与有解释的排序；
- session 级偏好、完整 trace、组件测试和首批端到端回归。
- 搜索扩展契约：API 接受 `entry_point = content | search` 和 `search_query`，会话状态可保留派生的 `query_intent = exploratory | exact`；本阶段只做契约与测试，不做搜索 UI、查询改写或搜索排序。

### 关键出口门槛

- 冻结测试集内的价格、库存与 SKU 必须 100% 来自结构化事实，无法确认时拒绝编造；
- 严重安全违规、未授权工具调用和严重硬约束违规为 0；
- 内容进入到模拟加购的黄金路径可一键复跑，信息不足、无候选、库存失效和工具超时有确定性降级；
- 每个会话可以还原状态迁移、工具参数、候选排除、证据引用、Verifier 与用户操作；
- 内容与搜索入口契约测试通过，且搜索请求不会误走内容上下文或被当作已实现的搜索体验；
- UI 在移动端完成核心路径，桌面演示模式不破坏交互和可读性。

## 5. Phase 2 — Complete MVP

### 扩展范围

- 目标规模约 60 SPU、180 SKU、12 个虚构品牌、60 个内容上下文和 600 条带标签的合成评论；
- 300–400 条单轮任务、约 160 条多轮任务、约 120 条安全 / 注入 / 陈旧事实 / 异常任务；
- 约束修改、引用回指、候选比较、用户主动追问、偏好查看 / 修改 / 删除；
- 词法 + 向量 + RRF 的混合检索，可选 reranker、证据充分度与候选多样性；
- 复用已验证的高保真内容电商容器，补齐更大数据集、真实模型下的完整空态、加载态、错误态与降级态；
- 可替换的模型适配层、缓存、并行安全工具和成本 / 延迟预算。

### 设计目标（需经首轮基线校准）

- 总体结构化事实正确率不低于 98%，P0 事实保持 100% 或拒答；
- 严重安全、未授权工具与严重硬约束违规为 0；
- 引用准确率 / 覆盖率目标不低于 97% / 95%；
- `Recall@10` 目标不低于 0.95，`NDCG@5` 目标不低于 0.80；
- 端到端任务通过率目标不低于 85%，应澄清 / 不应澄清判断目标不低于 90%；
- 首个可感知状态目标不高于 0.5 秒，完整答复 P95 目标不高于 5 秒；
- 单次有效导购平均模型成本初始目标不高于 0.05 美元、P95 不高于 0.15 美元，待模型选型和价格实测后调整。

## 6. Phase 3 — Evaluation & Optimization

### 实验主线

1. **编排选择**：自定义循环、OpenAI Agents SDK、LangGraph 在相同场景上的可控性、可观测性、开发成本与延迟；
2. **模型路由**：单一大模型、小模型 + 大模型路由、置信度升级三种策略的质量 / 成本 / 延迟前沿；
3. **检索策略**：结构化过滤、BM25、向量、RRF、reranker 与上下文长度的消融；
4. **澄清策略**：固定问题、信息增益问题和用户可跳过设计对完成质量与流失的影响；
5. **界面表达**：长对话、结构化决策卡、证据折叠层与降级模板的可理解性。

### 评测纪律

- 数据按商品、品牌和场景切分，不随机切消息，减少答案泄漏；
- 确定性事实和工具行为用规则评分，主观解释再使用经人类校准的 LLM Judge；
- P0/P1 坏例先定性归因，再进入版本化回归集；
- 每项优化保存基线、变量、样本、结果、置信范围、失败例和产品结论；
- 没有真实流量时只称为离线评测或可用性研究，不包装成线上 A/B 实验。

### 出口条件

- 至少完成 Agent 编排、检索和模型路由三类有对照实验；
- 可以解释最终方案相对于替代方案的收益、代价和不确定性；
- 质量提升没有通过放宽硬约束、隐藏拒答或增加不可接受延迟取得；
- 评测报告与面试证据索引可以追溯到版本化数据、配置和原始结果。

## 7. Phase 4 — Portfolio Delivery

### 交付包

- 可公开访问的响应式演示与稳定的本地备用演示；
- 2–3 条黄金路径、2 条失败 / 降级路径和一条搜索未来态的讲解脚本；
- 产品故事、用户问题、北极星、架构边界、核心取舍、评测方法、坏例迭代和结果局限；
- 去敏后的合成数据说明、系统卡、评测摘要和可复现命令；
- 面试问题到 ADR、实验、trace、截图与指标的证据索引。

### 出口条件

- 新用户无需开发者陪同即可完成一次内容导购；
- 所有演示中的事实、数字和“提升”均能跳转到证据；
- 页面明确标识概念原型、合成商品与非官方关系；
- 断网、模型失败或部署异常时仍有可讲解的录屏 / 固定回放，不伪装成实时结果。

## 8. 搜索后续路线

搜索从第一天在数据契约和 Workflow 入口层预留，但在内容纵向切片稳定后才实现：

1. **Exploratory Search**：用户表达模糊目标，例如“适合深肤色、妆前不搓泥、40 美元以内的防晒”，从 `UNDERSTAND` 状态进入同一受控导购链路；
2. **Exact Search**：品牌名或 SKU 精确查询优先使用传统搜索，AI 只在需要解释、比较或约束判断时介入；
3. **Cross-entry Continuity**：搜索结果可进入内容页，内容页也可带上下文继续搜索，并共用用户授权偏好；
4. **未来探索**：图片 / 包装识别、完整 routine 组合和直播辅助均需单独定义风险与评测，不能直接扩大 MVP。

搜索发布前需要新增入口识别、检索查询改写、零结果恢复、搜索与推荐公平性、入口增量价值等评测，不能只复用内容入口通过率。

## 9. 跨阶段风险与缓解

| 风险 | 影响 | 计划中的缓解 |
|---|---|---|
| 合成数据过于干净 | 指标虚高，无法代表真实场景 | 注入别名、口语、OCR / ASR 噪声、冲突评论、缺失字段与陈旧事实；按场景切分 |
| 护肤建议越过医疗边界 | 用户安全和合规风险 | 明确非诊断边界、风险词路由、规则拒答、公开规则证据与安全回归集 |
| LLM 编造价格或库存 | 直接损害交易信任 | 结构化事实唯一源、schema 校验、Verifier、超时拒答和加购前二次确认 |
| Agent 自由度过高 | 难复现、难评测、延迟失控 | 单 Agent + 状态机 + 白名单工具 + 调用预算 + 结构化 trace |
| UI 只像聊天机器人或 AI 报告板 | 无法体现内容现场，或用信息密度压垮短视频注意力 | 已完成真实体验纠偏、8 条交易旅程与 Chat-first 渐进披露浏览器契约；下一步用真人任务验证入口发现、理解和摩擦 |
| 过度模仿 TikTok | 品牌混淆或资产侵权 | 只借鉴交互范式，使用自有视觉资产与概念原型声明 |
| 只追求离线分数 | 产品价值与体验脱节 | 质量门槛后的有效完成率、任务漏斗和可用性研究共同判断 |
| 评测 Judge 偏差 | 错误优化方向 | 规则评分优先；LLM Judge 先与人工标注校准并持续抽检 |
| 成本或延迟超预算 | 演示不稳定，方案不可规模化 | 缓存、并行工具、上下文裁剪、模型路由、固定降级模板和 Pareto 评估 |

## 10. 关键依赖与决策点

| 依赖 / 决策 | 最晚锁定阶段 | 决策证据 |
|---|---|---|
| 商品、SKU、内容和规则 schema | Phase 1 开发前 | schema 测试 + 数据样例 + ADR |
| Agent 编排方式 | Phase 1 最小 spike 后 | 同场景实现与质量 / 延迟 / 可观测性对比 |
| 基础模型与 embedding | Phase 1 基线前 | 冻结样本上的质量 / 成本 / 延迟基线 |
| 公开美国规则来源与版本策略 | Phase 1 数据构建前 | 来源清单、抓取日期、版本与引用校验 |
| 评测数据切分与严重度规则 | Phase 1 基线前 | 数据卡、标注指南与抽样复核 |
| 部署平台与可观测服务 | Phase 2 尾段 | 免费额度、隐私、冷启动、日志保留与演示稳定性对比 |
| 用户研究对象与脚本 | Phase 3 前 | 招募标准、场景任务、观察表与同意说明 |

## 11. 文档与事实源边界

- “为什么、为谁、取舍、指标与面试表达”由 [知识控制室](../../AI产品经理/项目实战/AI导购Agent/00-项目总控.md) 维护；
- “代码实际行为、schema、合成数据、prompt、trace 与原始评测结果”由本仓库和 Git 历史维护；
- 当前执行状态由 [TASKS.md](./TASKS.md) 维护；
- Chat-first 当前运行事实以 [Chat-first 验证记录](./artifacts/evidence/chat-first-verification.md) 与 [machine manifest](./artifacts/evidence/chat-first-run-manifest.json) 为准；TikTok 体验纠偏历史事实仍以 [重设计验证记录](./artifacts/evidence/tiktok-redesign-verification.md) 为准；Foundation 历史基线仍以 [Foundation verification](./artifacts/evidence/foundation-verification.md) 与 source commit `cd18147f7eb1e309aa6043a1262a28f0c4349b4d` 为准，三者不互相覆盖；
- 大体积原始运行产物可留在本地或外部制品存储，但仓库必须提交可复现 manifest、版本/配置指针、校验和、汇总结果和脱敏代表样本；
- 任何决策只有在实现、测试或评测证据存在后，才可以从“已设计”升级为“已实现”或“已评测”。

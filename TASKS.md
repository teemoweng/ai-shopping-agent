# AI Shopping Agent 任务台

> 当前阶段：Phase 1 — Chat-first 轻量 AI 导购工程切片已验证；Vibe Coding 作品集案例页已交付；真实 LLM / Hybrid / 数据扩展未完成
>
> 最后更新：2026-08-11
> 本文件只反映可核验的真实状态；规划目标不等于已实现结果。

## 已完成 — 公网作品集发布

| 状态 | 工作包 | 用户结果 | 已验证证据 |
|---|---|---|---|
| ✅ DONE | 发布可分享的案例页与可交互 Demo | 读者可从公开案例页查看完整证据并一键进入同站 Demo；前端与 API 均为 HTTPS，合成数据与进程内会话限制保持可见 | [案例页](https://ai-shopping-agent.vercel.app/case-study) · [Demo](https://ai-shopping-agent.vercel.app) · [API health](https://ai-shopping-agent-api.vercel.app/api/v1/health) · [GitHub](https://github.com/teemoweng/ai-shopping-agent) · [发布验证](./artifacts/evidence/public-deployment-verification.md) · [桌面截图](./artifacts/screenshots/public-case-study-desktop.png) · [移动截图](./artifacts/screenshots/public-demo-mobile.png) |

## 状态图例

- ✅ `DONE`：工件存在且完成当前阶段要求，可通过对应路径核验
- 🚧 `IN PROGRESS`：正在产出，尚未满足出口条件
- ⏭️ `NEXT`：已定义且是下一批工作，但尚未开始
- 🧊 `LATER`：确认保留，当前阶段不实施
- ⛔ `BLOCKED`：存在明确外部依赖；必须同时写明解除条件

## 已完成 — Phase 0 控制面

| 状态 | 任务 | 完成定义 | 证据 |
|---|---|---|---|
| ✅ DONE | 锁定 MVP 产品范围 | 市场、品类、入口、用户、交易终点、非目标与搜索后续无歧义 | [README — MVP 定义](./README.md#mvp-定义) |
| ✅ DONE | 建立工程控制文档 | README、总路线、任务台、项目 Agent 契约、gitignore 均存在且互相一致 | [README](./README.md) · [PLAN](./PLAN.md) · [TASKS](./TASKS.md) · [AGENTS](./AGENTS.md) · [.gitignore](./.gitignore) |
| ✅ DONE | 完成知识控制室与双向索引 | 产品、AI 方案、概念证据、评测和面试索引齐全；两层链接可达 | [知识控制室](../../AI产品经理/项目实战/AI导购Agent/00-项目总控.md) |
| ✅ DONE | 完成首个实施级计划 | 文件、接口、测试、命令、预期结果和提交边界可逐项执行，无占位符 | [Foundation 实施计划](./docs/superpowers/plans/2026-08-04-mvp-foundation.md) |
| ✅ DONE | 初始化独立 Git 仓库 | 当前目录已具备独立 `.git`、`main` 分支和可核验的初始文档提交 | `.git/`、`git branch --show-current` 与 `git log --oneline` |
| ⏭️ NEXT | 建立真实 Agent 编排 ADR / spike | 自定义循环、OpenAI Agents SDK、LangGraph 使用同一最小场景与同一评分表 | 尚未开始；不能用当前确定性 Workflow 代替该证据 |

## 已验证 — Foundation 子切片

以下条目只关闭有代码、自动化测试与发布证据支持的窄范围，不等于整个 Phase 1 完成。

| 状态 | 工作包 | 必须产生的可验证证据 |
|---|---|---|
| ✅ DONE | 工程骨架与本地启动/测试链路 | [Foundation verification](./artifacts/evidence/foundation-verification.md) |
| ✅ DONE | 领域 schema 与小型 fixture baseline | 3 SPU / 6 SKU、1 `ContentContext`、3 份证据；[fixtures](./data/fixtures) 与 API/组件测试 |
| ✅ DONE | 搜索扩展契约（只预留） | `entry_point = content \| search` 与保留错误 `SEARCH_EXECUTION_NOT_AVAILABLE`；不含搜索执行/UI |
| ✅ DONE | 确定性 Workflow 与白名单 Tools 基线 | 状态迁移、`retrieve_evidence` / `search_eligible_products` Tool trace、固定安全边界 |
| ✅ DONE | 词法证据检索、硬过滤后排序与零候选 | [六案例规则评测](./evals/cases/foundation-cases.jsonl)；Hybrid/Vector/Reranker 不在此完成项内 |
| ✅ DONE | 内容电商移动端纵向切片 | [移动截图](./artifacts/screenshots/foundation-mobile.png)；2 条旅程 × 2 个 Chromium viewport = 4/4 |
| ✅ DONE | SKU 预览、显式确认与模拟加购 | 价格/库存二次确认、单次 token、终态 decision receipt 与 API/UI/E2E 回归 |
| ✅ DONE | 脱敏 Trace 与 Foundation eval | [1 条黄金 Trace，共 11 条脱敏事件记录](./artifacts/traces/samples/foundation-golden.jsonl)；6 个冻结案例规则评分 6/6 |

## 已验证 — TikTok 真实体验重设计 Demo

| 状态 | 工作包 | 用户结果 | 已验证证据 |
|---|---|---|---|
| ✅ DONE | 中文 TikTok Shop-inspired Feed、AI Commerce Sheet、PDP 与模拟加购重设计 | 普通内容不出现商业/AI 入口；可购物内容可直接看商品或问 AI；AI 推荐可进入 PDP 并返回原决策；价格变化和未知提交均有可恢复闭环 | [实施计划](./docs/superpowers/plans/2026-08-05-tiktok-experience-redesign.md) · [重设计验证记录](./artifacts/evidence/tiktok-redesign-verification.md) · [8 条 E2E](./apps/web/e2e/tiktok-demo.spec.ts) · [移动截图](./artifacts/screenshots/tiktok-redesign-mobile.png) · [桌面截图](./artifacts/screenshots/tiktok-redesign-desktop.png) · [普通 Feed](./artifacts/screenshots/tiktok-redesign-normal-feed.png) |

本工作包是 Foundation 的高保真纠偏切片，不等于 Phase 2 完整 MVP。当前结论是“冻结合成 fixture 上已实现并在 production Chromium 验证”：8/8 必需旅程通过，production E2E 为 28 passed / 10 intentional skips / 0 failed，PDP focus 双 project 6/6，API 234、Web 193、Foundation eval pytest 14/14、规则 runner 6/6。搜索、LIVE、真实 LLM、Hybrid RAG、TikTok API、真实支付、店铺/客服/完整购物车页面仍不在当前范围；浏览器自动化也不是用户研究或业务效果。

## 已验证 — Chat-first 轻量导购迭代

| 状态 | 工作包 | 用户结果 | 已验证证据 |
|---|---|---|---|
| ✅ DONE | 把重型 AI 决策 Sheet 改为保留视频上下文的渐进式会话 | 点击“问问这款”后先看到约 40% 高度的轻量对话层；系统以一句商品相关开场、3 个具体问题和自由输入承接，每轮最多一个澄清问题；结论、商品、比较与依据按需出现；关闭重开和 PDP 往返从服务端恢复同一会话 | [设计规格](./docs/superpowers/specs/2026-08-10-chat-first-lightweight-guide-design.md) · [实施计划](./docs/superpowers/plans/2026-08-10-chat-first-lightweight-guide.md) · [验证记录](./artifacts/evidence/chat-first-verification.md) · [machine manifest](./artifacts/evidence/chat-first-run-manifest.json) · [Chat-first E2E](./apps/web/e2e/chat-first.spec.ts) · [移动开场](./artifacts/screenshots/chat-first-opening-mobile.png) · [移动结论](./artifacts/screenshots/chat-first-decision-mobile.png) · [桌面面试态](./artifacts/screenshots/chat-first-desktop.png) |

本切片在 source commit `659596537efe7bd7a879aeb3b49bee17b01f5e73` 的冻结合成 fixture 上验证：API 324、Web 281、Foundation eval pytest 15/15、规则 runner 6/6；普通 E2E 39 passed / 31 intentional routed skips / 0 failed，production capture 42 passed / 28 routed skips / 0 failed。Task 11 已关闭 Safety 输入框、legacy cart 旧授权、推荐授权 revision、结论先于卡片、中文适合点/取舍、重复原型披露与真实 200% Guide 字体问题。首轮全量 API 在 `0228819…` 因旧 trace 测试绕过 `GuideService`、没有保存当前 snapshot 而停于 323/1；测试改走真实公开编排后的第二轮完整 gate 才是最终证据，失败历史未被抹去。`NavigationState` / `GuideSession` / `CommerceOperation` 三控制面、硬约束先过滤、证据不足降级、安全退出、交易事实复核、显式确认和幂等对账均保留。真实 iOS 非零 safe-area、拖拽交互与开场留白仍未关闭；这里的 `DONE` 不代表真实 LLM、Hybrid RAG、持久化、用户研究或业务结果完成。

## 已交付 — AI 导购产品案例页

| 状态 | 工作包 | 用户结果 | 已验证证据 |
|---|---|---|---|
| ✅ DONE | 交付 AI 导购产品案例页 | 读者可在一个响应式 HTML 页面中理解用户问题、产品定义、PRD、关键设计、原型评测与 Vibe Coding 构建方式，并可一键进入本地或公网 Demo；页面明确区分工程回归与尚未开展的真人/业务验证 | [本地案例页](./vibe-coding-case-study.html) · [公网案例页](https://ai-shopping-agent.vercel.app/case-study) · [Chat-first 验证记录](./artifacts/evidence/chat-first-verification.md) |
| ✅ DONE | 为关键证据增加离线完整文档阅读器 | 读者点击证据卡后，可在带遮罩的居中 Document Reader Modal 中阅读六份完整富文本文件；直接双击 HTML 的 `file://` 场景同样可用；目录、原文件、哈希、Escape、遮罩关闭和焦点返回均可核验 | [阅读器设计规格](./docs/superpowers/specs/2026-08-11-offline-evidence-document-reader-design.md) · [验证记录](./artifacts/evidence/case-study-evidence-reader-verification.md) · [桌面截图](./artifacts/screenshots/case-study-evidence-desktop.png) · [390×844](./artifacts/screenshots/case-study-evidence-mobile.png) · [320×700](./artifacts/screenshots/case-study-evidence-mobile-compact.png) |

该完成项与上方公网发布共同证明案例页和原型可公开访问；不代表讲解录屏、真实 LLM、用户研究或业务效果已经完成。

## Next — Phase 1 扩展（均未开始）

| 状态 | 工作包 | 当前缺口 / 进入条件 |
|---|---|---|
| ⏭️ NEXT | 真实 LLM Shopping Agent 与生成式 Verifier | 先做模型/编排 ADR，在同一回归上证明相对确定性基线的新增价值 |
| ⏭️ NEXT | 扩展到约 12 SPU / 36 SKU 与 12 个 `ContentContext` | 当前仅 3 / 6 / 1；需补别名、缺失、冲突、过期与低置信样例 |
| ⏭️ NEXT | Hybrid Retrieval | BM25 + Vector + RRF、可选 Reranker、索引版本与 Recall/NDCG/引用消融 |
| ⏭️ NEXT | 搜索 UI 与搜索执行 | 当前只保留请求契约和 501；需独立搜索任务与专项评测 |
| ⏭️ NEXT | 实时/准实时多模态输入 | 当前 `ContentContext` 为离线 fixture，不含真实 ASR/OCR/视频模型调用 |
| ⏭️ NEXT | 授权偏好 Memory | 当前只有 session 状态；需查看/修改/删除与敏感信息禁止持久化 |
| ⏭️ NEXT | 模型质量、延迟与成本基线 | 当前 `duration_ms` 只是本地 trace 字段；未测 Token、P50/P95、缓存或单位成本 |
| ⏭️ NEXT | 场景化用户研究 | 浏览器自动化不是用户研究；需经单独批准的招募、任务、观察和结论 |

## Later

| 状态 | 阶段 | 范围 |
|---|---|---|
| 🧊 LATER | Phase 2 | 约 60 SPU / 180 SKU、扩展场景、混合检索、长期授权偏好、高保真完整 MVP |
| 🧊 LATER | Phase 3 | 编排、检索、模型路由和澄清策略的对照实验；坏例聚类与用户研究 |
| 🧊 LATER | Phase 4 剩余项 | 演示录屏、真实任务型用户研究与面试证据包维护；公网演示与作品集叙事已完成 |
| 🧊 LATER | Search expansion | 自然语言探索式搜索、精确搜索分流、跨入口连续性和专项评测 |
| 🧊 LATER | Beyond MVP | 图片 / 包装识别、完整护肤 routine、直播辅助和更多品类；每项需重新立项 |

## Definition of Done

任何代码或产品能力只有同时满足以下条件，才可以在本任务台标记为 `DONE`：

1. **用户结果成立**：完成定义描述的是用户可感知结果，而不是“写了一个函数”；
2. **实现可运行**：相关代码、配置、schema 或页面确实存在，没有隐藏占位符；
3. **测试可复跑**：包含正常路径、边界条件与关键失败路径，并记录实际通过的命令；
4. **事实可追溯**：价格、库存、SKU、规则与证据能回到版本化来源；
5. **Agent 可审计**：状态迁移、工具参数、候选排除、Verifier 和降级可以通过 trace 还原；
6. **产品文档同步**：产品取舍、指标或能力边界变化已更新知识层或 ADR；
7. **结果不夸大**：离线、合成、人工研究和线上指标被明确区分，规划门槛不写成实测结果；
8. **证据可点击**：任务条目指向对应测试、报告、截图、trace 或提交，而不是只写“已完成”。

## 证据地图

| 要核验什么 | 当前权威入口 | 当前成熟度 |
|---|---|---|
| 产品范围与对外说明 | [README.md](./README.md) | 已设计 |
| 阶段与出口条件 | [PLAN.md](./PLAN.md) | 已设计 |
| 当前执行状态 | [TASKS.md](./TASKS.md) | 已建立，持续更新 |
| 产品判断与面试叙事 | [知识控制室](../../AI产品经理/项目实战/AI导购Agent/00-项目总控.md) | 已设计，持续更新 |
| 实施级代码 / 测试计划 | [Foundation 实施计划](./docs/superpowers/plans/2026-08-04-mvp-foundation.md) | Foundation 子切片已执行；后续阶段未执行 |
| 代码、schema、数据、trace | [README](./README.md) · [脱敏 Trace](./artifacts/traces/samples/foundation-golden.jsonl) | Foundation 子切片已评测 |
| 自动评测结果 | [Foundation verification](./artifacts/evidence/foundation-verification.md) · [六案例](./evals/cases/foundation-cases.jsonl) | 6 个确定性 fixture 案例已评测 |
| TikTok 体验纠偏与三控制面 | [重设计验证记录](./artifacts/evidence/tiktok-redesign-verification.md) · [产品 E2E](./apps/web/e2e/tiktok-demo.spec.ts) | 8 条必需旅程在冻结合成 fixture 上已评测；真实 LLM / 用户价值未评测 |
| Chat-first 轻量会话与渐进披露 | [Chat-first 验证记录](./artifacts/evidence/chat-first-verification.md) · [machine manifest](./artifacts/evidence/chat-first-run-manifest.json) · [Chat-first E2E](./apps/web/e2e/chat-first.spec.ts) | 13 条会话/响应式契约与 8 条原交易旅程在本地 Chromium 通过；真人理解/转化/生产可靠性未评测 |
| 正式浏览器画面 | [Chat-first 移动开场](./artifacts/screenshots/chat-first-opening-mobile.png) · [移动结论](./artifacts/screenshots/chat-first-decision-mobile.png) · [桌面面试态](./artifacts/screenshots/chat-first-desktop.png) · [历史重设计 Feed](./artifacts/screenshots/tiktok-redesign-mobile.png) | Production Chromium 已视觉检查；历史图片未覆盖；不是跨浏览器认证或真人研究 |
| 公网部署 | [发布验证](./artifacts/evidence/public-deployment-verification.md) · [案例页](https://ai-shopping-agent.vercel.app/case-study) · [Demo](https://ai-shopping-agent.vercel.app) · [GitHub](https://github.com/teemoweng/ai-shopping-agent) | 已发布并完成线上 Chromium 主路径验收；进程内状态不是生产级持久化 |
| 用户研究 | 尚无 | 未开始；浏览器自动化不作为真人研究或业务效果 |

## 更新规则

- 开始任务：把状态从 `NEXT` 改为 `IN PROGRESS`，补负责人 / 会话和预期证据；
- 完成任务：先运行验证，再补证据链接，最后改为 `DONE`；
- 发现坏例：先记录严重度、复现输入和归因，再决定进入当前修复或回归集；
- 变更范围：同步更新 [PLAN.md](./PLAN.md) 和知识层决策记录，不在任务台偷偷改变产品目标；
- 阶段切换：检查该阶段全部出口条件，未满足的条目不能靠文字解释跳过。

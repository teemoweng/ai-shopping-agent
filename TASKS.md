# AI Shopping Agent 任务台

> 当前阶段：Phase 1 — Foundation 子切片已验证；Vertical Slice 扩展未完成
>
> 最后更新：2026-08-05
> 本文件只反映可核验的真实状态；规划目标不等于已实现结果。

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
| ✅ DONE | 脱敏 Trace 与 Foundation eval | [11 条黄金 Trace 样本](./artifacts/traces/samples/foundation-golden.jsonl)；6 个冻结案例规则评分 6/6 |

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
| 🧊 LATER | Phase 4 | 公网演示、作品集叙事、演示录屏、架构与评测报告、面试证据包 |
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
| 部署与用户研究 | 尚无 | 未开始 |

## 更新规则

- 开始任务：把状态从 `NEXT` 改为 `IN PROGRESS`，补负责人 / 会话和预期证据；
- 完成任务：先运行验证，再补证据链接，最后改为 `DONE`；
- 发现坏例：先记录严重度、复现输入和归因，再决定进入当前修复或回归集；
- 变更范围：同步更新 [PLAN.md](./PLAN.md) 和知识层决策记录，不在任务台偷偷改变产品目标；
- 阶段切换：检查该阶段全部出口条件，未满足的条目不能靠文字解释跳过。

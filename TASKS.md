# AI Shopping Agent 任务台

> 当前阶段：Phase 0 — Planning / Foundation
>
> 最后更新：2026-08-04
> 本文件只反映可核验的真实状态；规划目标不等于已实现结果。

## 状态图例

- ✅ `DONE`：工件存在且完成当前阶段要求，可通过对应路径核验
- 🚧 `IN PROGRESS`：正在产出，尚未满足出口条件
- ⏭️ `NEXT`：已定义且是下一批工作，但尚未开始
- 🧊 `LATER`：确认保留，当前阶段不实施
- ⛔ `BLOCKED`：存在明确外部依赖；必须同时写明解除条件

## Now — Phase 0

| 状态 | 任务 | 完成定义 | 证据 |
|---|---|---|---|
| ✅ DONE | 锁定 MVP 产品范围 | 市场、品类、入口、用户、交易终点、非目标与搜索后续无歧义 | [README — MVP 定义](./README.md#mvp-定义) |
| ✅ DONE | 建立工程控制文档 | README、总路线、任务台、项目 Agent 契约、gitignore 均存在且互相一致 | [README](./README.md) · [PLAN](./PLAN.md) · [TASKS](./TASKS.md) · [AGENTS](./AGENTS.md) · [.gitignore](./.gitignore) |
| ✅ DONE | 完成知识控制室与双向索引 | 产品、AI 方案、概念证据、评测和面试索引齐全；两层链接可达 | [知识控制室](../../AI产品经理/项目实战/AI导购Agent/00-项目总控.md) |
| ✅ DONE | 完成首个实施级计划 | 文件、接口、测试、命令、预期结果和提交边界可逐项执行，无占位符 | [Foundation 实施计划](./docs/superpowers/plans/2026-08-04-mvp-foundation.md) |
| 🚧 IN PROGRESS | 初始化独立 Git 仓库 | 当前目录已具备独立 `.git` 和 `main`；待初始文档提交后完成 | `.git/`、`git branch --show-current` 与待生成的 `git log` |
| ⏭️ NEXT | 建立首个技术 ADR / spike 任务 | 自定义循环、OpenAI Agents SDK、LangGraph 使用同一最小场景与同一评分表 | 计划新增 `docs/decisions/` 与 `experiments/` 证据 |

## Next — Phase 1 Vertical Slice

以下任务只有在实施级计划通过检查后开始；当前均未实现。

| 状态 | 工作包 | 必须产生的可验证证据 |
|---|---|---|
| ⏭️ NEXT | 工程骨架与本地一键启动 | 前后端健康检查、环境示例、经过验证的 README 命令、CI 基线 |
| ⏭️ NEXT | 领域 schema 与 12 SPU / 36 SKU 种子数据 | schema、种子脚本、完整性 / 约束测试、数据卡和版本号 |
| ⏭️ NEXT | 搜索扩展契约（只预留） | `entry_point = content \| search`、`search_query` 与派生 `query_intent` 的 contract test；不含搜索 UI / 排序 |
| ⏭️ NEXT | 12 个离线 `ContentContext` | 时间戳字幕、OCR、商品识别、主张标签、置信度与低置信度样例 |
| ⏭️ NEXT | 确定性 Workflow | 状态迁移表、非法迁移测试、最大轮次 / 超时 / 取消测试 |
| ⏭️ NEXT | Shopping Agent 与白名单 Tools | 结构化工具 schema、路由测试、未授权调用拒绝、调用预算 trace |
| ⏭️ NEXT | 商品事实、证据检索与硬过滤 | 结构化事实测试、检索基线、硬约束零违规测试、零候选解释 |
| ⏭️ NEXT | Verifier 与安全降级 | 事实 / 引用 / 安全 / schema 校验、拒答与模板降级回归 |
| ⏭️ NEXT | TikTok 风格移动端纵向切片 | 视觉基线截图、移动 / 桌面 Playwright 路径、加载 / 错误 / 空态 |
| ⏭️ NEXT | SKU 确认与模拟加购 | 预览、用户确认、库存二次校验、幂等加购与购物车反馈测试 |
| ⏭️ NEXT | Trace 与首批端到端评测 | trace schema、黄金 / 失败路径、P0/P1 回归报告和已知局限 |

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
| 实施级代码 / 测试计划 | [Foundation 实施计划](./docs/superpowers/plans/2026-08-04-mvp-foundation.md) | 已建立，未执行 |
| 代码、schema、数据、trace | 尚无 | 未实现 |
| 自动评测结果 | 尚无 | 未评测 |
| 部署与用户研究 | 尚无 | 未开始 |

## 更新规则

- 开始任务：把状态从 `NEXT` 改为 `IN PROGRESS`，补负责人 / 会话和预期证据；
- 完成任务：先运行验证，再补证据链接，最后改为 `DONE`；
- 发现坏例：先记录严重度、复现输入和归因，再决定进入当前修复或回归集；
- 变更范围：同步更新 [PLAN.md](./PLAN.md) 和知识层决策记录，不在任务台偷偷改变产品目标；
- 阶段切换：检查该阶段全部出口条件，未满足的条目不能靠文字解释跳过。

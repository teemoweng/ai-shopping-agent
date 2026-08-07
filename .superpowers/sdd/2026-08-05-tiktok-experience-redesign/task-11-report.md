# Task 11 Engineering Report — E2E、正式截图与发布证据

日期：2026-08-07

基线：`241bf7aa6ae424efa09328db1628f8b96b8bd3d6`

## 交付边界

本报告只覆盖 Task 11 的工程证据、E2E、生产态截图与最小场景 hydration 修复。README、PLAN、TASKS、产品 ADR、知识控制室和产品日志由后续文档工作单独同步，本提交没有修改这些文件，也没有改写既有 Foundation 4/4 历史证据。

## TDD / 回归过程

### Cycle 1：迁移真实用户旅程

- 新增 8 条 redesign 旅程后，首轮 mobile Chromium 收集 10 项（8 required + 2 capture），正式 capture 未开启所以 2 项跳过。
- RED 1：成功回执打开时，测试用 semantic role 查询底层购物车 badge 失败。原因不是产品缺 badge，而是底层 phone 正确处于 `inert` / `aria-hidden`，元素不应进入可访问树。
- RED 2：AI alternative PDP 返回 Guide 后，测试才注册 snapshot response listener，导致 30 秒超时；UI 已恢复同一 decision state。
- 修正测试边界：回执态只用 DOM attribute 统计底层唯一 badge；Guide 恢复直接断言同一已验证 decision/recommendation state，不伪造迟到网络证据。
- GREEN：8 条 required journey 全部通过；2 条 opt-in capture 正确跳过。

### Cycle 2：场景 URL hydration 一致性

- 8 条旅程运行时发现 `?scenario=price-changed` 与 `?scenario=commit-status-unknown` 的服务端首帧按 normal 渲染、客户端首帧按 URL 渲染，引发 React hydration mismatch。
- RED：在价格变化旅程记录 console error 并断言无 hydration mismatch，focused E2E 1 项稳定失败。
- 初版 GREEN 消除 mismatch，但 ESLint 的 `react-hooks/set-state-in-effect` gate 失败，证明同步 effect setState 不是可接受实现。
- 最终实现用 `useSyncExternalStore` 提供稳定 server snapshot 与 browser snapshot；URL 仍只通过 `parseDemoScenario` allowlist，不接受任意值或时间参数。
- GREEN：focused price-changed E2E 1/1 与 ESLint 均通过。

## E2E 设计

- `workers=1`、`fullyParallel=false`、API/Web 均 `reuseExistingServer=false`。
- `CAPTURE_TIKTOK_REDESIGN_EVIDENCE=1` 时 Web 必须执行 `next build && next start`；普通本地 E2E 仍使用 `next dev`。
- 8 条 required journey 只在 `mobile-chromium` 运行，避免第二 project 重复完整交易矩阵；既有 `pdp-focus.spec.ts` 三条回归保留双 project 6/6 覆盖，fixture 库存足够。
- `desktop-interview` 运行 Foundation guide、PDP focus 与 responsive regressions，并独立采集 AI decision Sheet + panel。
- 所有 spec 的每次 `goto` 前都固定浏览器时间为 `2026-08-07T12:00:00Z`；没有 URL 时间透传、全局 demo time override 或 reset endpoint。
- Commerce 网络断言只保存在测试内存；Playwright trace 明确关闭，避免把 request body 中的 confirmation token 或 idempotency key 序列化为附件；本地 uvicorn evidence process 使用 `--no-access-log`。
- unknown journey 只把请求次数和两份私有 key 值留在局部变量中；matcher 只接收数字、类型和布尔值，失败输出也不会展开 request body 或含 key 的 URL。
- 本次 production E2E 运行时生成的 token/key 未进入 retained trace、matcher failure、截图、access log 或提交；这不等于仓库没有显式合成测试常量。idempotency key 当前位于 reconciliation URL，是非认证用操作标识，但生产化前仍需避免被 access/proxy log 持久化。

## 正式结果

- API：234 passed。
- Web：9 files / 193 passed。
- 非 capture E2E：38 collected，26 passed，12 intentional skips，0 failed。
- Production E2E：38 collected，28 passed，10 intentional skips，0 failed；8/8 required journey 实跑通过，PDP focus 双 project 6/6。
- Foundation eval pytest：14 passed；runner：6/6、pass rate 1.0。
- Contracts、layout、ESLint、Ruff、production build：exit 0。
- 三张 production Chromium 正式图：390×844 shoppable Feed、1440×1000 AI Sheet + panel、390×844 normal Feed。

详细命令、逐旅程网络状态/revision、图片 checksum、fixture/media inventory 与限制见 [`artifacts/evidence/tiktok-redesign-verification.md`](../../../artifacts/evidence/tiktok-redesign-verification.md)。

## 剩余工作

后续文档工作仍需基于已存在的工程证据同步 README 启动/演示路径、PLAN/TASKS 状态、产品日志、ADR/spec 成熟度和知识层索引。只能升级为“冻结合成 fixture 上已实现/已评测”，不得写成真实用户价值或业务效果已验证。

# Task 10 Report — 响应式 TikTok-inspired Demo 与面试演示框

日期：2026-08-07

## 交付结论

Task 10 已将同一棵 React 产品树收敛为两种观看方式：

- `390×844` 与 `≤520px`：phone 占满真实 viewport，无外部边框或上下黑边；Feed、Guide、PDP 与 Commerce overlay 都限制在同一 viewport 内。
- `1440×1000`：只增加 phone 外的中文 interview panel；phone 仍为精确 `390×844`，共用同一状态、组件与 API 调用。
- `320×700 + 200% font-size`：无横向溢出，Feed 商品/AI 入口、Guide 关闭与快速动作仍可达，底栏标签不再被裁切。

界面保留内容电商的短视频、右栏、商品锚点、黑色底栏、PDP 和 bottom sheet 范式，但只使用自有 SVG 图标、许可视频与合成商品，不使用 TikTok logo 或官方品牌资产。

## 产品与视觉判断

1. 手机内优先呈现用户业务结果：Feed 不显示 scenario、operation id、token 或工程成熟度；概念披露压缩为低噪音 chip。
2. 桌面 panel 只承担面试解释：动态当前步骤、已实现的确定性能力、未来 LLM/Hybrid RAG/多模态能力，以及四个公开测试场景。
3. 自有状态栏与统一线性 SVG 图标提供真实感；粉/青双色只用于动作、状态与发布图标，主体保持黑白高对比。
4. PDP 采用白底高密度商品事实层级，与暗色内容 Feed/Guide 明确分工；长英文商品名允许换行，sticky CTA 保持可达。
5. reduced-motion 不只关闭 CSS 动画，也禁止 Feed 自动播放视频。

## RED → GREEN 证据

### 第一轮 RED

新增结构、状态、场景、viewport 与图标测试后，聚焦运行得到 `13 failed / 177 passed`：

- 页面没有外部 `.interviewPanel`，也没有动态当前步骤。
- `parseDemoScenario` / `interviewStepFor` 尚不存在。
- document 仍为 `lang="en"`，没有 `viewport-fit=cover`。
- Feed/PDP 仍使用 Unicode 占位图标。
- reduced-motion 下视频仍调用 `play()`。

GREEN 后 Web 全量为 `192 passed`。

### 浏览器坏例与修复

- 首次 Guide 截图抓到了 `180ms` 入场动画的中间帧，视觉上误判为 sheet 过暗。随后用 reduced-motion 禁动画、dialog ready 后等待 `400ms` 复拍；静止态背景、正文和卡片对比度清晰，因此没有为中间帧错误提高亮度。
- `320×700 + 200% font-size` 首次测得底栏标签 `bottom=702`，超出 viewport 2px。先把坏例加入 Playwright，再让底栏、商品锚点、caption 与右栏位置随 rem 高度联动；修复后最大 `bottom=678`，`rootScrollWidth=320`。

## 场景 allowlist

| URL | Preview | Confirm |
|---|---|---|
| `?scenario=normal` | `NORMAL` | `NORMAL` |
| `?scenario=price-changed` | `PRICE_CHANGED` | `NORMAL` |
| `?scenario=out-of-stock` | `OUT_OF_STOCK` | `NORMAL` |
| `?scenario=commit-status-unknown` | `NORMAL` | `COMMIT_STATUS_UNKNOWN` |

缺失、空值、大小写变体和任意非法值均降级为 `NORMAL / NORMAL`。公开链接位于 desktop interview panel，phone 内只显示相应业务结果。

## 最终验证

| 检查 | 结果 |
|---|---|
| `pnpm --dir apps/web test` | 9 files / 192 tests passed |
| `pnpm --dir apps/web exec playwright test e2e/tiktok-responsive.spec.ts --project=mobile-chromium --project=desktop-interview --reporter=line` | 6 passed |
| 隔离 `3100/8100` 运行 `pdp-focus.spec.ts` | 3 passed；原 `3000/8000` 服务未终止 |
| `pnpm --dir apps/web lint` | passed |
| `pnpm --dir apps/web exec tsc --noEmit` | passed |
| `NEXT_DIST_DIR=.next-task10-build pnpm --dir apps/web build` | production build passed；临时 build 目录已清理 |
| `pnpm check:layout` | Foundation layout is valid |
| `pnpm --dir packages/contracts check` | OpenAPI / TypeScript contracts 无漂移 |
| `git diff --check` | passed |

## Chromium QA

- `390×844`：phone bbox 为 `{x:0,y:0,width:390,height:844}`；panel hidden；root/body scrollWidth 为 390。
- `1440×1000`：单一 phone 为 `390×844`；panel 位于其右侧且完全在 viewport 内；Guide overlay bbox 与 phone 完全一致。
- `320×700 + 200%`：phone/Guide bbox 为 `{0,0,320,700}`；scrollWidth 为 320；dialog 没有 inert 祖先；Escape 后焦点返回 Ask AI。
- 长中文 caption、长英文商品名、Feed/PDP 自有图标、Guide 内滚动、PDP sticky CTA、Tab/Enter/Escape 与焦点恢复均人工检查。

临时截图（不提交）：

- `/tmp/ai-shopping-task10-mobile.png`
- `/tmp/ai-shopping-task10-desktop.png`
- `/tmp/ai-shopping-task10-guide-static.png`
- `/tmp/ai-shopping-task10-pdp-ready.png`
- `/tmp/ai-shopping-task10-narrow-200-feed-final.png`
- `/tmp/ai-shopping-task10-narrow-static.png`

## 已知限制

- 当前仍是确定性概念原型：没有真实 TikTok API、支付、实时库存、真实 LLM、Hybrid RAG、多模态实时输入或真实用户/业务效果。
- Task 11 仍负责正式 production 截图、完整 redesigned journeys、旧 Foundation E2E 迁移与最终产品文档；本 Task 只提交临时 QA 图，不提交正式 artifacts。
- Next dev 左下角的 `N / Issue` 是开发工具浮层；Task 11 的 production 截图应在 production server 中采集。

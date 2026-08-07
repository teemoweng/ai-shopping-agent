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

初版 GREEN 后 Web 全量为 `192 passed`；本次 review fix 新增 chrome 行为覆盖后，最终为 `193 passed`。

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
| `uv --directory apps/api run pytest -q` | 234 passed；仅已有 Starlette deprecation warning |
| `pnpm --dir apps/web test` | 9 files / 193 tests passed |
| 隔离 `3100/8100` 运行 `tiktok-responsive.spec.ts` 两个 Chromium project | 8 passed |
| 隔离 `3100/8100` 运行 `pdp-focus.spec.ts` 两个 Chromium project | 6 passed；原 `3000/8000` 服务未终止 |
| `pnpm --dir apps/web lint` | passed |
| `pnpm --dir apps/web exec tsc --noEmit` | passed |
| 隔离 distDir 运行 `pnpm --dir apps/web build` | production build passed；临时 build 配置已回滚、目录已移出 worktree |
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

## 独立视觉复核修复（review fix）

独立复核要求重新校正 Feed 下层信息顺序、真实文本放大和 Demo chrome。修复继续使用 TDD，并作为 Task 10 后续独立提交：

### RED

- Catalog API 精确合同首先失败：实际仍返回 `For You / Following` 与 `shopping-agent`，而坏例要求 `LIVE / 社区 / 好友 / 关注 / 推荐` 与 `content-commerce-v1`。
- Web 组件出现 3 个预期失败：首个 `LIVE` 被误标 active；底栏仍为“消息 / 我的”；对应新图标入口不存在。
- 390 Chromium 坏例测得商品锚点 `bottom=774`、作者信息 `top=611.8125`，证明锚点实际位于作者信息下方。
- 320/200% 坏例先捕获“概念 · 合成”文案和 search/rail 碰撞；Commerce 标题要求至少 `36px` 时仍为 `20px`，证明固定 px 没有响应真实 root 文本放大。

### GREEN 与产品修复

1. Feed 下层改成单一 `.feedLowerOverlay` 垂直 stack：商品锚点在上，作者、caption、合成披露在下，底栏最下；无商品的普通 Feed 复用同一 stack，不制造空锚点。
2. `CatalogService` 固定返回五个 Demo 频道与 `content-commerce-v1`。前端按 variant mapping 渲染“首页 / 商城 / 发布 / 收件箱 / 主页”；“推荐”为 active；LIVE 仍只触发共享 Concept Boundary，不新增 route。
3. 商品名与 Commerce 标题、事实 label/value、边界文案、CTA、错误、diff 和 receipt 核心文案改用 rem。E2E 先等待 root computed font 到 `32px`，再等待两个 animation frame，避免读取文本重排前的旧 bbox。
4. 320 chrome 使用固定 `38×38` search button 与 `22×22` SVG；轻量披露改为完整“合成原型”，禁止 ellipsis。商品名与价格/合成披露允许真实换行，不通过缩小、隐藏或截断规避 200% 文本。

### 最终 bbox 与字体证据

- `390×844`：anchor `{x:9,y:623.8125,w:313,h:54}`，creator `{x:9,y:685.8125,w:313,h:86.1875}`，两者 gap `8px`；rail `{x:334,y:313,w:52,h:325}`；nav `y=780`。普通 Feed creator `{x:9,y:704.65625,w:313,h:67.34375}`，到 nav 同为 `8px`。
- `1440×1000`：phone `{x:269,y:78,w:390,h:844}`；panel `{x:731,y:134.671875,w:440,h:730.640625}`。
- `320×700 + 200%`：anchor `{x:6,y:231.4375,w:250,h:179.1875}`，creator `{x:6,y:418.625,w:250,h:161.375}`，gap `8px`；rail `{x:264,y:93.609375,w:52,h:336}`；nav `{x:0,y:588,w:320,h:112}`；“合成原型” bbox `{x:10,y:29,w:88,h:31.59375}`；search `{x:273,y:48,w:38,h:38}`，与 rail 垂直间隔约 `7.61px`。
- `320×700` Commerce drawer `{x:16,y:60.8125,w:288,h:623.1875}`；滚动后的 primary CTA `{x:164,y:594,w:124,h:74}`；document scrollWidth `320`。
- 字体 `100% → 200%`：商品名 `12→24px`、Commerce h2 `20→40px`、fact label `10→20px`、fact value `11→22px`、boundary `9→18px`、CTA `12→24px`，全部为精确 `2×`。
- active 频道实测为“推荐”，不是 LIVE。
- 最终 Minor 复核新增 320/root32px chrome bbox 门禁：status bar、完整“合成原型”与五个频道按钮依次相邻，两段垂直间隔均保持在 `2–4px`，search/rail 防碰撞断言继续通过。

复核复拍（不提交）：

- `/tmp/ai-shopping-task10-review-feed-390.png`
- `/tmp/ai-shopping-task10-review-guide-390.png`
- `/tmp/ai-shopping-task10-review-confirm-390.png`
- `/tmp/ai-shopping-task10-review-desktop-1440.png`
- `/tmp/ai-shopping-task10-review-feed-320-200.png`
- `/tmp/ai-shopping-task10-review-confirm-320-200.png`

## 已知限制

- 当前仍是确定性概念原型：没有真实 TikTok API、支付、实时库存、真实 LLM、Hybrid RAG、多模态实时输入或真实用户/业务效果。
- Task 11 仍负责正式 production 截图、完整 redesigned journeys、旧 Foundation E2E 迁移与最终产品文档；本 Task 只提交临时 QA 图，不提交正式 artifacts。
- Next dev 左下角的 `N / Issue` 是开发工具浮层；Task 11 的 production 截图应在 production server 中采集。

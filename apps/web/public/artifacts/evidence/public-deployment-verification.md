# AI 导购作品集公网发布验证记录

## 1. 发布结果

验证日期：2026-08-11（Asia/Shanghai）

| 工件 | 公开地址 | 验证结果 |
|---|---|---|
| 产品案例页 | [https://ai-shopping-agent.vercel.app/case-study](https://ai-shopping-agent.vercel.app/case-study) | HTTP 200；三处 Demo 入口均指向同站 `/`；全文证据弹窗可读 |
| 可交互 Demo | [https://ai-shopping-agent.vercel.app](https://ai-shopping-agent.vercel.app) | HTTP 200；真实 Chromium 主路径通过 |
| FastAPI health | [https://ai-shopping-agent-api.vercel.app/api/v1/health](https://ai-shopping-agent-api.vercel.app/api/v1/health) | HTTP 200；`deterministic-foundation` |
| OpenAPI | [https://ai-shopping-agent-api.vercel.app/openapi.json](https://ai-shopping-agent-api.vercel.app/openapi.json) | HTTP 200 |
| GitHub | [https://github.com/teemoweng/ai-shopping-agent](https://github.com/teemoweng/ai-shopping-agent) | 公开仓库可访问 |

部署形态为 Vercel Next.js Web + Vercel FastAPI Function。线上功能验收所对应的产品 source commit 为 `5a25f2c`；后续提交只补充可复跑的公网验证脚本、发布文档和证据截图。

## 2. 公网浏览器主路径

命令：

```bash
pnpm verify:public-deployment
```

真实 Chromium 在一条新会话中完成：

1. 打开 `/case-study`，确认首屏产品标题与三处同站 Demo 入口；
2. 点击“产品概览与边界”，确认居中 Document Reader Modal 可展示超过 5,000 字符的完整富文本，而非摘要；
3. 打开同站 Demo，点击“问问这款”；
4. 提交“预算20美元以内、无香精、自然妆效、日常通勤”；
5. 收到 `DECISION_READY`，看到首选商品的适合点与取舍；
6. 进入 Seoul Shade PDP；
7. 显式确认模拟加购，看到“模拟加购成功”及“未创建订单或支付”。

最终结果：`passed`。该路径只证明 2026-08-11 的公网原型在一次真实 Chromium 会话中可走通，不是可用性研究、负载测试或业务效果。

## 3. HTTP 与 CORS

| 检查 | 结果 |
|---|---|
| Web `/` | 200 |
| Web `/case-study` | 200 |
| Web `/vibe-coding-case-study.html` | 200 |
| API `/api/v1/health` | 200 |
| API `/openapi.json` | 200 |
| Origin `https://ai-shopping-agent.vercel.app` | 精确返回同一 `Access-Control-Allow-Origin` |
| Origin `https://evil.example` | 不返回 `Access-Control-Allow-Origin` |

Web 项目初次发布后发现 Vercel SSO Protection 会把公开地址重定向到登录页；发布验收前已显式关闭该项目的 SSO Protection，再确认匿名 HTTP 访问为 200。Git fork protection 保持开启。

## 4. 本地发布门

发布相关变更完成后已通过：

- API 全量：335 passed；Ruff 通过；
- Web：281 passed；ESLint 通过；Next.js production build 通过；
- 普通 E2E：39 passed / 31 intentional routed skips / 0 failed；
- Public bundle：34 个文件，`build` / `check` / 4 个 generator tests 通过；
- 部署配置：6/6 tests 通过；
- 线上 Chromium：案例页 → 全文证据 → AI 决策 → PDP → 模拟加购回执通过。

这些是工程与浏览器回归，不是推荐质量、用户价值或转化指标。

## 5. 正式公网截图

| 截图 | 尺寸 | SHA-256 |
|---|---:|---|
| [案例页桌面](../screenshots/public-case-study-desktop.png) | 1440×1000 | `f0b771e46334d288468a50588f5673fa486a6c0212721add2f0774a9d129a415` |
| [Demo 移动决策](../screenshots/public-demo-mobile.png) | 390×844 | `95ab930aa1702c4ed806478ab0a2b35e53ed75c1d6620baa3605de3487584c4f` |

原图已按原始分辨率检查：案例页证据卡片布局完整；移动端仍保留视频上下文，结论、单一商品卡、中文适合点/取舍、输入区和唯一合成原型披露均可见，无开发遮罩或横向溢出。

## 6. 失败历史与修正

发布没有把中途失败抹掉：

1. Railway 授权成功，但 workspace 试用已过期且创建服务要求升级付费计划；未购买订阅，改用 Vercel 官方 FastAPI Runtime；
2. API 首轮被 monorepo 根配置误判为 Next.js；改为 API 独立 `vercel.json` 与根目录部署；
3. API 首个可访问部署因 canonical fixture 路径和 trace 写路径不适配只读 Serverless 文件系统而返回 500；增加确定性 fixture mirror，并把 Vercel trace 指向 `/tmp`；
4. Web 首轮未识别 monorepo 根的 Next.js；根 package 声明与 Web 相同版本后解决；
5. Web prebuild 发现公网 bundle 引用了 Vercel source upload 不包含的 `.gitignore`；仓库内部链接改为公开源码提示，不再打包内部控制文件；
6. 线上验证脚本首轮使用 Node `fetch` 时受当前网络代理影响连接超时；切换为真实 Chromium 健康检查；
7. 文档阅读器首轮验证错误地查找了源文档 wrapper，而运行时实际克隆其子节点；改为验证真实 `#evidence-reader-content`，未修改产品实现；
8. 完整公网业务旅程随后在一条新会话中一次通过，没有用业务重试掩盖 Serverless 状态问题。

## 7. 已知限制

- 商品、内容与证据均为冻结合成 fixture；不是 TikTok 官方产品；
- 当前没有真实 LLM、Hybrid RAG、真实库存、支付、用户账号或业务流量；
- `GuideSession`、模拟交易与幂等状态在 API 进程内。Vercel Function 冷启动、扩缩容、归档恢复或重新部署后，已有会话可能失效；
- 本次只验证 Chromium 与一条公开黄金路径，没有完成 Safari、真实 iOS safe-area、并发、长时间稳定性或真人任务研究；
- “上线”在这里表示可分享的原型发布，不表示生产级商业系统上线。

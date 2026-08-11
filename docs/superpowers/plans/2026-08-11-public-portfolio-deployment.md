# AI 导购作品集公网发布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把案例页、Next.js Demo、FastAPI 和公开源码发布为一套可分享、可验收、边界清楚的公网作品集。

**Architecture:** Vercel 从 monorepo 构建 `apps/web`，同时把权威案例页与证据同步到 `public/`；Railway 以单 worker 运行 `apps/api`。前端通过构建时环境变量访问 API，API 通过严格的 `ALLOWED_ORIGINS` 接受唯一生产前端 origin。

**Tech Stack:** Next.js 16、React 19、FastAPI、Uvicorn、pnpm、uv、Vercel、Railway、GitHub Actions/CLI、Playwright。

## Global Constraints

- 保留本地 `file://` 案例页与 `127.0.0.1` Demo 的既有能力。
- 公网案例页和 Demo 使用同一 Web origin；API 单独使用 HTTPS origin。
- 不允许 `*` CORS，不允许把凭证或运行时交易标识写入 Git、public asset、截图或日志。
- API 只运行一个 worker，明确披露进程内会话在重启后丢失。
- 所有新行为先 RED、再最小 GREEN；配置文件用静态验证和真实构建证明。

---

### Task 1: 严格生产 CORS 与 Railway 运行入口

**Files:**
- Create: `apps/api/app/settings.py`
- Create: `apps/api/tests/unit/test_settings.py`
- Modify: `apps/api/app/main.py`
- Modify: `apps/api/tests/api/test_cors.py`
- Create: `apps/api/railway.json`

**Interfaces:**
- Produces: `parse_allowed_origins(raw: str | None) -> tuple[str, ...]`
- Produces: `create_app(allowed_origins: tuple[str, ...] | None = None) -> FastAPI`

- [ ] 写失败测试：默认本地 origin、逗号分隔 HTTPS origin、去重、通配符/路径/凭证拒绝。
- [ ] 运行 settings/CORS 测试并确认因接口缺失而失败。
- [ ] 实现 settings 与 app factory；保留 `app = create_app()` 公共入口。
- [ ] 写 `railway.json`：Railpack、`apps/api` root、单 worker、`--no-access-log`、health check。
- [ ] 运行聚焦测试、完整 API 测试与 Ruff。

### Task 2: 生成可部署的案例页资源包

**Files:**
- Create: `scripts/build-portfolio-public.mjs`
- Create: `scripts/portfolio-public.test.mjs`
- Modify: `vibe-coding-case-study.html`
- Modify: `package.json`
- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.ts`
- Generate: `apps/web/public/vibe-coding-case-study.html`
- Generate: `apps/web/public/portfolio-public-manifest.json`
- Generate: `apps/web/public/artifacts/**`
- Generate: `apps/web/public/docs/**`

**Interfaces:**
- Produces: `buildPortfolioBundle(projectRoot, { check })`
- Produces: `/case-study -> /vibe-coding-case-study.html`

- [ ] 写失败测试：文件 registry、哈希 manifest、check mode、Demo 链接的 file/http 双行为、全部本地资源存在。
- [ ] 运行测试，确认 generator 与生产链接缺失。
- [ ] 实现 runtime Demo URL 和确定性复制/哈希脚本。
- [ ] 生成并提交 public bundle；把 `--check` 接入 Web prebuild。
- [ ] 运行案例页测试、bundle check、Web 测试、lint 与 production build。

### Task 3: 部署配置、公开文档与安全门

**Files:**
- Create: `vercel.json`
- Create: `.env.example`
- Modify: `README.md`
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Create: `artifacts/evidence/public-deployment-verification.md`

**Interfaces:**
- Consumes: `ALLOWED_ORIGINS`、`NEXT_PUBLIC_API_BASE_URL`
- Produces: 可复制但不包含密钥的部署说明与验证模板。

- [ ] 写静态验证，确认 Vercel build/output、Railway start/health、环境变量示例和文档边界完整。
- [ ] 运行验证并确认文档/配置尚不完整。
- [ ] 补齐 Vercel monorepo 配置、环境变量示例和公开运行说明。
- [ ] 扫描 Git 历史候选文件、当前 tracked files 与 public bundle，确认没有凭证/隐私/运行时 token。
- [ ] 运行完整本地 release gate，保存精确结果。

### Task 4: GitHub、Railway、Vercel 与线上验收

**Files:**
- Modify: `README.md`
- Modify: `TASKS.md`
- Modify: `artifacts/evidence/public-deployment-verification.md`
- Create: `artifacts/screenshots/public-case-study-desktop.png`
- Create: `artifacts/screenshots/public-demo-mobile.png`

**Interfaces:**
- Produces: GitHub URL、Web URL、API URL 与线上验证记录。

- [ ] 提交并公开推送当前 source，确认公开仓库页面与敏感信息扫描。
- [ ] 部署 Railway API，生成域名并验证 `/api/v1/health`。
- [ ] 部署 Vercel Web，注入公网 API base，生成生产域名。
- [ ] 把精确 Web origin 配进 Railway，重新验证允许/拒绝两类 CORS。
- [ ] 在公网执行案例页、证据阅读器和 Demo 核心旅程，保存桌面/移动截图。
- [ ] 更新 URL、source commit、测试与限制；最后才把 `TASKS.md` 改为 `DONE`。

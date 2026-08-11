import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);

test("Vercel builds the monorepo Web app from the repository root", async () => {
  const config = JSON.parse(await readFile(path.join(projectRoot, "vercel.json"), "utf8"));
  assert.equal(config.$schema, "https://openapi.vercel.sh/vercel.json");
  assert.equal(config.framework, "nextjs");
  assert.equal(config.installCommand, "pnpm install --frozen-lockfile");
  assert.equal(config.buildCommand, "pnpm --dir apps/web build");
  assert.equal(config.outputDirectory, "apps/web/.next");
});

test("Railway starts one quiet API worker and checks the real health route", async () => {
  const config = JSON.parse(await readFile(path.join(projectRoot, "apps/api/railway.json"), "utf8"));
  assert.equal(config.$schema, "https://railway.com/railway.schema.json");
  assert.equal(config.build.builder, "RAILPACK");
  assert.match(config.deploy.startCommand, /--workers 1/);
  assert.match(config.deploy.startCommand, /--no-access-log/);
  assert.match(config.deploy.startCommand, /\$\{PORT:-8000\}/);
  assert.equal(config.deploy.healthcheckPath, "/api/v1/health");
});

test("the environment example contains only public configuration placeholders", async () => {
  const example = await readFile(path.join(projectRoot, ".env.example"), "utf8");
  assert.match(example, /^NEXT_PUBLIC_API_BASE_URL=https:\/\/your-api-domain\.up\.railway\.app\/api\/v1$/m);
  assert.match(example, /^ALLOWED_ORIGINS=https:\/\/your-web-domain\.vercel\.app$/m);
  assert.doesNotMatch(example, /(token|secret|password|api_key)\s*=/i);
});

test("README documents public operation without overstating persistence", async () => {
  const readme = await readFile(path.join(projectRoot, "README.md"), "utf8");
  assert.match(readme, /## 公网部署/);
  assert.match(readme, /Vercel/);
  assert.match(readme, /Railway/);
  assert.match(readme, /进程内/);
  assert.match(readme, /服务重启后.*会话/);
});

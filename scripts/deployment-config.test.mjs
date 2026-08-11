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

test("Vercel can discover the FastAPI app from the API project root", async () => {
  const pyproject = await readFile(path.join(projectRoot, "apps/api/pyproject.toml"), "utf8");
  const config = JSON.parse(await readFile(path.join(projectRoot, "apps/api/vercel.json"), "utf8"));
  assert.match(pyproject, /\[tool\.vercel\]/);
  assert.match(pyproject, /^entrypoint\s*=\s*"app\.main:app"$/m);
  assert.equal(config.$schema, "https://openapi.vercel.sh/vercel.json");
  assert.equal(config.framework, "fastapi");
  assert.equal(Object.hasOwn(config, "installCommand"), false);
  assert.equal(Object.hasOwn(config, "buildCommand"), false);
});

test("the environment example contains only public configuration placeholders", async () => {
  const example = await readFile(path.join(projectRoot, ".env.example"), "utf8");
  assert.match(example, /^NEXT_PUBLIC_API_BASE_URL=https:\/\/your-api-project\.vercel\.app\/api\/v1$/m);
  assert.match(example, /^ALLOWED_ORIGINS=https:\/\/your-web-domain\.vercel\.app$/m);
  assert.doesNotMatch(example, /(token|secret|password|api_key)\s*=/i);
});

test("README documents public operation without overstating persistence", async () => {
  const readme = await readFile(path.join(projectRoot, "README.md"), "utf8");
  assert.match(readme, /## 公网部署/);
  assert.match(readme, /Vercel/);
  assert.match(readme, /Vercel FastAPI/);
  assert.match(readme, /进程内/);
  assert.match(readme, /Function.*会话/);
});

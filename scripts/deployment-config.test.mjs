import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("Vercel builds the monorepo Web app from the repository root", async () => {
  const config = JSON.parse(await readFile(path.join(projectRoot, "vercel.json"), "utf8"));
  const rootPackage = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
  const webPackage = JSON.parse(await readFile(path.join(projectRoot, "apps/web/package.json"), "utf8"));
  assert.equal(config.$schema, "https://openapi.vercel.sh/vercel.json");
  assert.equal(config.framework, "nextjs");
  assert.equal(config.installCommand, "pnpm install --frozen-lockfile");
  assert.equal(config.buildCommand, "pnpm --dir apps/web build");
  assert.equal(config.outputDirectory, "apps/web/.next");
  assert.equal(rootPackage.devDependencies.next, webPackage.dependencies.next);
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

test("the API deployment bundle mirrors every canonical fixture byte-for-byte", async () => {
  for (const filename of ["content-contexts.json", "evidence.json", "feed-items.json", "products.json"]) {
    const canonical = await readFile(path.join(projectRoot, "data/fixtures", filename));
    const bundled = await readFile(path.join(projectRoot, "apps/api/data/fixtures", filename));
    assert.equal(sha256(bundled), sha256(canonical), filename);
  }
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

test("the public release has a reproducible browser verification command", async () => {
  const rootPackage = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
  const verifier = await readFile(
    path.join(projectRoot, "scripts/verify-public-deployment.mjs"),
    "utf8",
  );
  assert.equal(
    rootPackage.scripts["verify:public-deployment"],
    "node scripts/verify-public-deployment.mjs",
  );
  assert.match(verifier, /https:\/\/ai-shopping-agent\.vercel\.app/);
  assert.match(verifier, /https:\/\/ai-shopping-agent-api\.vercel\.app\/api\/v1/);
  assert.match(verifier, /模拟加购回执/);
});

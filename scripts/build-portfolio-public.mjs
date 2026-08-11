import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_PATH = "portfolio-public-manifest.json";
const CASE_STUDY_PATH = "vibe-coding-case-study.html";
const REQUIRED_SOURCE_PATHS = Object.freeze([
  "README.md",
  "PLAN.md",
  "TASKS.md",
  "docs/superpowers/specs/2026-08-10-chat-first-lightweight-guide-design.md",
  "artifacts/evidence/chat-first-verification.md",
  "artifacts/evidence/chat-first-run-manifest.json",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertSafeRelativePath(relativePath) {
  const normalized = path.posix.normalize(relativePath.replaceAll("\\", "/"));
  if (
    normalized.startsWith("../")
    || normalized === ".."
    || path.posix.isAbsolute(normalized)
    || /(^|\/)\.env(?:\.|$)/u.test(normalized)
    || normalized.includes("/.git/")
  ) {
    throw new Error(`unsafe public bundle path: ${relativePath}`);
  }
  return normalized;
}

export function renderPublicCaseStudy(source) {
  return source
    .replaceAll('href="http://127.0.0.1:3000"', 'href="/"')
    .replaceAll(
      'href="./.env.example"',
      'href="#artifacts" data-config-reference="true" title="环境变量示例请在公开源码仓库查看"',
    )
    .replace(
      /href="\.\/\.\.\/\.\.\/AI产品经理\/[^"]+"/gu,
      'href="#artifacts" data-local-knowledge-reference="true" title="本地知识库引用未公开"',
    );
}

function extractLocalReferences(html) {
  return [
    ...html.matchAll(/(?:src|href)="\.\/([^"#?]+)(?:[#?][^"]*)?"/g),
  ].map((match) => assertSafeRelativePath(match[1]));
}

async function collectFiles(projectRoot, relativePath) {
  const safePath = assertSafeRelativePath(relativePath);
  const absolutePath = path.join(projectRoot, safePath);
  const stats = await lstat(absolutePath);
  if (stats.isSymbolicLink()) {
    throw new Error(`public bundle does not follow symlinks: ${safePath}`);
  }
  if (stats.isFile()) return [safePath];
  if (!stats.isDirectory()) return [];

  const files = [];
  const entries = await readdir(absolutePath, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = path.posix.join(safePath, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`public bundle does not follow symlinks: ${child}`);
    if (entry.isDirectory()) files.push(...await collectFiles(projectRoot, child));
    if (entry.isFile()) files.push(child);
  }
  return files;
}

async function expectedOutputs(projectRoot) {
  const source = await readFile(path.join(projectRoot, CASE_STUDY_PATH), "utf8");
  const publicCaseStudy = renderPublicCaseStudy(source);
  const references = new Set([
    ...REQUIRED_SOURCE_PATHS,
    ...extractLocalReferences(publicCaseStudy),
  ]);
  references.delete(CASE_STUDY_PATH);

  const sourceFiles = [];
  for (const reference of [...references].sort()) {
    sourceFiles.push(...await collectFiles(projectRoot, reference));
  }

  const outputs = new Map([[CASE_STUDY_PATH, Buffer.from(publicCaseStudy)]]);
  for (const file of [...new Set(sourceFiles)].sort()) {
    outputs.set(file, await readFile(path.join(projectRoot, file)));
  }
  return outputs;
}

async function fileMatches(filePath, expected) {
  try {
    const actual = await readFile(filePath);
    return actual.equals(expected);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function buildPortfolioBundle({ projectRoot, publicRoot, check = false }) {
  const outputs = await expectedOutputs(projectRoot);
  const files = [...outputs.entries()]
    .map(([filePath, content]) => ({
      path: filePath,
      bytes: content.byteLength,
      sha256: sha256(content),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    schema_version: 1,
    source: CASE_STUDY_PATH,
    files,
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  outputs.set(MANIFEST_PATH, manifestBytes);

  let changed = false;
  for (const [relativePath, content] of outputs) {
    if (!await fileMatches(path.join(publicRoot, relativePath), content)) changed = true;
  }
  if (check || !changed) return { changed, manifest };

  try {
    const previous = JSON.parse(await readFile(path.join(publicRoot, MANIFEST_PATH), "utf8"));
    for (const file of previous.files ?? []) {
      if (!outputs.has(file.path)) await rm(path.join(publicRoot, assertSafeRelativePath(file.path)), { force: true });
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  for (const [relativePath, content] of outputs) {
    const destination = path.join(publicRoot, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
  return { changed, manifest };
}

async function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const publicRoot = path.join(projectRoot, "apps/web/public");
  const check = process.argv.includes("--check");
  const result = await buildPortfolioBundle({ projectRoot, publicRoot, check });
  if (check && result.changed) {
    console.error("Portfolio public bundle is stale. Run pnpm build:portfolio-public.");
    process.exitCode = 1;
    return;
  }
  console.log(`Portfolio public bundle ${result.changed ? "updated" : "is current"}: ${result.manifest.files.length} files`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

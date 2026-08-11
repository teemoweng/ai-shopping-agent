import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE_NAMES = Object.freeze([
  "content-contexts.json",
  "evidence.json",
  "feed-items.json",
  "products.json",
]);

async function matches(destination, expected) {
  try {
    return (await readFile(destination)).equals(expected);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function buildApiDeployment({ projectRoot, check = false }) {
  const sourceRoot = path.join(projectRoot, "data/fixtures");
  const destinationRoot = path.join(projectRoot, "apps/api/data/fixtures");
  const sourceFiles = (await readdir(sourceRoot)).filter((name) => name.endsWith(".json")).sort();
  if (JSON.stringify(sourceFiles) !== JSON.stringify([...FIXTURE_NAMES])) {
    throw new Error(`unexpected API fixture registry: ${sourceFiles.join(", ")}`);
  }

  let changed = false;
  for (const name of FIXTURE_NAMES) {
    const expected = await readFile(path.join(sourceRoot, name));
    const destination = path.join(destinationRoot, name);
    if (await matches(destination, expected)) continue;
    changed = true;
    if (!check) {
      await mkdir(destinationRoot, { recursive: true });
      await writeFile(destination, expected);
    }
  }
  return { changed, files: [...FIXTURE_NAMES] };
}

async function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const check = process.argv.includes("--check");
  const result = await buildApiDeployment({ projectRoot, check });
  if (check && result.changed) {
    console.error("API deployment fixtures are stale. Run pnpm build:api-deployment.");
    process.exitCode = 1;
    return;
  }
  console.log(`API deployment fixtures ${result.changed ? "updated" : "are current"}: ${result.files.length} files`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

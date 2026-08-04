import { access } from "node:fs/promises";

const requiredPaths = [
  "apps/web/package.json",
  "apps/web/src/app/page.tsx",
  "apps/api/pyproject.toml",
  "pnpm-workspace.yaml",
];

const missing = [];
for (const path of requiredPaths) {
  try {
    await access(new URL(`../${path}`, import.meta.url));
  } catch {
    missing.push(path);
  }
}

if (missing.length > 0) {
  console.error(`Missing foundation paths:\n${missing.join("\n")}`);
  process.exit(1);
}

console.log("Foundation layout is valid");

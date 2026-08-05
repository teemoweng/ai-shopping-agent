import { access, stat } from "node:fs/promises";

const requiredPaths = [
  "apps/web/package.json",
  "apps/web/src/app/page.tsx",
  "apps/api/pyproject.toml",
  "pnpm-workspace.yaml",
  "apps/web/public/demo/feed-commerce.mp4",
  "apps/web/public/demo/feed-commerce-poster.jpg",
  "apps/web/public/demo/feed-normal.mp4",
  "apps/web/public/demo/feed-normal-poster.jpg",
  "apps/web/public/demo/product-seoul-shade.svg",
  "apps/web/public/demo/product-cloud-veil.svg",
  "apps/web/public/demo/product-jeju-sport.svg",
  "apps/web/public/demo/ASSET_SOURCES.md",
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

const maxVideoSizeBytes = 8 * 1024 * 1024;
const oversizedVideos = [];
for (const path of [
  "apps/web/public/demo/feed-commerce.mp4",
  "apps/web/public/demo/feed-normal.mp4",
]) {
  const details = await stat(new URL(`../${path}`, import.meta.url));
  if (details.size > maxVideoSizeBytes) {
    oversizedVideos.push(path);
  }
}

if (oversizedVideos.length > 0) {
  console.error(`Demo videos exceed 8 MB:\n${oversizedVideos.join("\n")}`);
  process.exit(1);
}

console.log("Foundation layout is valid");

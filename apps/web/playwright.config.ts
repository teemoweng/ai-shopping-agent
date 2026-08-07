import { defineConfig } from "@playwright/test";

const captureFormalEvidence =
  process.env.CAPTURE_TIKTOK_REDESIGN_EVIDENCE === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3000",
    // Transaction requests carry runtime-only confirmation/idempotency secrets.
    // Do not serialize network bodies into Playwright trace attachments.
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command:
        "uv --directory ../api run uvicorn app.main:app --host 127.0.0.1 --port 8000",
      url: "http://127.0.0.1:8000/api/v1/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: captureFormalEvidence
        ? "pnpm build && pnpm start --hostname 127.0.0.1 --port 3000"
        : "pnpm dev --hostname 127.0.0.1 --port 3000",
      env: {
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8000/api/v1",
      },
      url: "http://127.0.0.1:3000",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "mobile-chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "desktop-interview",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
});

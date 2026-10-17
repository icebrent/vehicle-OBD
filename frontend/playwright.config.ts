import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(
  import.meta.dirname,
  "../.cache/ms-playwright",
);
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:5174",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: [
    {
      command: `"${resolve(import.meta.dirname, "../.venv/Scripts/python.exe")}" -m uvicorn tests.mock_app:create_mock_app --factory --app-dir .. --host 127.0.0.1 --port 8001`,
      url: "http://127.0.0.1:8001/api/status",
      reuseExistingServer: false,
      env: {
        CAN_DATA_DIR: "../.cache/e2e-data",
        CAN_ENABLE_HARDWARE: "0",
        CAN_ALLOWED_ORIGIN: "http://127.0.0.1:5174",
      },
    },
    {
      command: "npm run dev -- --port 5174",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      env: { CAN_API_TARGET: "http://127.0.0.1:8001" },
    },
  ],
});

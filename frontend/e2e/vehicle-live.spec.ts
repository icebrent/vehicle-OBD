import { test, expect } from "@playwright/test";

test("real view shows errors without mock fallback and replays recorded values", async ({
  page,
}) => {
  const now = Date.now();
  const readings = [
    { signal_id: "soc", value: 90, unit: "%", request: "220005" },
    { signal_id: "voltage", value: 405, unit: "V", request: "220008" },
    { signal_id: "current", value: -2, unit: "A", request: "220009" },
    { signal_id: "temperature", value: 22, unit: "°C", request: "220032" },
  ].map((r, i) => ({
    ...r,
    timestamp_utc: new Date(now - (3 - i) * 5000).toISOString(),
    timestamp_monotonic: i * 5,
    raw_response: "fixture",
    validation: "experimental",
  }));
  let state = {
    state: "error",
    source: "diagnostic",
    last_error: "COM port error 121",
    recording_id: null as string | null,
    saving_armed: false,
    received: 0,
    latest: [] as typeof readings,
    history: [] as typeof readings,
  };
  const posts: string[] = [];
  await page.route("**/api/vehicle/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") posts.push(path);
    if (path.endsWith("/sessions"))
      return route.fulfill({
        json: [
          {
            id: "fixture-recording",
            name: "Saved diagnostic fixture",
            started_at: new Date(now).toISOString(),
            count: 4,
            state: "complete",
          },
        ],
      });
    if (path.endsWith("/stop"))
      state = {
        ...state,
        state: "stopped",
        saving_armed: false,
        recording_id: null,
      };
    if (path.endsWith("/replay"))
      state = {
        ...state,
        state: "replaying",
        source: "replay",
        last_error: null,
        received: 4,
        latest: readings,
        history: readings,
      };
    await route.fulfill({ json: state });
  });
  await page.goto("/?view=vehicle&source=live");
  await expect(page.getByText("REAL DID READS", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText("COM port error 121");
  await expect(
    page.locator(".vt-summary-strip button").nth(0).locator("strong"),
  ).toContainText("—");
  await expect(page.getByText("MOCK DEMO", { exact: true })).toHaveCount(0);
  expect(posts).toEqual([]);
  state = {
    ...state,
    state: "live",
    last_error: null,
    received: 4,
    recording_id: "recording",
    saving_armed: true,
    latest: readings,
    history: readings,
  };
  await expect(
    page.locator(".vt-summary-strip button").nth(1).locator("strong"),
  ).toContainText("405.0");
  await expect(
    page.getByText("Saving raw responses + values", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".vt-summary-strip button").nth(2).locator("strong"),
  ).toContainText("-2.0");
  await expect(page.locator(".vt-svg-hotspot")).toHaveCount(1);
  await page.getByRole("button", { name: "Stop reads / replay" }).click();
  await page
    .getByText("Diagnostic recordings / replay", { exact: true })
    .click();
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(
    page.getByText("RECORDED REPLAY", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".vt-summary-strip button").nth(0).locator("strong"),
  ).toContainText("90.0");
  expect(posts).toEqual(["/api/vehicle/stop", "/api/vehicle/replay"]);
  await page.screenshot({
    path: "test-results/vehicle-live-replay-fixture.png",
    fullPage: true,
  });
});

test("battery groups render real readings, marker notes and offline replay", async ({
  page,
}) => {
  const now = Date.now();
  const rows = [
    {
      signal_id: "module_min_voltage",
      value: 3.319,
      request: "22016D",
      unit: "V",
    },
    {
      signal_id: "module_max_voltage",
      value: 3.321,
      request: "22016F",
      unit: "V",
    },
    {
      signal_id: "module_temperature_a",
      value: 23,
      request: "220171",
      unit: "°C",
    },
    {
      signal_id: "module_temperature_b",
      value: 22,
      request: "220173",
      unit: "°C",
    },
  ].map((r, i) => ({
    ...r,
    module_id: 2,
    timestamp_utc: new Date(now + i).toISOString(),
    timestamp_monotonic: i,
    raw_response: "fixture",
    validation: "experimental",
  }));
  let state = {
    state: "live",
    source: "diagnostic",
    last_error: null,
    recording_id: "fixture",
    saving_armed: true,
    received: 4,
    latest: rows,
    history: rows,
  };
  const markers: string[] = [];
  await page.route("**/api/vehicle/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/sessions"))
      return route.fulfill({
        json: [
          {
            id: "fixture",
            name: "Groups",
            count: 4,
            state: "complete",
            started_at: new Date(now).toISOString(),
          },
        ],
      });
    if (path.endsWith("/markers"))
      markers.push(route.request().postDataJSON().label);
    if (path.endsWith("/stop"))
      state = { ...state, state: "stopped", saving_armed: false };
    if (path.endsWith("/replay"))
      state = {
        ...state,
        state: "replaying",
        source: "replay",
        recording_id: "",
      };
    await route.fulfill({ json: state });
  });
  await page.goto("/?view=vehicle&source=live");
  await page
    .getByRole("button", { name: "Inspect illustrative module 2", exact: true })
    .click();
  await expect(page.locator(".vt-inspector")).toContainText("3.319");
  await expect(page.locator(".vt-inspector")).toContainText(
    "Temperature A (candidate)",
  );
  await expect(page.locator(".vt-inspector")).toContainText("2.0");
  await expect(page.locator(".vt-modules-grid")).toContainText(
    "REAL · EXPERIMENTAL",
  );
  await page.getByRole("button", { name: "A/C off", exact: true }).click();
  expect(markers).toEqual(["ac_off"]);
  await page.getByRole("button", { name: "Stop reads / replay" }).click();
  await page
    .getByText("Diagnostic recordings / replay", { exact: true })
    .click();
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(page.locator(".vt-modules-grid")).toContainText("REPLAY");
  await page.screenshot({
    path: "test-results/vehicle-groups-fixture.png",
    fullPage: true,
  });
});

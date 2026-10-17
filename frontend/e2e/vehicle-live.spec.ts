import { test, expect } from "@playwright/test";
import { vehicleProfile } from "./fixtures/vehicle-profile";

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
    vehicle_profile_id: vehicleProfile.id,
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
    if (path.endsWith("/profiles"))
      return route.fulfill({ json: [vehicleProfile] });
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
            definition_version: vehicleProfile.definition_version,
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
        vehicle_profile_id: vehicleProfile.id,
        last_error: null,
        received: 4,
        latest: readings,
        history: readings,
      };
    await route.fulfill({ json: state });
  });
  await page.goto("/?view=vehicle&source=live");
  await page
    .getByLabel("Vehicle model", { exact: true })
    .selectOption(vehicleProfile.id);
  await expect(page.getByText("LIVE DID", { exact: true })).toBeVisible();
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
  await expect(page.getByText("Saving", { exact: true })).toBeVisible();
  await expect(
    page.locator(".vt-summary-strip button").nth(2).locator("strong"),
  ).toContainText("-2.0");
  await expect(page.locator(".vt-svg-hotspot")).toHaveCount(1);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByLabel("Diagnostic data source").selectOption("replay");
  await expect(page.getByLabel("Diagnostic recording")).toBeVisible();
  await page
    .getByLabel("Diagnostic recording")
    .selectOption("fixture-recording");
  await page.getByRole("button", { name: "Start replay", exact: true }).click();
  await expect(
    page.getByText("RECORDED PLAYBACK", { exact: true }),
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

test("battery groups render real readings and dropdown replay without action markers", async ({
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
    vehicle_profile_id: vehicleProfile.id,
    last_error: null,
    recording_id: "fixture",
    saving_armed: true,
    received: 4,
    latest: rows,
    history: rows,
  };
  const posts: string[] = [];
  await page.route("**/api/vehicle/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/profiles"))
      return route.fulfill({ json: [vehicleProfile] });
    if (path.endsWith("/sessions"))
      return route.fulfill({
        json: [
          {
            id: "fixture",
            name: "Groups",
            count: 4,
            state: "complete",
            definition_version: vehicleProfile.definition_version,
            started_at: new Date(now).toISOString(),
          },
        ],
      });
    if (route.request().method() === "POST") posts.push(path);
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
    .getByLabel("Vehicle model", { exact: true })
    .selectOption(vehicleProfile.id);
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
  await expect(
    page.getByRole("button", { name: "A/C off", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Observation markers")).toHaveCount(0);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByLabel("Diagnostic data source").selectOption("replay");
  await page.getByLabel("Diagnostic recording").selectOption("fixture");
  expect(posts).toEqual(["/api/vehicle/stop"]);
  await page.getByRole("button", { name: "Start replay", exact: true }).click();
  await expect(page.locator(".vt-modules-grid")).toContainText("REPLAY");
  await page.screenshot({
    path: "test-results/vehicle-groups-fixture.png",
    fullPage: true,
  });
});

test("source selection stays bounded and chart/hover order follows Signals after reselection", async ({
  page,
}) => {
  const now = Date.now() - 10000;
  const readings = Array.from({ length: 3 }, (_, i) =>
    [
      { signal_id: "soc", value: 90 + i, unit: "%", request: "220005" },
      { signal_id: "voltage", value: 405 + i, unit: "V", request: "220008" },
      { signal_id: "current", value: 2 + i, unit: "A", request: "220009" },
      {
        signal_id: "temperature",
        value: 22 + i,
        unit: "°C",
        request: "220032",
      },
    ].map((r, j) => ({
      ...r,
      timestamp_utc: new Date(now + i * 3000 + j * 100).toISOString(),
      timestamp_monotonic: i * 3 + j * 0.1,
      raw_response: "fixture",
      validation: "experimental",
    })),
  ).flat();
  await page.route("**/api/vehicle/**", (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/profiles"))
      return route.fulfill({ json: [vehicleProfile] });
    if (new URL(route.request().url()).pathname.endsWith("/sessions"))
      return route.fulfill({
        json: [
          {
            id: "fixture",
            name: "A very long diagnostic recording title used to verify dropdown sizing remains stable",
            started_at: new Date(now).toISOString(),
            count: readings.length,
            state: "complete",
            definition_version: vehicleProfile.definition_version,
          },
        ],
      });
    return route.fulfill({
      json: {
        state: "complete",
        source: "replay",
        vehicle_profile_id: vehicleProfile.id,
        last_error: null,
        recording_id: null,
        saving_armed: false,
        received: readings.length,
        latest: readings,
        history: readings,
      },
    });
  });
  await page.route("**/api/ports", (route) =>
    route.fulfill({
      json: [
        {
          device: "COM8",
          description:
            "Standard Serial over Bluetooth link with a deliberately very long device description",
        },
      ],
    }),
  );
  await page.goto("/?view=vehicle");
  await page
    .getByLabel("Vehicle model", { exact: true })
    .selectOption(vehicleProfile.id);
  const source = page.getByLabel("Diagnostic data source");
  const before = await source.boundingBox();
  const port = page.getByLabel("Diagnostic COM port");
  const portBefore = await port.boundingBox();
  await page
    .getByRole("button", { name: "Refresh ports", exact: true })
    .click();
  await expect(port.locator("option")).toHaveCount(2);
  expect(await port.boundingBox()).toEqual(portBefore);
  await source.selectOption("replay");
  expect((await source.boundingBox())?.width).toBe(before?.width);
  await expect(page.getByLabel("Diagnostic recording")).toBeVisible();
  await page.getByRole("checkbox", { name: /Battery power/ }).check();
  await page.getByRole("checkbox", { name: /State of charge/ }).check();
  await page.getByRole("checkbox", { name: /Pack voltage/ }).uncheck();
  await page.getByRole("checkbox", { name: /Pack voltage/ }).check();
  await expect(page.locator(".vt-chart-label")).toHaveText([
    "State of charge · %",
    "Pack voltage · V",
    "Pack current · A",
    "Battery power · kW",
    "Battery temperature · °C",
  ]);
  const chart = page.getByRole("img", { name: "Physical signal time series" });
  await page.getByRole("button", { name: "Pause vehicle display" }).click();
  await chart.scrollIntoViewIfNeeded();
  const rect = await chart.boundingBox();
  if (!rect) throw new Error("Missing chart");
  await page.mouse.move(rect.x + rect.width - 24, rect.y + 50);
  const rows = page.locator(".vt-trend-tooltip .vt-trend-tooltip-row");
  await expect(rows).toHaveCount(5);
  expect(
    await rows.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-signal")),
    ),
  ).toEqual(["soc", "voltage", "current", "power", "temperature"]);
  await expect(rows.nth(1)).toContainText("Pack voltage");
  await expect(rows.nth(1).locator("strong")).not.toContainText("—");
  await expect(rows.nth(2).locator("strong")).not.toContainText("—");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

import { test, expect } from "@playwright/test";

test("physical demo stays isolated and supports selection, pause and module inspection", async ({
  page,
}) => {
  const apiRequests: string[] = [];
  const sockets: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) apiRequests.push(request.url());
  });
  page.on("websocket", (socket) => {
    // Vite's development reload socket is unrelated to capture telemetry.
    if (new URL(socket.url()).pathname === "/ws") sockets.push(socket.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?view=vehicle");
  await expect(page.getByText("MOCK DEMO", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("img", { name: "Physical signal time series" })
      .locator("canvas"),
  ).toBeVisible();
  await expect(page.locator(".vt-chart-label")).toHaveCount(3);
  await page.getByRole("checkbox", { name: /Pack current/ }).uncheck();
  await expect(page.locator(".vt-chart-label")).toHaveCount(2);
  await page.getByRole("checkbox", { name: /Battery power/ }).check();
  await expect(page.locator(".vt-chart-label")).toHaveCount(3);
  await page.getByLabel("Time window").selectOption("180");
  await page
    .getByRole("button", { name: "Inspect illustrative module 3", exact: true })
    .click();
  await expect(page.locator(".vt-module-details")).toHaveAttribute("open", "");
  await expect(
    page.getByRole("heading", { name: "Module 03", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /M03 MOCK/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.screenshot({
    path: "test-results/vehicle-modules.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Powertrain", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Front powertrain" }),
  ).toBeVisible();
  await expect(page.getByText("No verified signal mapping")).toBeVisible();
  await page.getByLabel("Demo scenario").selectOption("regen");
  await expect
    .poll(async () =>
      page
        .locator(".vt-summary-strip button")
        .nth(2)
        .locator("strong")
        .innerText(),
    )
    .toMatch(/^-/);
  await page.getByRole("button", { name: "Pause vehicle display" }).click();
  const frozen = await page.locator(".vt-summary-strip").innerText();
  await page.waitForTimeout(1100);
  expect(await page.locator(".vt-summary-strip").innerText()).toBe(frozen);
  await expect(
    page.getByText("Display paused · Mock sampling continues"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume vehicle display" }).click();
  await expect
    .poll(() => page.locator(".vt-summary-strip").innerText())
    .not.toBe(frozen);
  while (await page.locator(".vt-signal-picker input:checked").count())
    await page.locator(".vt-signal-picker input:checked").first().uncheck();
  await expect(
    page.getByText("Select a signal to build a time series."),
  ).toBeVisible();
  for (const name of [
    "State of charge",
    "Pack voltage",
    "Pack current",
    "Battery power",
    "Battery temperature",
  ])
    await page.getByRole("checkbox", { name: new RegExp(name) }).check();
  await page.getByText("Capacity & counters", { exact: true }).click();
  await page.getByRole("checkbox", { name: /Reported capacity/ }).check();
  await page.getByRole("checkbox", { name: /Charge connection count/ }).click();
  await expect(
    page.getByText("Select up to 6 signals at a time."),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /Charge connection count/ }),
  ).not.toBeChecked();
  expect(apiRequests).toEqual([]);
  expect(sockets).toEqual([]);
  expect(errors).toEqual([]);
});

test("vehicle demo fits desktop and mobile and follows system theme", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?view=vehicle");
  await expect(
    page
      .getByRole("img", { name: "Physical signal time series" })
      .locator("canvas"),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/vehicle-dark.png",
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({
    path: "test-results/vehicle-light.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/vehicle-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Inspect illustrative module 1", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Module 01", exact: true }),
  ).toBeVisible();
});

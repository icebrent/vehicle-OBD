import { test, expect } from "@playwright/test";

test("vehicle workspace defaults to no model, prompts on Start and renders only after selection", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?view=vehicle&source=mock");
  await expect(
    page.getByText("NO ACTIVE SOURCE", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Mock demo" })).toHaveCount(0);
  await expect(page.getByLabel("Demo scenario")).toHaveCount(0);
  await expect(page.getByLabel("Vehicle model", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.locator(".vt-summary-strip")).toHaveCount(0);
  await expect(page.locator(".vt-car")).toHaveCount(0);
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/vehicle/"))
      posts.push(r.url());
  });
  const dialog = page.waitForEvent("dialog");
  const click = page
    .getByRole("button", { name: "Start DID reads", exact: true })
    .click();
  const prompt = await dialog;
  expect(prompt.message()).toContain("Select a vehicle model");
  await prompt.accept();
  await click;
  expect(posts).toEqual([]);
  await page.getByLabel("Diagnostic data source").selectOption("replay");
  const replayDialog = page.waitForEvent("dialog");
  const replayClick = page
    .getByRole("button", { name: "Start replay", exact: true })
    .click();
  const replayPrompt = await replayDialog;
  expect(replayPrompt.message()).toContain("Select a vehicle model");
  await replayPrompt.accept();
  await replayClick;
  expect(posts).toEqual([]);
  await page
    .getByLabel("Vehicle model", { exact: true })
    .selectOption("byd-dolphin-jp");
  await expect(page.locator(".vt-summary-strip")).toContainText("—");
  await page.getByRole("button", { name: "Powertrain", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Front powertrain" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause vehicle display" }).click();
  await expect(
    page.getByText("Display paused · Backend capture and saving continue"),
  ).toBeVisible();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await expect(page.locator(".workspace-header")).toHaveCount(1);
  expect(await page.locator(".workspace-nav button").allTextContents()).toEqual(
    ["Raw CAN", "Vehicle"],
  );
  expect(
    await page.locator("body").evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe("16px");
  await page.getByLabel("Vehicle model", { exact: true }).selectOption("");
  await expect(page.locator(".vt-car")).toHaveCount(0);
  expect(errors).toEqual([]);
});

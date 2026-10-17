import { test, expect } from "@playwright/test";
test("Mock monitor, pause, charts, record, export and replay", async ({
  page,
  request,
}) => {
  await request.post("/api/disconnect", { data: {} });
  await request.post("/api/connect", { data: { kind: "mock" } });
  await request.post("/api/capture/start", { data: {} });
  const sessionsBefore = (await (await request.get("/api/sessions")).json())
    .length;
  expect(
    (await (await request.get("/api/status")).json()).recording_id,
  ).toBeNull();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Live only · Not saving")).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "18FF5010" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Raw byte time series" }).locator("canvas"),
  ).toBeVisible();
  await expect(page.locator(".changed").first()).toBeVisible();
  await page.getByLabel("Search CAN ID").fill("18FF");
  await expect(page.locator(".data-row")).toHaveCount(1);
  await page.getByLabel("Search CAN ID").fill("");
  await page.getByRole("button", { name: "Pause display" }).click();
  const frozen = await page.locator(".data-row").first().innerText();
  const before = (await (await request.get("/api/status")).json()).stats
    .received_frames;
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/status")).json()).stats.received_frames,
    )
    .toBeGreaterThan(before + 10);
  expect(await page.locator(".data-row").first().innerText()).toBe(frozen);
  await page.getByRole("button", { name: "Resume display" }).click();
  await page.locator("#profile").selectOption("byd-dolphin-jp");
  await expect
    .poll(
      async () => (await (await request.get("/api/status")).json()).profile_id,
    )
    .toBe("byd-dolphin-jp");
  await page.getByLabel("Session name").fill("Browser mock validation");
  expect((await (await request.get("/api/sessions")).json()).length).toBe(
    sessionsBefore,
  );
  await page.getByRole("button", { name: "Start saving", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop saving", exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/sessions")).json())[0].frame_count,
    )
    .toBeGreaterThan(5);
  await page.getByRole("button", { name: "Stop saving", exact: true }).click();
  const latest = (await (await request.get("/api/sessions")).json())[0];
  const exported = await request.get(`/api/sessions/${latest.id}/export`);
  expect(exported.ok()).toBeTruthy();
  expect((await exported.text()).split("\n")[0]).toContain('"data":');
  await page
    .getByRole("button", {
      name: "Replay Browser mock validation",
      exact: true,
    })
    .first()
    .click();
  await expect
    .poll(
      async () => (await (await request.get("/api/status")).json()).config.kind,
    )
    .toBe("replay");
  await expect(page.locator(".source-tag")).toHaveText("RECORDED PLAYBACK");
  expect(errors).toEqual([]);
});

test("theme follows the system, supports icon-only overrides and persists the choice", async ({
  page,
  request,
}) => {
  await request.post("/api/disconnect", { data: {} });
  await request.post("/api/connect", { data: { kind: "mock" } });
  await request.post("/api/capture/start", { data: {} });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-preference",
    "system",
  );
  await expect(page.locator(".theme-toggle")).toHaveText("");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: "Theme: system. Switch to light" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "light" });
  await page
    .getByRole("button", { name: "Theme: light. Switch to dark" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: "Theme: dark. Switch to system" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-preference",
    "system",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".data-row")).toHaveCount(5);
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/status")).json()).stats.received_frames,
    )
    .toBeGreaterThan(200);
  await page.screenshot({
    path: "test-results/workspace-light.png",
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "test-results/workspace-dark.png",
    fullPage: true,
  });
  expect(
    (await (await request.get("/api/status")).json()).recording_id,
  ).toBeNull();
});
test("live workspace screenshot and narrow layout", async ({
  page,
  request,
}) => {
  await request.post("/api/disconnect", { data: {} });
  await request.post("/api/connect", { data: { kind: "mock" } });
  await request.post("/api/capture/start", { data: {} });
  await page.goto("/");
  await expect(page.locator(".data-row")).toHaveCount(5);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await page.locator("body").innerText()).not.toMatch(/\p{Script=Han}/u);
  await expect.poll(async () => page.locator(".chart canvas").count()).toBe(3);
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/status")).json()).stats.received_frames,
    )
    .toBeGreaterThan(200);
  await page.screenshot({ path: "test-results/workspace.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

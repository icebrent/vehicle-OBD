import { test, expect } from "@playwright/test";
import type { Status } from "../src/types";

test("HTTP and websocket errors share one dismissible banner", async ({
  page,
  request,
}) => {
  const status: Status = await (await request.get("/api/status")).json();
  status.state = "disconnected";
  status.last_error = null;
  let sendStatus = (_error: string | null) => {};
  await page.routeWebSocket("**/ws", (socket) => {
    sendStatus = (error) => {
      status.last_error = error;
      socket.send(
        JSON.stringify({
          type: "snapshot",
          sequence: 1,
          status,
          rows: [],
          frames: [],
        }),
      );
    };
    sendStatus(null);
  });
  const message =
    "Hardware access is locked. After manual confirmation, set CAN_ENABLE_HARDWARE=1 and restart";
  let backendFirst = true;
  await page.route("**/api/connect", async (route) => {
    if (backendFirst) sendStatus(message);
    await route.fulfill({ status: 409, json: { detail: message } });
  });
  await page.goto("/");
  const connect = page.getByRole("button", { name: "Connect", exact: true });
  await connect.click();
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(page.getByRole("alert")).toContainText(message);
  await page.getByRole("button", { name: "Dismiss error" }).click();
  sendStatus(message);
  await expect(page.getByRole("alert")).toHaveCount(0);
  sendStatus(null);
  backendFirst = false;
  await connect.click();
  await expect(page.getByRole("alert")).toContainText(message);
  sendStatus(message);
  await expect(page.getByRole("alert")).toHaveCount(1);
  sendStatus("Independent transport error");
  await expect(page.getByRole("alert")).toHaveCount(2);
  await expect(page.getByRole("alert").last()).toContainText(
    "Independent transport error",
  );
});

import { expect, test } from "@playwright/test";

test.describe("Editor to Dungeon roundtrip", () => {
  test("play layout applies postFX after camera ready and supports debug transitions", async ({ page }) => {
    const suspiciousLogs: string[] = [];

    page.on("console", (msg) => {
      const text = msg.text();
      const type = msg.type();
      if (type === "error") {
        suspiciousLogs.push(text);
        return;
      }
      if (text.includes("[QA] PostFXConfig could not apply without an active camera")) {
        suspiciousLogs.push(text);
      }
      if (text.includes("[QA] SceneManager failed to activate scene")) {
        suspiciousLogs.push(text);
      }
    });

    await page.goto("/");

    await page.waitForFunction(() => Boolean((window as unknown as { __qaPlayer?: unknown }).__qaPlayer), null, {
      timeout: 60_000,
    });

    await page.keyboard.press("F6");

    await page.getByText("Editor Palette", { exact: true }).waitFor({ timeout: 60_000 });

    const playLayoutButton = page.getByRole("button", { name: "Play This Layout" });
    await expect(playLayoutButton).toBeDisabled();

    const canvas = page.locator("#renderCanvas");
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    if (!box) {
      throw new Error("renderCanvas bounding box unavailable");
    }

    const startX = box.x + box.width / 2 - 80;
    const startY = box.y + box.height / 2;
    const endX = startX + 160;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, startY, { steps: 6 });
    await page.mouse.up();

    await expect(playLayoutButton).toBeEnabled();

    await playLayoutButton.click();
    await page.waitForFunction(
      () => (window as any).__qaActiveSceneName === "DungeonScene",
      null,
      { timeout: 120_000 }
    );
    await expect(page.getByRole("button", { name: "Play This Layout" })).toHaveCount(0);

    await page.keyboard.press("F6");
    await page.getByText("Editor Palette", { exact: true }).waitFor({ timeout: 60_000 });

    await page.keyboard.press("F5");
    await page.waitForFunction(
      () => (window as any).__qaActiveSceneName === "HideoutScene",
      null,
      { timeout: 120_000 }
    );

    expect(suspiciousLogs).toEqual([]);
  });
});

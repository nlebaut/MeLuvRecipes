import { expect, test } from "@playwright/test";

test("the site exposes its SVG favicon", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "./favicon.svg");
  expect((await page.request.get("/favicon.svg")).headers()["content-type"]).toContain("image/svg+xml");
});

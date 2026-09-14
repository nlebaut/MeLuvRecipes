import { expect, test } from "@playwright/test";

test("recipe steps support keyboard navigation after activation", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-recipe-card] a").first().click();

  const steps = page.locator("[data-step-card]");
  const firstStep = steps.first().getByRole("button");
  await firstStep.click();
  await expect(firstStep).toHaveAttribute("aria-pressed", "true");

  await firstStep.press("ArrowDown");
  await expect(steps.nth(1).getByRole("button")).toBeFocused();
  await expect(steps.nth(1).getByRole("button")).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("End");
  await expect(steps.last().getByRole("button")).toBeFocused();
});

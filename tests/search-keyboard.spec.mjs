import { expect, test } from "@playwright/test";

test("search suggestions support keyboard selection and dismissal", async ({ page }) => {
  await page.goto("/");

  const input = page.getByLabel("Chercher une recette");
  const results = page.locator("[data-search-results]");
  await input.fill("a");
  await expect(results.locator(".search-hit")).toHaveCount(8);
  await expect(input).toHaveAttribute("aria-activedescendant", "search-hit-0");

  await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-activedescendant", "search-hit-1");

  await input.press("Escape");
  await expect(results).toBeHidden();

  await input.fill("a");
  await input.press("ArrowDown");
  const destination = await results.locator(".search-hit-active").evaluate((element) => element.href);
  await Promise.all([page.waitForURL(destination), input.press("Enter")]);
});

import { expect, test } from "@playwright/test";

const firstLetter = (title) => title
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .toUpperCase()
  .replace(/^[^A-Z]+/, "")
  .charAt(0);

test("the A filter shows matching recipes and toggles off", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error));

  await page.goto("/");

  const cards = page.locator("[data-recipe-card]");
  const total = await cards.count();
  const aButton = page.getByRole("button", { name: "A", exact: true });

  await expect(aButton).toHaveAttribute("aria-pressed", "false");
  await aButton.click();
  await expect(aButton).toHaveAttribute("aria-pressed", "true");

  const visibleTitles = await page.locator("[data-recipe-card]:visible").evaluateAll((elements) => {
    return elements.map((element) => element.dataset.title);
  });
  expect(visibleTitles.length).toBeGreaterThan(0);
  expect(visibleTitles.length).toBeLessThan(total);
  expect(visibleTitles.every((title) => firstLetter(title) === "A")).toBe(true);

  await aButton.click();
  await expect(aButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-recipe-card]:visible")).toHaveCount(total);
  expect(errors).toEqual([]);
});

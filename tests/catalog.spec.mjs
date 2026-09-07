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

test("the search page shows every matching recipe", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error));

  await page.goto("/");
  const input = page.getByRole("searchbox", { name: "Chercher une recette" });
  await input.fill("a");

  const suggestions = page.locator("[data-search-results] .search-hit");
  const allResultsLink = page.locator("[data-search-all-results]");
  await expect(suggestions).toHaveCount(8);
  await expect(allResultsLink).toBeVisible();
  expect(await allResultsLink.evaluate((element) => element.previousElementSibling?.className)).toBe("search-results-header");

  const total = Number((await page.locator(".search-results-header").innerText()).match(/^\d+/)[0]);
  await allResultsLink.click();

  await expect(page).toHaveURL(/\/recherche\/\?q=a/);
  await expect(page.locator("[data-search-page-results] .search-hit")).toHaveCount(total);
  expect(errors).toEqual([]);
});

test("the search page handles no result", async ({ page }) => {
  await page.goto("/recherche/?q=zzzz-not-found");

  await expect(page.locator("[data-search-page-results]")).toContainText("Aucune recette ne correspond à cette recherche.");
});

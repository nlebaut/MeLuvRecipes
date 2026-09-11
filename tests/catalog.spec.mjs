import { expect, test } from "@playwright/test";

const firstLetter = (title) => title
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .toUpperCase()
  .replace(/^[^A-Z]+/, "")
  .charAt(0);

test("the search input has combobox semantics", async ({ page }) => {
  await page.goto("/");

  const search = page.getByLabel("Chercher une recette");
  await expect(search).toHaveAttribute("role", "combobox");
  await expect(search).toHaveAttribute("aria-controls", "site-search-results");
  await expect(search).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("[data-site-search]")).not.toHaveAttribute("role", "combobox");
});

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
  await expect(page.locator("[data-recipe-card]:visible")).toHaveCount(20);
  expect(errors).toEqual([]);
});

test("the catalog paginates recipes by 20", async ({ page }) => {
  await page.goto("/");

  const cards = page.locator("[data-recipe-card]");
  const nextButton = page.getByRole("button", { name: "Suivantes" });
  const previousButton = page.getByRole("button", { name: "Précédentes" });

  await expect(cards.filter({ visible: true })).toHaveCount(20);
  await expect(page.getByRole("button", { name: "Aller à la page 1" })).toHaveAttribute("aria-current", "page");
  await expect(previousButton).toBeDisabled();

  const firstPageTitles = await page.locator("[data-recipe-card]:visible").evaluateAll((elements) => elements.map((element) => element.dataset.title));
  await nextButton.click();
  await expect(cards.filter({ visible: true })).toHaveCount(20);
  await expect(page.getByRole("button", { name: "Aller à la page 2" })).toHaveAttribute("aria-current", "page");
  await expect(previousButton).toBeEnabled();
  const secondPageTitles = await page.locator("[data-recipe-card]:visible").evaluateAll((elements) => elements.map((element) => element.dataset.title));

  expect(secondPageTitles).not.toEqual(firstPageTitles);

  await page.getByRole("button", { name: "Aller à la page 7" }).click();
  await expect(page.getByRole("button", { name: "Aller à la page 7" })).toHaveAttribute("aria-current", "page");
  await expect(cards.filter({ visible: true })).toHaveCount(20);
});

test("the search page shows every matching recipe", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error));

  await page.goto("/");
  const input = page.getByLabel("Chercher une recette");
  await expect(page.locator("[data-search-results]")).toBeHidden();
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

test("the search index keeps only displayed recipe metadata", async ({ request }) => {
  const response = await request.get("/search.json");
  const { recipes } = await response.json();

  expect(response.ok()).toBe(true);
  expect(recipes.length).toBeGreaterThan(0);
  expect(Object.keys(recipes[0].metadata).sort()).toEqual([
    "cookTime",
    "cookTimeText",
    "description",
    "prepTime",
    "prepTimeText",
    "servings",
    "servingsText",
    "time",
    "timeText",
    "title",
  ]);
  expect(recipes[0].search.bodyText).toBeTruthy();
});

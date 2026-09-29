import { expect, test } from "@playwright/test";

test("search filters preparation plus cooking time at 20 and 40 minutes", async ({ page }) => {
  const durations = [["19 min", "0 min"], ["10 min", "10 min"], ["20 min", "20 min"], ["1 h", "0 min"], ...Array.from({ length: 8 }, () => ["15 min", "30 min"])];
  const recipes = durations.map(([prepTime, cookTime], index) => ({
    title: `Test ${index}`,
    slug: `test-${index}`,
    metadata: { prepTime, cookTime },
  }));
  await page.route("**/search.json", (route) => route.fulfill({ json: { recipes } }));
  await page.goto("/");
  await expect(page.locator('script[src*="js/search.js"]')).toHaveAttribute("src", /search\.js\?v=[a-f0-9]{64}$/);
  await page.getByLabel("Chercher une recette").fill("Test");

  const results = page.locator("[data-search-results]");
  const select = results.getByRole("combobox", { name: "Durée totale" });
  await expect(select).toBeVisible();
  await expect(results.locator(".search-results-header")).toContainText("12 recettes trouvées");

  await select.selectOption("under20");
  await expect(results.locator(".search-results-header")).toContainText("1 recette trouvée");
  await expect(results.locator(".search-hit-title")).toHaveText(["Test 0"]);

  await select.selectOption("20to40");
  await expect(results.locator(".search-results-header")).toContainText("2 recettes trouvées");
  await expect(results.locator(".search-hit-title")).toHaveText(["Test 1", "Test 2"]);

  await select.selectOption("");
  await expect(results.locator(".search-results-header")).toContainText("12 recettes trouvées");

  await select.selectOption("over40");
  await expect(results.locator(".search-results-header")).toContainText("9 recettes trouvées");
  await expect(results.locator(".search-hit")).toHaveCount(8);
  await results.getByRole("link", { name: "Voir les 9 résultats" }).click();
  await expect(page).toHaveURL(/\/recherche\/\?q=Test&duree=over40/);
  await expect(page.locator("[data-search-page-results] .search-hit")).toHaveCount(9);
  await expect(page.locator("[data-search-page-results]")).toContainText("Test 3");
});

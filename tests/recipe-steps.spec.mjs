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

test("recipe ingredients scale with the selected number of portions", async ({ page }) => {
  await page.goto("/recipes/saumon-poele-aux-asperges/");

  const input = page.getByRole("spinbutton", { name: "Portions" });
  const ingredients = page.locator("#ingredients [data-ingredient-quantity]");
  const firstStep = page.locator("[data-step-card]").first().locator(".step-copy");

  await expect(input).toHaveValue("4");
  await expect(ingredients.nth(0)).toHaveText("(420g)");
  await expect(ingredients.nth(1)).toHaveText("(4)");
  await expect(firstStep).toContainText("asperges (420g)");
  await expect(firstStep).toContainText("dos de saumon (4)");

  await input.fill("2");
  await expect(page.locator("[data-servings-display]")).toHaveText("2 personnes");
  await expect(ingredients.nth(0)).toHaveText("(210g)");
  await expect(ingredients.nth(1)).toHaveText("(2)");
  await expect(firstStep).toContainText("asperges (210g)");
  await expect(firstStep).toContainText("dos de saumon (2)");

  await page.getByRole("button", { name: "Augmenter le nombre de portions" }).click();
  await expect(input).toHaveValue("3");
  await expect(ingredients.nth(0)).toHaveText("(315g)");
  await expect(ingredients.nth(1)).toHaveText("(3)");
  await expect(ingredients.nth(3)).toHaveText("(1,5 càs)");
});

test("recipes without a numeric serving count do not show the portions control", async ({ page }) => {
  await page.goto("/recipes/lasagnes-de-pommes-de-terre-garniture-bechamel-poireaux-champignons-et-comte/");

  await expect(page.getByRole("spinbutton", { name: "Portions" })).toHaveCount(0);
});

test("fraction quantities scale in the ingredient list and steps", async ({ page }) => {
  await page.goto("/recipes/salade-de-courgettes-aux-lardons-et-oignons-nouveaux/");
  await page.getByRole("spinbutton", { name: "Portions" }).fill("6");

  await expect(page.locator("#ingredients li").filter({ hasText: "oignons nouveaux" })).toContainText("(1 botte)");
  await expect(page.locator(".step-copy").filter({ hasText: "oignons nouveaux" })).toContainText("1 botte d’oignons nouveaux");
});

test("serving ranges become a single count when edited", async ({ page }) => {
  await page.goto("/recipes/one-pot-riz-saute-aux-champignons-navets-et-tofu-fume/");
  await page.getByRole("spinbutton", { name: "Portions" }).fill("4");
  await expect(page.locator("[data-servings-display]")).toHaveText("4 portions");

  await page.goto("/recipes/salade-de-chou-rave-et-radis-au-riz-et-au-fromage-de-chevre/");
  await page.getByRole("spinbutton", { name: "Portions" }).fill("4");
  await expect(page.locator("[data-servings-display]")).toHaveText("4 personnes");

  await page.goto("/recipes/pickles-de-betteraves-rouges/");
  await page.getByRole("spinbutton", { name: "Portions" }).fill("2");
  await expect(page.locator("[data-servings-display]")).toHaveText("2 bocaux de 50cl");
});

test("amounts written in steps scale without duplicating ingredient quantities", async ({ page }) => {
  await page.goto("/recipes/tarte-phyllo-courgettes-ricotta-pesto-parmesan-et-miel/");

  const firstStep = page.locator(".step-copy").first();
  await expect(firstStep).toHaveText(/Lavez 3 courgettes/);
  await expect(firstStep).not.toContainText("courgettes (3)");

  await page.getByRole("spinbutton", { name: "Portions" }).fill("2");
  await expect(firstStep).toHaveText(/Lavez 1,5 courgettes/);
  await expect(page.locator(".step-copy").filter({ hasText: "Mélangez" })).toContainText("125 g");
  await expect(page.locator("#ingredients li").filter({ hasText: "ricotta" })).toContainText("(125g)");
  await expect(page.locator("#ingredients li").filter({ hasText: "feuilles de pâte phyllo" })).toContainText("(2,5-3 feuilles)");
  await expect(page.locator(".step-copy").filter({ hasText: "feuilles de pâte phyllo" })).toContainText("2,5-3 feuilles de pâte phyllo");
});

test("written ranges with à scale in newly added recipes", async ({ page }) => {
  await page.goto("/recipes/pommes-de-terre-dorees-au-celeri-branche/");

  const step = page.locator(".step-copy").first();
  await expect(step).toContainText("4 à 6 pommes de terre moyennes");
  await expect(step).not.toContainText("pommes de terre moyennes (5)");

  await page.getByRole("spinbutton", { name: "Portions" }).fill("2");
  await expect(step).toContainText("2 à 3 pommes de terre moyennes");
  await expect(page.locator("#ingredients li").filter({ hasText: "pommes de terre moyennes" })).toContainText("(2,5)");
});

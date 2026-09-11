import { expect, test } from "@playwright/test";

test("the search index loads when the search field is focused", async ({ page }) => {
  let searchIndexRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/search.json")) {
      searchIndexRequests += 1;
    }
  });

  await page.goto("/");
  expect(searchIndexRequests).toBe(0);

  const searchRequest = page.waitForRequest("**/search.json");
  await page.getByLabel("Chercher une recette").focus();
  await searchRequest;
  expect(searchIndexRequests).toBe(1);
});

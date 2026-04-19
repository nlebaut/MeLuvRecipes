const root = document.querySelector("[data-site-search]");

if (root) {
  const input = root.querySelector(".search-input");
  const results = root.querySelector("[data-search-results]");
  const searchIndexUrl = new URL("../search.json", import.meta.url);
  const siteRootUrl = new URL("../", import.meta.url);

  const response = await fetch(searchIndexUrl);
  const payload = await response.json();
  const recipes = payload.recipes ?? [];

  const renderResults = (matches, query) => {
    if (!query) {
      results.hidden = true;
      results.innerHTML = "";
      return;
    }

    if (matches.length === 0) {
      results.hidden = false;
      results.innerHTML = `<p class="search-empty">Aucune recette trouvée pour "${query}".</p>`;
      return;
    }

    results.hidden = false;
    results.innerHTML = matches
      .slice(0, 8)
      .map(
        (recipe) => {
          const recipePath = (recipe.url ?? `recipes/${recipe.slug}/`).replace(/^\/+/, "");

          return `
          <a class="search-hit" href="${new URL(recipePath, siteRootUrl).pathname}">
            <span class="search-hit-title">${recipe.title}</span>
            <span class="search-hit-meta">${recipe.metadata?.servingsText || recipe.metadata?.servings || ""}</span>
          </a>
        `;
        },
      )
      .join("");
  };

  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    const matches = !query
      ? []
      : recipes.filter((recipe) => (recipe.searchText ?? "").toLowerCase().includes(query));

    renderResults(matches, input.value.trim());
  });

  document.addEventListener("click", (event) => {
    if (!root.contains(event.target)) {
      results.hidden = true;
    }
  });

  input.addEventListener("focus", () => {
    if (results.innerHTML.trim()) {
      results.hidden = false;
    }
  });
}

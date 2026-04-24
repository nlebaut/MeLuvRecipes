const root = document.querySelector("[data-site-search]");

if (root) {
  const input = root.querySelector(".search-input");
  const results = root.querySelector("[data-search-results]");
  const searchIndexUrl = new URL("../search.json", import.meta.url);
  const siteRootUrl = new URL("../", import.meta.url);
  let recipes = [];
  let activeIndex = -1;

  root.setAttribute("role", "combobox");
  root.setAttribute("aria-haspopup", "listbox");
  root.setAttribute("aria-owns", "site-search-results");
  root.setAttribute("aria-expanded", "false");
  results.id = "site-search-results";
  results.setAttribute("role", "listbox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", results.id);

  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");

  const metaLine = (recipe) => {
    const parts = [
      recipe.metadata?.servingsText || recipe.metadata?.servings,
      recipe.metadata?.prepTimeText ? `Prep ${recipe.metadata.prepTimeText}` : null,
      recipe.metadata?.cookTimeText ? `Cuisson ${recipe.metadata.cookTimeText}` : null,
      recipe.metadata?.timeText ? `Total ${recipe.metadata.timeText}` : null,
    ].filter(Boolean);

    return parts.join(" • ");
  };

  const closeResults = () => {
    activeIndex = -1;
    results.hidden = true;
    root.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  };

  const openResults = () => {
    results.hidden = false;
    root.setAttribute("aria-expanded", "true");
  };

  const scoreRecipe = (recipe, query) => {
    const normalizedQuery = query.toLowerCase();
    const title = (recipe.title ?? "").toLowerCase();
    const ingredients = (recipe.search?.ingredientsText ?? "").toLowerCase();
    const summary = (recipe.description ?? recipe.summary ?? "").toLowerCase();
    const body = (recipe.search?.bodyText ?? "").toLowerCase();

    let score = 0;
    if (title.startsWith(normalizedQuery)) {
      score += 120;
    } else if (title.includes(normalizedQuery)) {
      score += 80;
    }
    if (ingredients.includes(normalizedQuery)) {
      score += 50;
    }
    if (summary.includes(normalizedQuery)) {
      score += 25;
    }
    if (body.includes(normalizedQuery)) {
      score += 10;
    }

    return score;
  };

  const setActiveResult = (index) => {
    const items = [...results.querySelectorAll(".search-hit")];
    items.forEach((item, itemIndex) => {
      const active = itemIndex === index;
      item.classList.toggle("search-hit-active", active);
      item.setAttribute("aria-selected", String(active));
      if (active) {
        input.setAttribute("aria-activedescendant", item.id);
        item.scrollIntoView({ block: "nearest" });
      }
    });
    activeIndex = index;
  };

  const renderResults = (matches, query) => {
    if (!query) {
      results.innerHTML = "";
      closeResults();
      return;
    }

    if (matches.length === 0) {
      results.innerHTML = `<p class="search-empty">Aucune recette trouvée pour "${escapeHtml(query)}".</p>`;
      openResults();
      return;
    }

    const items = matches
      .slice(0, 8)
      .map((recipe, index) => {
        const recipePath = (recipe.url ?? `recipes/${recipe.slug}/`).replace(/^\/+/, "");
        const summary = recipe.description ?? recipe.summary ?? "";

        return `
          <a
            class="search-hit"
            id="search-hit-${index}"
            role="option"
            aria-selected="false"
            href="${new URL(recipePath, siteRootUrl).pathname}"
          >
            <span class="search-hit-title">${escapeHtml(recipe.title)}</span>
            <span class="search-hit-meta">${escapeHtml(metaLine(recipe))}</span>
            <span class="search-hit-summary">${escapeHtml(summary.slice(0, 140))}</span>
          </a>
        `;
      })
      .join("");

    results.innerHTML = `<p class="search-results-header">${matches.length} recette${matches.length > 1 ? "s" : ""} trouvée${matches.length > 1 ? "s" : ""}</p>${items}`;
    openResults();
    setActiveResult(0);
  };

  const updateResults = () => {
    const query = input.value.trim();
    if (!query) {
      renderResults([], "");
      return;
    }

    const matches = recipes
      .map((recipe) => ({ recipe, score: scoreRecipe(recipe, query) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.recipe.title.localeCompare(right.recipe.title, "fr", { sensitivity: "base" }))
      .map((entry) => entry.recipe);

    renderResults(matches, query);
  };

  try {
    const response = await fetch(searchIndexUrl);
    if (!response.ok) {
      throw new Error(`Unexpected response: ${response.status}`);
    }
    const payload = await response.json();
    recipes = payload.recipes ?? [];
  } catch {
    input.disabled = true;
    results.hidden = false;
    results.innerHTML = "<p class=\"search-empty\">La recherche est indisponible pour le moment.</p>";
  }

  input.addEventListener("input", updateResults);

  input.addEventListener("keydown", (event) => {
    const items = [...results.querySelectorAll(".search-hit")];

    if (event.key === "Escape") {
      closeResults();
      return;
    }

    if (results.hidden || items.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResult((activeIndex + 1) % items.length);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResult((activeIndex - 1 + items.length) % items.length);
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      items[activeIndex].click();
    }
  });

  document.addEventListener("click", (event) => {
    if (!root.contains(event.target)) {
      closeResults();
    }
  });

  input.addEventListener("focus", () => {
    if (results.innerHTML.trim() && input.value.trim()) {
      openResults();
      if (activeIndex < 0) {
        setActiveResult(0);
      }
    }
  });
}

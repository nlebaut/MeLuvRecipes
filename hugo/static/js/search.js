const root = document.querySelector("[data-site-search]");
const searchPage = document.querySelector("[data-search-page]");
const searchIndexUrl = new URL("../search.json", import.meta.url);
const siteRootUrl = new URL("../", import.meta.url);
let recipesPromise;

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

const recipeUrl = (recipe) => {
  const path = (recipe.url ?? `recipes/${recipe.slug}/`).replace(/^\/+/, "");
  return new URL(path, siteRootUrl).pathname;
};

const searchUrl = (query) => {
  const url = new URL("recherche/", siteRootUrl);
  url.searchParams.set("q", query);
  return `${url.pathname}${url.search}`;
};

const renderRecipe = (recipe, index, asOption = false) => {
  const summary = recipe.description ?? recipe.summary ?? "";
  const optionAttributes = asOption
    ? `id="search-hit-${index}" role="option" aria-selected="false"`
    : "";

  return `
    <a class="search-hit" ${optionAttributes} href="${recipeUrl(recipe)}">
      <span class="search-hit-title">${escapeHtml(recipe.title)}</span>
      <span class="search-hit-meta">${escapeHtml(metaLine(recipe))}</span>
      <span class="search-hit-summary">${escapeHtml(summary.slice(0, 140))}</span>
    </a>
  `;
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

const findMatches = (recipes, query) => recipes
  .map((recipe) => ({ recipe, score: scoreRecipe(recipe, query) }))
  .filter((entry) => entry.score > 0)
  .sort((left, right) => right.score - left.score || left.recipe.title.localeCompare(right.recipe.title, "fr", { sensitivity: "base" }))
  .map((entry) => entry.recipe);

const loadRecipes = () => {
  recipesPromise ??= fetch(searchIndexUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Unexpected response: ${response.status}`);
      }
      return response.json();
    })
    .then((payload) => payload.recipes ?? []);

  return recipesPromise;
};

if (root) {
  const input = root.querySelector(".search-input");
  const results = root.querySelector("[data-search-results]");
  let recipes;
  let loading = false;
  let activeIndex = -1;

  results.id = "site-search-results";
  results.setAttribute("role", "listbox");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-haspopup", "listbox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", results.id);
  input.setAttribute("aria-expanded", "false");

  const closeResults = () => {
    activeIndex = -1;
    results.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  };

  const openResults = () => {
    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
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

    const items = matches.slice(0, 8).map((recipe, index) => renderRecipe(recipe, index, true)).join("");
    const allResultsLink = matches.length > 8
      ? `<a class="search-all-results" data-search-all-results href="${searchUrl(query)}">Voir les ${matches.length} résultats</a>`
      : "";

    results.innerHTML = `<p class="search-results-header">${matches.length} recette${matches.length > 1 ? "s" : ""} trouvée${matches.length > 1 ? "s" : ""}</p>${allResultsLink}${items}`;
    openResults();
    setActiveResult(0);
  };

  const updateResults = () => {
    const query = input.value.trim();
    if (!query) {
      renderResults([], query);
      return;
    }

    if (!recipes) {
      results.innerHTML = "<p class=\"search-empty\">Chargement de la recherche…</p>";
      openResults();
      loadSearchIndex();
      return;
    }

    renderResults(findMatches(recipes, query), query);
  };

  const loadSearchIndex = () => {
    if (loading || recipes) {
      return;
    }

    loading = true;
    loadRecipes()
      .then((loadedRecipes) => {
        recipes = loadedRecipes;
        updateResults();
      })
      .catch(() => {
        input.disabled = true;
        results.hidden = false;
        results.innerHTML = "<p class=\"search-empty\">La recherche est indisponible pour le moment.</p>";
      });
  };

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
    loadSearchIndex();
    if (results.innerHTML.trim() && input.value.trim()) {
      openResults();
      if (activeIndex < 0) {
        setActiveResult(0);
      }
    }
  });
}

if (searchPage) {
  const query = new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
  const status = searchPage.querySelector("[data-search-page-status]");
  const results = searchPage.querySelector("[data-search-page-results]");

  if (!query) {
    status.textContent = "Saisissez une recherche pour trouver une recette.";
  } else {
    const pageInput = root?.querySelector(".search-input");
    if (pageInput) {
      pageInput.value = query;
    }

    loadRecipes()
      .then((recipes) => {
        const matches = findMatches(recipes, query);
        status.textContent = `${matches.length} recette${matches.length > 1 ? "s" : ""} trouvée${matches.length > 1 ? "s" : ""} pour « ${query} »`;
        results.innerHTML = matches.length > 0
          ? matches.map((recipe, index) => renderRecipe(recipe, index)).join("")
          : "<p class=\"search-empty\">Aucune recette ne correspond à cette recherche.</p>";
      })
      .catch(() => {
        status.textContent = "La recherche est indisponible pour le moment.";
      });
  }
}

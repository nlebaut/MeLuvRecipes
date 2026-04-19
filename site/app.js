const state = {
  catalog: [],
  filtered: [],
};

const elements = {
  search: document.querySelector("#recipe-search"),
  count: document.querySelector("#recipe-count"),
  list: document.querySelector("#recipe-list"),
  view: document.querySelector("#recipe-view"),
};

function formatMeta(recipe) {
  const parts = [];

  if (recipe.metadata?.servingsText || recipe.metadata?.servings) {
    parts.push(recipe.metadata.servingsText || `${recipe.metadata.servings} pers.`);
  }

  if (recipe.metadata?.prepTimeText || recipe.metadata?.prepTime) {
    parts.push(`Prep ${recipe.metadata.prepTimeText || recipe.metadata.prepTime}`);
  }

  if (recipe.metadata?.cookTimeText || recipe.metadata?.cookTime) {
    parts.push(`Cuisson ${recipe.metadata.cookTimeText || recipe.metadata.cookTime}`);
  }

  return parts.join(" • ");
}

function recipeHash(slug) {
  return `#recipe/${slug}`;
}

function activeSlug() {
  return window.location.hash.startsWith("#recipe/")
    ? decodeURIComponent(window.location.hash.slice("#recipe/".length))
    : null;
}

function renderList() {
  const current = activeSlug();

  elements.count.textContent = `${state.filtered.length} recette${state.filtered.length > 1 ? "s" : ""}`;
  elements.list.innerHTML = state.filtered
    .map((recipe) => {
      const activeClass = recipe.slug === current ? " recipe-card-active" : "";
      return `
        <a class="recipe-card${activeClass}" href="${recipeHash(recipe.slug)}">
          <span class="recipe-card-title">${recipe.title}</span>
          <span class="recipe-card-meta">${formatMeta(recipe) || "Recette Cooklang"}</span>
          <span class="recipe-card-summary">${recipe.summary || "Aperçu indisponible"}</span>
        </a>
      `;
    })
    .join("");
}

async function renderRecipe(slug) {
  if (!slug) {
    return;
  }

  const response = await fetch(`./api/recipes/${encodeURIComponent(slug)}.json`);

  if (!response.ok) {
    elements.view.innerHTML = `
      <div class="placeholder-card">
        <p class="eyebrow">Erreur</p>
        <h2>Recette introuvable</h2>
        <p>Le fichier généré pour cette recette n'a pas été trouvé.</p>
      </div>
    `;
    return;
  }

  const recipe = await response.json();
  const meta = [
    recipe.metadata?.servingsText || recipe.metadata?.servings
      ? `<span>Servings: ${recipe.metadata.servingsText || recipe.metadata.servings}</span>`
      : "",
    recipe.metadata?.prepTimeText || recipe.metadata?.prepTime
      ? `<span>Prep: ${recipe.metadata.prepTimeText || recipe.metadata.prepTime}</span>`
      : "",
    recipe.metadata?.cookTimeText || recipe.metadata?.cookTime
      ? `<span>Cook: ${recipe.metadata.cookTimeText || recipe.metadata.cookTime}</span>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const ingredients =
    recipe.ingredients.length > 0
      ? `
        <section class="recipe-block">
          <h3>Ingredients</h3>
          <ul class="chip-list">
            ${recipe.ingredients
              .map((ingredient) => {
                const amount = ingredient.quantity ? `${ingredient.quantity} ` : "";
                const units = Array.isArray(ingredient.units) ? ingredient.units.join("/") : "";
                const note = [amount.trim(), units].filter(Boolean).join(" ");
                return `<li>${note ? `${ingredient.name} (${note})` : ingredient.name}</li>`;
              })
              .join("")}
          </ul>
        </section>
      `
      : "";

  const steps = recipe.sections
    .flatMap((section) => section.steps)
    .map((step) => `<li>${step.text}</li>`)
    .join("");

  elements.view.innerHTML = `
    <article class="recipe-sheet">
      <header class="recipe-header">
        <p class="eyebrow">Cooklang recipe</p>
        <h2>${recipe.title}</h2>
        <div class="recipe-meta">${meta}</div>
        <a class="raw-link" href="./recipes/${encodeURIComponent(recipe.fileName)}" target="_blank" rel="noreferrer">Open raw .cook file</a>
      </header>
      ${ingredients}
      <section class="recipe-block">
        <h3>Steps</h3>
        <ol class="step-list">${steps}</ol>
      </section>
      <section class="recipe-block">
        <h3>Source</h3>
        <pre class="source-block">${recipe.rawSource.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]))}</pre>
      </section>
    </article>
  `;
}

function filterCatalog() {
  const query = elements.search.value.trim().toLowerCase();
  state.filtered = !query
    ? [...state.catalog]
    : state.catalog.filter((recipe) => recipe.searchText.toLowerCase().includes(query));

  renderList();

  const current = activeSlug();
  if (current && state.filtered.some((recipe) => recipe.slug === current)) {
    renderRecipe(current);
    return;
  }

  if (!current && state.filtered[0]) {
    window.location.hash = recipeHash(state.filtered[0].slug);
  }
}

window.addEventListener("hashchange", () => {
  renderList();
  const slug = activeSlug();
  if (slug) {
    renderRecipe(slug);
  }
});

elements.search.addEventListener("input", filterCatalog);

const catalogResponse = await fetch("./api/index.json");
const catalogPayload = await catalogResponse.json();
state.catalog = catalogPayload.recipes;
state.filtered = [...state.catalog];

renderList();

const slug = activeSlug();
if (slug) {
  await renderRecipe(slug);
} else if (state.filtered[0]) {
  window.location.hash = recipeHash(state.filtered[0].slug);
}

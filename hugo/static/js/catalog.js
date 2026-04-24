const page = document.querySelector("[data-catalog-page]");

if (page) {
  const form = page.querySelector("[data-catalog-controls]");
  const cards = [...page.querySelectorAll("[data-recipe-card]")];
  const emptyState = page.querySelector("[data-catalog-empty]");
  const status = page.querySelector("[data-catalog-status]");
  const list = page.querySelector(".recipe-list");

  const compareTitle = (left, right) => left.dataset.title.localeCompare(right.dataset.title, "fr", { sensitivity: "base" });

  const applyFilters = () => {
    const ingredient = (form.elements.ingredient.value || "").trim().toLowerCase();
    const maxTime = Number(form.elements.time.value || 0);
    const minServings = Number(form.elements.servings.value || 0);
    const sortKey = form.elements.sort.value || "title";

    const visibleCards = cards.filter((card) => {
      const ingredients = (card.dataset.ingredientNames || "").toLowerCase();
      const totalTime = Number(card.dataset.totalTime || 0);
      const servings = Number(card.dataset.servings || 0);

      if (ingredient && !ingredients.includes(ingredient)) {
        return false;
      }

      if (maxTime && (!totalTime || totalTime > maxTime)) {
        return false;
      }

      if (minServings && servings < minServings) {
        return false;
      }

      return true;
    });

    cards.forEach((card) => {
      card.hidden = !visibleCards.includes(card);
    });

    const sorted = [...visibleCards].sort((left, right) => {
      if (sortKey === "totalTimeMinutes") {
        return Number(left.dataset.totalTime || 9999) - Number(right.dataset.totalTime || 9999) || compareTitle(left, right);
      }

      if (sortKey === "ingredientsCount") {
        return Number(left.dataset.ingredientsCount || 9999) - Number(right.dataset.ingredientsCount || 9999) || compareTitle(left, right);
      }

      return compareTitle(left, right);
    });

    sorted.forEach((card) => {
      list.append(card);
    });

    const count = visibleCards.length;
    status.textContent = `${count} recette${count > 1 ? "s" : ""} visible${count > 1 ? "s" : ""}`;
    emptyState.hidden = count !== 0;
  };

  form.addEventListener("input", applyFilters);
  form.addEventListener("reset", () => {
    window.requestAnimationFrame(applyFilters);
  });

  applyFilters();
}

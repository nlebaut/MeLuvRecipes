const page = document.querySelector("[data-catalog-page]");

if (page) {
  const cards = [...page.querySelectorAll("[data-recipe-card]")];
  const letterButtons = [...page.querySelectorAll("[data-alphabet-letter]")];
  const emptyState = page.querySelector("[data-catalog-empty]");
  const status = page.querySelector("[data-catalog-status]");
  let activeLetter = "";

  const firstLetter = (title) => title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/^[^A-Z]+/, "")
    .charAt(0);

  const applyFilter = () => {
    const visibleCards = cards.filter((card) => {
      return !activeLetter || firstLetter(card.dataset.title || "") === activeLetter;
    });

    cards.forEach((card) => {
      card.hidden = !visibleCards.includes(card);
    });

    letterButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.alphabetLetter === activeLetter));
    });

    const count = visibleCards.length;
    status.textContent = `${count} recette${count > 1 ? "s" : ""} visible${count > 1 ? "s" : ""}`;
    emptyState.hidden = count !== 0;
  };

  letterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const letter = button.dataset.alphabetLetter;
      activeLetter = activeLetter === letter ? "" : letter;
      applyFilter();
    });
  });

  applyFilter();
}

const page = document.querySelector("[data-catalog-page]");

if (page) {
  const cards = [...page.querySelectorAll("[data-recipe-card]")];
  const letterButtons = [...page.querySelectorAll("[data-alphabet-letter]")];
  const emptyState = page.querySelector("[data-catalog-empty]");
  const status = page.querySelector("[data-catalog-status]");
  const previousButton = page.querySelector("[data-catalog-previous]");
  const nextButton = page.querySelector("[data-catalog-next]");
  const pageNumber = page.querySelector("[data-catalog-page-number]");
  const pagination = page.querySelector("[data-catalog-pagination]");
  const pageSize = 20;
  let activeLetter = "";
  let currentPage = 1;

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

    const pageCount = Math.ceil(visibleCards.length / pageSize);
    currentPage = Math.min(currentPage, pageCount || 1);
    const pageCards = visibleCards.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    cards.forEach((card) => {
      card.hidden = !pageCards.includes(card);
    });

    letterButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.alphabetLetter === activeLetter));
    });

    const count = visibleCards.length;
    status.textContent = `${count} recette${count > 1 ? "s" : ""} visible${count > 1 ? "s" : ""}`;
    emptyState.hidden = count !== 0;
    pagination.hidden = count === 0;
    previousButton.disabled = currentPage === 1;
    nextButton.disabled = currentPage === pageCount;
    pageNumber.replaceChildren(...Array.from({ length: pageCount }, (_, index) => {
      const pageButton = document.createElement("button");
      const number = index + 1;
      pageButton.className = "catalog-page-button";
      pageButton.textContent = number;
      pageButton.setAttribute("aria-label", `Aller à la page ${number}`);
      if (number === currentPage) {
        pageButton.setAttribute("aria-current", "page");
      }
      pageButton.addEventListener("click", () => {
        currentPage = number;
        applyFilter();
      });
      return pageButton;
    }));
  };

  letterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const letter = button.dataset.alphabetLetter;
      activeLetter = activeLetter === letter ? "" : letter;
      currentPage = 1;
      applyFilter();
    });
  });

  previousButton.addEventListener("click", () => {
    currentPage -= 1;
    applyFilter();
  });

  nextButton.addEventListener("click", () => {
    currentPage += 1;
    applyFilter();
  });

  applyFilter();
}

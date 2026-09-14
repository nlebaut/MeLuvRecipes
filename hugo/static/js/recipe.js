const recipePage = document.querySelector("[data-recipe-page]");

if (recipePage) {
  const steps = [...document.querySelectorAll("[data-step-card]")];
  let currentIndex = -1;

  const highlightStep = (index) => {
    currentIndex = index;
    steps.forEach((step, stepIndex) => {
      const button = step.querySelector(".step-button");
      const active = stepIndex === index;
      step.classList.toggle("step-current", active);
      button?.setAttribute("aria-pressed", String(active));
    });
  };

  steps.forEach((step, index) => {
    const button = step.querySelector(".step-button");
    button?.addEventListener("click", () => {
      highlightStep(index);
    });

    button?.addEventListener("keydown", (event) => {
      if (currentIndex < 0) {
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        highlightStep(0);
        steps[0].querySelector(".step-button")?.focus();
      }

      if (event.key === "End") {
        event.preventDefault();
        const lastIndex = steps.length - 1;
        highlightStep(lastIndex);
        steps[lastIndex].querySelector(".step-button")?.focus();
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = Math.min(currentIndex + 1, steps.length - 1);
        highlightStep(nextIndex);
        steps[nextIndex].querySelector(".step-button")?.focus();
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        const prevIndex = Math.max(currentIndex - 1, 0);
        highlightStep(prevIndex);
        steps[prevIndex].querySelector(".step-button")?.focus();
      }
    });
  });

  const servingsControl = document.querySelector("[data-servings-control]");

  if (servingsControl) {
    const baseServings = Number(servingsControl.dataset.baseServings);
    const servingsText = servingsControl.dataset.servingsText;
    const input = servingsControl.querySelector("[data-servings-input]");
    const decreaseButton = servingsControl.querySelector("[data-servings-decrease]");
    const increaseButton = servingsControl.querySelector("[data-servings-increase]");
    const servingsDisplay = document.querySelector("[data-servings-display]");
    const quantities = [...document.querySelectorAll("[data-ingredient-quantity]")];
    const minimum = Number(input.min);
    const maximum = Number(input.max);
    let currentServings = baseServings;

    const numberFromText = (value) => {
      const fraction = value.match(/^(\d+)\s*\/\s*(\d+)$/);
      if (fraction) {
        return Number(fraction[1]) / Number(fraction[2]);
      }

      const mixed = value.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
      if (mixed) {
        return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
      }

      return Number(value.replace(",", "."));
    };

    const scaledQuantity = (quantity, factor) => {
      const range = quantity.match(/^(\d+(?:[.,]\d+)?)(\s*[-–]\s*|\s+à\s+)(\d+(?:[.,]\d+)?)(.*)$/);
      if (range) {
        return `${scaledQuantity(range[1], factor)}${range[2]}${scaledQuantity(range[3], factor)}${range[4]}`;
      }

      const match = quantity.match(/^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)(.*)$/);
      if (!match) {
        return quantity;
      }

      const value = numberFromText(match[1]);
      if (!Number.isFinite(value)) {
        return quantity;
      }

      return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value * factor)}${match[2]}`;
    };

    const updateServings = (servings) => {
      currentServings = servings;
      input.value = String(servings);
      servingsDisplay.textContent = servingsText
        ? servingsText.replace(/^\d+(?:\s*[-/à]\s*\d+)?/, String(servings))
          .replace(/^(\d+) bocal\b/, (_, count) => `${count} ${Number(count) === 1 ? "bocal" : "bocaux"}`)
        : `${servings} portion${servings > 1 ? "s" : ""}`;
      quantities.forEach((quantity) => {
        const value = scaledQuantity(quantity.dataset.baseQuantity, servings / baseServings);
        quantity.textContent = quantity.hasAttribute("data-inline-quantity") ? value : `(${value})`;
      });
    };

    const changeServings = (change) => {
      updateServings(Math.min(maximum, Math.max(minimum, currentServings + change)));
    };

    input.addEventListener("input", () => {
      const servings = Number(input.value);
      if (Number.isInteger(servings) && servings >= minimum && servings <= maximum) {
        updateServings(servings);
      }
    });
    input.addEventListener("change", () => updateServings(currentServings));
    decreaseButton.addEventListener("click", () => changeServings(-1));
    increaseButton.addEventListener("click", () => changeServings(1));
  }
}

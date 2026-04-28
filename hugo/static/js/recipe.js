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
}

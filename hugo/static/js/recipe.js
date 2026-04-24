const recipePage = document.querySelector("[data-recipe-page]");

if (recipePage) {
  const toggle = recipePage.querySelector("[data-cook-mode-toggle]");
  const cookModeBar = document.querySelector("[data-cook-mode-bar]");
  const status = document.querySelector("[data-cook-mode-status]");
  const nextButton = document.querySelector("[data-step-next]");
  const prevButton = document.querySelector("[data-step-prev]");
  const steps = [...document.querySelectorAll("[data-step-card]")];
  let currentStep = 0;

  const updateCurrentStep = (index) => {
    if (steps.length === 0) {
      return;
    }

    currentStep = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach((step, stepIndex) => {
      step.classList.toggle("step-current", stepIndex === currentStep);
    });

    status.textContent = `Etape ${currentStep + 1} / ${steps.length}`;

    if (document.body.classList.contains("cook-mode")) {
      steps[currentStep].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  toggle?.addEventListener("click", () => {
    const active = document.body.classList.toggle("cook-mode");
    cookModeBar.hidden = !active;
    toggle.textContent = active ? "Quitter le mode cuisine" : "Mode cuisine";
    updateCurrentStep(currentStep);
  });

  nextButton?.addEventListener("click", () => {
    updateCurrentStep(currentStep + 1);
  });

  prevButton?.addEventListener("click", () => {
    updateCurrentStep(currentStep - 1);
  });

  steps.forEach((step, index) => {
    step.addEventListener("click", () => {
      if (document.body.classList.contains("cook-mode")) {
        updateCurrentStep(index);
      }
    });
  });

  updateCurrentStep(0);
}

(() => {
  const statusButtons = [...document.querySelectorAll("[data-status-filter]")];
  const categoryButtons = [...document.querySelectorAll("[data-category-filter]")];
  if (!statusButtons.length) return;

  let status = "all";
  let category = "all";

  function apply() {
    document.querySelectorAll(".rules-subsection").forEach((group) => {
      let groupVisible = false;
      group.querySelectorAll(".guide-callout, .rules-permitted").forEach((block) => {
        let blockVisible = false;
        block.querySelectorAll("li[data-status]").forEach((item) => {
          const statusMatch = status === "all" || item.dataset.status === status;
          const categoryMatch = category === "all" || item.dataset.category === category;
          const visible = statusMatch && categoryMatch;
          item.hidden = !visible;
          if (visible) blockVisible = true;
        });
        block.hidden = !blockVisible;
        if (blockVisible) groupVisible = true;
      });
      group.hidden = !groupVisible;
    });
  }

  function wireGroup(buttons, apply_) {
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        apply_(button);
      });
    });
  }

  wireGroup(statusButtons, (button) => {
    status = button.dataset.statusFilter;
    apply();
  });
  wireGroup(categoryButtons, (button) => {
    category = button.dataset.categoryFilter;
    apply();
  });
})();

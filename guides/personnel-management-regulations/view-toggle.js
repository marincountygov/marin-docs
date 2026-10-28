// Adapted from sop/flow-view.js's tab-switching mechanics (click/arrow-key
// handling, aria-selected/tabindex wiring, URL query-param sync) - the
// generic part of that file, with none of its BPMN/flow-chart rendering
// code, per instructions to reuse sop/ work "except bpmn".
(() => {
  const tablist = document.querySelector(".view-toggle");
  const interactiveView = document.getElementById("interactive-view");
  const originalView = document.getElementById("original-view");
  if (!tablist || !interactiveView || !originalView) return;

  const toc = document.querySelector(".toc");
  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));

  function activate(view, { focus = false } = {}) {
    const target = view === "original" ? "original" : "interactive";
    tabs.forEach((tab) => {
      const selected = tab.dataset.view === target;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    });
    interactiveView.hidden = target !== "interactive";
    originalView.hidden = target !== "original";
    // The on-page-outline (toc) points at Interactive-view section ids
    // (Purpose, Rules, Procedures, ...); it has nothing to jump to while
    // the Original text tab - a single straight-through reproduction of
    // the source - is showing, so hide it rather than leave dead links.
    if (toc) toc.hidden = target === "original";

    const url = new URL(window.location.href);
    if (target === "original") url.searchParams.set("view", "original");
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab.dataset.view));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const nextIndex =
        event.key === "ArrowRight"
          ? (index + 1) % tabs.length
          : (index - 1 + tabs.length) % tabs.length;
      activate(tabs[nextIndex].dataset.view, { focus: true });
    });
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "original") activate("original");
})();

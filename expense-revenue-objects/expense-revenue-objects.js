(() => {
  const data = JSON.parse(document.getElementById("object-data").textContent);
  const objects = data.objects;

  const typeOrder = [...new Set(objects.map((o) => o.object_type))].sort(
    (a, b) => Number(a) - Number(b)
  );
  const typeNames = new Map(objects.map((o) => [o.object_type, o.object_type_name]));

  const searchInput = document.getElementById("object-search");
  const filterNav = document.getElementById("type-filters");
  const resultsCount = document.getElementById("results-count");
  const tbody = document.getElementById("results-body");
  const emptyState = document.getElementById("lookup-empty");
  const table = document.getElementById("lookup-table");

  let activeType = "all";

  filterNav.innerHTML =
    `<button type="button" data-type="all" aria-pressed="true">All types</button>` +
    typeOrder
      .map(
        (type) =>
          `<button type="button" data-type="${type}" aria-pressed="false">${typeNames.get(type)}</button>`
      )
      .join("");

  const rowsFragment = document.createDocumentFragment();
  const rows = objects.map((o) => {
    const tr = document.createElement("tr");
    tr.dataset.type = o.object_type;
    tr.dataset.search = `${o.object} ${o.object_name} ${o.character_name}`.toLowerCase();
    tr.innerHTML =
      `<td class="lookup-code">${o.object}</td>` +
      `<td>${o.object_name}</td>` +
      `<td>${o.character_name}</td>` +
      `<td>${o.object_type_name}</td>`;
    rowsFragment.appendChild(tr);
    return tr;
  });
  tbody.appendChild(rowsFragment);

  function applyFilter() {
    const query = searchInput.value.trim().toLowerCase();
    let visible = 0;
    for (const tr of rows) {
      const matchesType = activeType === "all" || tr.dataset.type === activeType;
      const matchesQuery = query === "" || tr.dataset.search.includes(query);
      const show = matchesType && matchesQuery;
      tr.hidden = !show;
      if (show) visible += 1;
    }
    resultsCount.textContent = `${visible.toLocaleString()} of ${rows.length.toLocaleString()} codes`;
    const showEmpty = visible === 0;
    emptyState.hidden = !showEmpty;
    table.hidden = showEmpty;
  }

  searchInput.addEventListener("input", applyFilter);

  filterNav.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-type]");
    if (!button) return;
    activeType = button.dataset.type;
    filterNav.querySelectorAll("button").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn === button));
    });
    applyFilter();
  });

  applyFilter();

  function statusFor(button) {
    return button.closest(".doc-actions")?.querySelector(".doc-action-status") ?? null;
  }

  document.querySelectorAll('[data-action="share"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const status = statusFor(button);
      try {
        await navigator.clipboard.writeText(window.location.href);
        if (status) status.textContent = "Link copied";
      } catch {
        if (status) status.textContent = "Couldn't copy — copy the address bar link instead";
      }
    });
  });

  document.querySelectorAll('[data-action="download-json"]').forEach((button) => {
    button.addEventListener("click", () => {
      const script = document.getElementById("object-data");
      const blob = new Blob([script.textContent], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "expense-revenue-objects.json";
      link.click();
      URL.revokeObjectURL(url);
    });
  });
})();

// The Projects tool: filters, a "Showing" line, live stats for what is selected, sort, and cards or a table.
// The page holds every project twice, as a card and as a table row, with its figures in data attributes. The shared
// filter script (search/shared/search-layout.js) hides the cards that do not match; this script does the rest from
// the cards still showing. Filters, sort and view are kept in the address, so Copy link shares what is on screen.
(() => {
  const cardsEl = document.getElementById("project-cards");
  const tableWrap = document.getElementById("project-table-wrap");
  const tbody = document.querySelector("#project-table tbody");
  const emptyEl = document.getElementById("project-empty");
  const summaryEl = document.getElementById("active-filters");
  const toggle = document.getElementById("filter-toggle");
  const bar = document.querySelector(".search-results .doc-actions");
  const exportEl = document.getElementById("project-export");
  const selectAll = document.getElementById("select-all-checkbox");
  const countEl = document.getElementById("selection-count");
  const selected = new Set();
  let showing = [];
  const cards = Array.from(cardsEl.children);
  const rows = new Map(Array.from(tbody.children).map((row) => [row.dataset.project, row]));
  const money = (n) => (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US");
  const millions = (n) => "$" + (n / 1e6).toFixed(1) + "M";
  const params = () => new URLSearchParams(window.location.search);
  const remember = (name, value, fallback) => {
    const p = params();
    if (value === fallback) p.delete(name);
    else p.set(name, value);
    const next = p.toString();
    window.history.replaceState(null, "", next ? `${window.location.pathname}?${next}` : window.location.pathname);
  };

  // ---- sort and view ------------------------------------------------------------------------------------------
  const SORTS = {
    book: (a, b) => a.dataset.order - b.dataset.order,
    cost: (a, b) => b.dataset.cost - a.dataset.cost || a.dataset.order - b.dataset.order,
    name: (a, b) => a.dataset.name.localeCompare(b.dataset.name),
  };
  let sort = SORTS[params().get("sort")] ? params().get("sort") : "book";
  let view = params().get("view") === "table" ? "table" : "cards";
  const PANELS = { stats: "project-stats", data: "project-data", notes: "project-notes" };
  let tab = PANELS[params().get("tab")] ? params().get("tab") : "projects";
  const press = (group, attr, value) => group.querySelectorAll(`[${attr}]`).forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute(attr) === value)));
  const applySort = () => {
    cards.slice().sort(SORTS[sort]).forEach((card) => {
      cardsEl.appendChild(card);
      tbody.appendChild(rows.get(card.dataset.project));
    });
    press(document.getElementById("sort-group"), "data-sort", sort);
    remember("sort", sort, "book");
    if (typeof refreshOutput === "function") refreshOutput();
  };
  const listEl = document.getElementById("project-list");
  const projectsTab = document.getElementById("projects-tab");
  const applyView = () => {
    const stats = tab === "stats";
    const other = tab === "data" || tab === "notes"; // sources and notes: no filters summary, sort, view or buttons
    // The list and the panels swap in place, as Marin Mentions does with Stats.
    listEl.querySelectorAll("#project-cards, #project-table-wrap, #project-empty, #select-all-field").forEach((el) => { if (tab !== "projects") el.hidden = true; });
    if (tab === "projects") { cardsEl.hidden = view !== "cards"; tableWrap.hidden = view !== "table"; emptyEl.hidden = cards.some((c) => !c.hidden); }
    Object.entries(PANELS).forEach(([name, id]) => { const el = document.getElementById(id); if (el) el.hidden = tab !== name; });
    Object.keys(PANELS).forEach((name) => { const t = document.getElementById(`${name}-toggle`); if (t) t.setAttribute("aria-pressed", String(tab === name)); });
    if (projectsTab) projectsTab.setAttribute("aria-selected", String(tab === "projects"));
    // Chart.js sizes a canvas when it is made, so the charts are made once the panel is showing.
    if (tab === "stats") ensureCharts().then(renderCharts).catch((error) => console.error(error));
    document.getElementById("sort-group").hidden = tab !== "projects";
    document.getElementById("view-group").hidden = tab !== "projects";
    document.querySelector(".search-results .mm-results-summary").hidden = other;
    document.querySelector(".search-results .action-toolbar").hidden = other;
    // Copy and Download follow what is open; the stats have no CSV or JSON.
    // On Stats the chart actions replace the Copy and Download menus; the link stays.
    const chartActions = document.getElementById("chart-actions");
    if (chartActions) chartActions.hidden = !stats;
    if (bar) {
      bar.dataset.formatsFor = "#project-export";
      bar.querySelectorAll(".menu").forEach((el) => { el.hidden = stats; });
    }
    remember("tab", tab, "projects");
    press(document.getElementById("view-group"), "data-view", view);
    remember("view", view, "cards");
  };
  Object.keys(PANELS).forEach((name) => { const t = document.getElementById(`${name}-toggle`); if (t) t.addEventListener("click", () => { tab = name; applyView(); }); });
  if (projectsTab) projectsTab.addEventListener("click", () => { tab = "projects"; applyView(); });
  document.getElementById("sort-group").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sort]");
    if (b) { sort = b.dataset.sort; applySort(); }
  });
  document.getElementById("view-group").addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]");
    if (b) { view = b.dataset.view; applyView(); }
  });

  // ---- facets: what is chosen, in words -----------------------------------------------------------------------
  const facets = Array.from(document.querySelectorAll(".search-facet-group"));
  const labelOf = (box) => Array.from(box.parentElement.childNodes).find((n) => n.nodeType === 3).textContent.trim();
  const chosen = (group) => Array.from(group.querySelectorAll("input:checked"));
  const refreshSummaries = () => facets.forEach((group) => {
    const on = chosen(group);
    group.querySelector("summary").textContent = on.length === 0 ? group.dataset.all : on.length === 1 ? labelOf(on[0]) : `${on.length} selected`;
    if (on.length) group.querySelector("details").open = true;
  });

  // ---- stats --------------------------------------------------------------------------------------------------
  const num = (el, key) => Number(el.dataset[key]) || 0;
  const sum = (list, key) => list.reduce((n, el) => n + num(el, key), 0);
  const setStat = (name, text) => { const el = document.querySelector(`[data-stat="${name}"]`); if (el) el.textContent = text; };
  const years = Array.from(document.querySelectorAll("#selection-years tr"));
  const catRows = Array.from(document.querySelectorAll("#selection-categories tr"));
  const cell = (tr, i, text) => { tr.children[i].textContent = text; };

  const update = (visible) => {
    // The table follows the cards.
    const shown = new Set(visible.map((c) => c.dataset.project));
    rows.forEach((row, slug) => { row.hidden = !shown.has(slug); });
    emptyEl.hidden = visible.length !== 0 || tab === "stats";
    setStat("n", String(visible.length));
    setStat("cost", millions(sum(visible, "cost")));
    setStat("programmed", millions(sum(visible, "programmed")));
    setStat("needed", millions(sum(visible, "needed")));
    years.forEach((tr) => cell(tr, 1, money(sum(visible, `y${tr.dataset.year}`))));
    catRows.forEach((tr) => {
      const mine = visible.filter((c) => c.dataset.category === tr.dataset.category);
      cell(tr, 1, String(mine.length));
      cell(tr, 2, money(sum(mine, "cost")));
      cell(tr, 3, money(sum(mine, "programmed")));
    });
    // The Showing line: each filter in order, its choice or its "all" words, then the count and a short breakdown.
    const parts = facets.map((group) => { const on = chosen(group); return on.length ? on.map(labelOf).join(" or ") : group.dataset.all; });
    const q = document.getElementById("project-search").value.trim();
    const isNew = visible.filter((c) => c.dataset.facetStatus === "New").length;
    summaryEl.textContent = `Showing: ${q ? `“${q}” · ` : ""}${parts.join(" · ")} (${visible.length} ${visible.length === 1 ? "project" : "projects"} — New ${isNew}, Ongoing ${visible.length - isNew})`;
    refreshSummaries();
    showing = visible;
    refreshOutput();
    renderCharts();
  };

  // ---- charts: drawn with Chart.js the first time Stats opens, then redrawn as the selection changes ---------------
  // Colors are the shell's own (Okabe and Ito), which stay apart for people who see color differently. A status keeps its
  // color whatever the selection is, and the legend carries the counts, so color is never the only signal.
  const BLUE = "#0072B2";
  const ORANGE = "#E69F00";
  const chartBox = document.getElementById("selection-charts");
  const charts = {};
  const amount = (n, short) => {
    if (!short) return money(n);
    const abs = Math.abs(n);
    return abs >= 1e6 ? `$${(abs / 1e6).toFixed(abs >= 1e8 ? 0 : 1).replace(/\.0$/, "")}M` : abs >= 1e3 ? `$${Math.round(abs / 1e3)}K` : `$${abs}`;
  };
  const loadChart = () => new Promise((resolve, reject) => {
    if (window.Chart) return resolve();
    const script = document.createElement("script");
    script.src = chartBox.dataset.chartLib;
    script.onload = resolve;
    script.onerror = () => reject(new Error("The chart library could not be loaded"));
    document.head.append(script);
  });
  const describe = (id, summary) => {
    const card = chartBox.querySelector(`[data-chart-card="${id}"]`);
    card.querySelector("canvas").setAttribute("aria-label", `${card.querySelector("h3").textContent}. ${summary}`);
  };
  const CATEGORY_ORDER = Array.from(new Set(cards.map((c) => c.dataset.category))).sort((a, b) => sum(cards.filter((c) => c.dataset.category === b), "cost") - sum(cards.filter((c) => c.dataset.category === a), "cost"));
  const make = (id, type, config) => {
    const canvas = chartBox.querySelector(`[data-chart-card="${id}"] canvas`);
    canvas.hidden = false;
    charts[id] = new window.Chart(canvas, { type, ...config });
  };
  const ensureCharts = async () => {
    if (!chartBox || charts.years) return;
    await loadChart();
    window.Chart.defaults.color = getComputedStyle(chartBox).color;
    window.Chart.defaults.borderColor = getComputedStyle(chartBox.querySelector(".app-card")).borderTopColor;
    const base = { responsive: true, maintainAspectRatio: false, animation: false };
    const axis = () => ({ beginAtZero: true, ticks: { callback: (v) => amount(v, true) } });
    const tip = { callbacks: { label: (item) => `${item.dataset.label}: ${amount(item.parsed[item.chart.options.indexAxis === "y" ? "x" : "y"])}` } };
    make("years", "bar", { data: { labels: Array.from(document.querySelectorAll("#selection-years th")).map((th) => th.textContent), datasets: [{ label: "Funding", data: [], backgroundColor: BLUE, borderRadius: 4, maxBarThickness: 48 }] },
      options: { ...base, plugins: { legend: { display: false }, tooltip: tip }, scales: { y: axis(), x: { grid: { display: false } } } } });
    make("categories", "bar", { data: { labels: CATEGORY_ORDER, datasets: [{ label: "Cost estimate", data: [], backgroundColor: BLUE, borderRadius: 4, maxBarThickness: 28 }] },
      options: { ...base, indexAxis: "y", plugins: { legend: { display: false }, tooltip: tip }, scales: { x: axis(), y: { grid: { display: false } } } } });
    make("status", "doughnut", { data: { labels: ["New", "Ongoing"], datasets: [{ data: [], backgroundColor: [ORANGE, BLUE], borderColor: getComputedStyle(chartBox.querySelector(".app-card")).backgroundColor, borderWidth: 2 }] },
      options: { ...base, cutout: "55%", plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (item) => `${item.label.split(",")[0]}: ${item.parsed} projects` } } } } });
  };
  const renderCharts = () => {
    if (!charts.years) return;
    const yearData = Array.from(document.querySelectorAll("#selection-years tr")).map((tr) => sum(showing, `y${tr.dataset.year}`));
    charts.years.data.datasets[0].data = yearData;
    const peak = yearData.indexOf(Math.max(...yearData));
    describe("years", showing.length ? `Largest in ${charts.years.data.labels[peak]} at ${amount(yearData[peak])}, ${amount(yearData.reduce((a, b) => a + b, 0))} over five years.` : "No projects selected.");
    const byCategory = CATEGORY_ORDER.map((name) => sum(showing.filter((c) => c.dataset.category === name), "cost"));
    charts.categories.data.datasets[0].data = byCategory;
    const top = byCategory.indexOf(Math.max(...byCategory));
    describe("categories", showing.length ? `${CATEGORY_ORDER[top]} is the largest at ${amount(byCategory[top])} of ${amount(byCategory.reduce((a, b) => a + b, 0))}.` : "No projects selected.");
    const isNew = showing.filter((c) => c.dataset.facetStatus === "New").length;
    const ongoing = showing.length - isNew;
    const share = (n) => (showing.length ? ` (${Math.round((n / showing.length) * 100)}%)` : "");
    charts.status.data.labels = [`New, ${isNew}${share(isNew)}`, `Ongoing, ${ongoing}${share(ongoing)}`];
    charts.status.data.datasets[0].data = [isNew, ongoing];
    describe("status", showing.length ? `${isNew} new and ${ongoing} ongoing, of ${showing.length} projects.` : "No projects selected.");
    Object.values(charts).forEach((chart) => { chart.resize(); chart.update("none"); });
  };

  // ---- chart actions, as in Marin Mentions: Copy the charts (images and a summary) and download all as PNG ---------
  const dateText = () => new Date().toLocaleString([], { month: "short", day: "numeric", year: "numeric" });
  const summaryOf = (canvas) => {
    const title = window.marinChartTitle(canvas);
    const label = canvas.getAttribute("aria-label") || "";
    return label.startsWith(`${title}.`) ? label.slice(title.length + 1).trim() : "";
  };
  const drawnCanvases = () => Array.from(chartBox.querySelectorAll("canvas")).filter((canvas) => window.Chart && window.Chart.getChart(canvas));
  const say = (message) => { const status = bar && bar.querySelector(".doc-action-status"); if (status) status.textContent = message; };
  const downloadAllButton = document.getElementById("download-all-png-button");
  if (downloadAllButton) downloadAllButton.addEventListener("click", () => {
    // A small stagger: some browsers only allow one download per tick.
    drawnCanvases().forEach((canvas, index) => setTimeout(() => window.marinChartPng(canvas), index * 150));
  });
  const copyChartsButton = document.getElementById("copy-charts-button");
  if (copyChartsButton) copyChartsButton.addEventListener("click", async () => {
    const header = `Capital projects stats \u2014 ${dateText()}`;
    const filters = summaryEl.textContent;
    const canvases = drawnCanvases();
    const text = [header, filters, "", ...canvases.flatMap((canvas) => [window.marinChartTitle(canvas), summaryOf(canvas), ""])].join("\n").trim();
    const escape = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<div><b>${escape(header)}</b><br>${escape(filters)}<br><br>` + canvases.map((canvas) => {
      const title = window.marinChartTitle(canvas);
      return `<b>${escape(title)}</b><br>${escape(summaryOf(canvas))}<br><img src="${window.marinChartImage(canvas).toDataURL("image/png")}" alt="${escape(title)}" width="${canvas.clientWidth}" height="${canvas.clientHeight}">`;
    }).join("<br><br>") + "</div>";
    try {
      if (!(await window.marinCopyRich(text, html))) throw new Error("The browser did not copy");
      say("Copied charts to clipboard.");
    } catch (error) {
      console.error(error);
      say("Could not copy.");
    }
  });

  // ---- selection: Copy and Download hold the selected projects, or everything showing when none are selected ------
  const pickedIn = (list) => list.filter((c) => selected.has(c.dataset.project));
  const refreshOutput = () => {
    const picked = pickedIn(showing);
    const out = (picked.length ? picked : showing).slice().sort(SORTS[sort]);
    document.querySelectorAll("input[data-select]").forEach((box) => { box.checked = selected.has(box.dataset.select); });
    selectAll.disabled = showing.length === 0;
    selectAll.checked = showing.length > 0 && picked.length === showing.length;
    selectAll.indeterminate = picked.length > 0 && picked.length < showing.length;
    countEl.textContent = picked.length ? `${picked.length} selected` : "";
    const link = (c) => rows.get(c.dataset.project).querySelector("th a");
    const yearCols = Array.from(document.querySelectorAll("#selection-years tr")).map((tr) => tr.dataset.year);
    const head = ["Project", "Category", "Status", "Cost estimate", "Prior approvals", ...Array.from(document.querySelectorAll("#project-table thead th")).slice(6, 11).map((th) => th.textContent), "Additional funds needed"];
    // The page's own table for the buttons to copy: only what they should hold.
    const cellsOf = (c) => [link(c).textContent, c.dataset.category + (c.dataset.subcategory ? `: ${c.dataset.subcategory}` : ""), c.dataset.facetStatus, money(num(c, "cost")), money(num(c, "prior")), ...yearCols.map((y) => money(num(c, `y${y}`))), money(num(c, "needed"))];
    const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    exportEl.innerHTML = `<table><caption>Projects in the County of Marin FY 2027-31 Capital Improvement Plan</caption><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>` +
      out.map((c) => `<tr>${cellsOf(c).map((t) => `<td>${esc(t)}</td>`).join("")}</tr>`).join("") + "</tbody></table>";
    const csv = document.getElementById("csv-table");
    if (csv) {
      const first = JSON.parse(csv.textContent)[0];
      csv.textContent = JSON.stringify([first, ...out.map((c) => [c.dataset.category, c.dataset.subcategory, link(c).textContent, c.dataset.facetStatus, num(c, "cost"), num(c, "prior"),
        ...yearCols.map((y) => num(c, `y${y}`)), num(c, "total"), num(c, "needed"), num(c, "page")])]);
    }
    const ld = document.getElementById("page-data");
    if (ld) {
      ld.dataset.all = ld.dataset.all || ld.textContent;
      const all = JSON.parse(ld.dataset.all);
      const keep = new Set(out.map((c) => c.dataset.project));
      all["@graph"] = all["@graph"].filter((n) => keep.has(n["@id"].split("/").pop()));
      ld.textContent = JSON.stringify(all);
    }
  };
  document.getElementById("project-list").addEventListener("change", (e) => {
    const box = e.target.closest("input[data-select]");
    if (!box) return;
    if (box.checked) selected.add(box.dataset.select);
    else selected.delete(box.dataset.select);
    refreshOutput();
  });
  selectAll.addEventListener("change", () => {
    showing.forEach((c) => { if (selectAll.checked) selected.add(c.dataset.project); else selected.delete(c.dataset.project); });
    refreshOutput();
  });

  window.MarinSearchLayout.init({
    input: document.getElementById("project-search"),
    items: () => cards,
    facetGroups: facets.map((group) => ({ name: group.id.replace("facet-", ""), container: group })),
    emptyEl,
    resetButton: document.getElementById("reset-filters-button"),
    toggleButton: toggle,
    onChange: update,
  });
  // Reset clears every filter and the search, closes the filter groups and goes back to the first tab (after the shared filter script has cleared the choices).
  document.getElementById("reset-filters-button").addEventListener("click", () => setTimeout(() => {
    facets.forEach((group) => { group.querySelector("details").open = false; });
    tab = "projects";
    applyView();
  }, 0));
  applySort();
  applyView();
})();

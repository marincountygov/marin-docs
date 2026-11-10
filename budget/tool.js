// The Budget tool (every budget book's home page): year dropdown, filters, a "Showing" line, live stats for what is selected, sort, and cards or a table.
// The page holds every line twice, as a card and as a table row, with its figures in data attributes. The shared
// filter script (search/shared/search-layout.js) hides the cards that do not match; this script does the rest from
// the cards still showing. Filters, sort and view are kept in the address, so Copy link shares what is on screen.
(() => {
  const cardsEl = document.getElementById("line-cards");
  const tableWrap = document.getElementById("line-table-wrap");
  const tbody = document.querySelector("#line-table tbody");
  const emptyEl = document.getElementById("line-empty");
  const summaryEl = document.getElementById("active-filters");
  const toggle = document.getElementById("filter-toggle");
  const bar = document.querySelector(".search-results .doc-actions");
  const exportEl = document.getElementById("line-export");
  const selectAll = document.getElementById("select-all-checkbox");
  const countEl = document.getElementById("selection-count");
  const selected = new Set();
  let showing = [];
  const cards = Array.from(cardsEl.children);
  const rows = new Map(Array.from(tbody.children).map((row) => [row.dataset.line, row]));
  const money = (n) => (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US");
  const millions = (n) => (n < 0 ? "−" : "") + "$" + (Math.abs(n) / 1e6).toFixed(1) + "M";
  const params = () => new URLSearchParams(window.location.search);
  const remember = (name, value, fallback) => {
    const p = params();
    if (value === fallback) p.delete(name);
    else p.set(name, value);
    const next = p.toString();
    window.history.replaceState(null, "", next ? `${window.location.pathname}?${next}` : window.location.pathname);
  };
  const cfg = JSON.parse(document.getElementById("tool-config").textContent);
  const YEARS = cfg.columns.map((c, k) => ({ key: String(k), label: c.label }));
  // The budget book, from the filter column: each book is its own page.
  document.querySelectorAll("[name=book]").forEach((box) => box.addEventListener("change", () => { window.location.href = box.value; }));
  // Which column the cards, stats and charts show. The table always shows them all.
  const columnBoxes = Array.from(document.querySelectorAll("[name=column]"));
  const asked = params().get("show");
  let col = asked !== null && Number(asked) >= 0 && Number(asked) < YEARS.length ? Number(asked) : cfg.defaultColumn;
  // Radio buttons or one dropdown, whichever the page has: the same choice either way.
  const setBox = () => columnBoxes.forEach((box) => { if (box.tagName === "SELECT") box.value = String(col); else box.checked = Number(box.value) === col; });
  setBox();
  const applyColumn = () => {
    cards.forEach((card) => {
      const v = card.dataset[`v${col}`];
      card.querySelector("[data-column-value]").textContent = v === "" ? "–" : money(Number(v));
    });
    document.querySelectorAll("[data-column-label]").forEach((el) => { el.textContent = YEARS[col].label; });
    remember("show", String(col), String(cfg.defaultColumn));
  };
  columnBoxes.forEach((box) => box.addEventListener("change", () => { col = Number(box.value); applyColumn(); update(showing); }));
  // Reset clears every filter and the search, puts the book and the year back to the default (the latest), closes the filter groups and goes back to the first tab.
  // It runs after the shared filter script has cleared the choices.
  document.getElementById("reset-filters-button").addEventListener("click", () => setTimeout(() => {
    // The default book is the latest: from an earlier book, Reset goes to it.
    if (cfg.currentBook !== cfg.latestBook) { window.location.href = cfg.latestBook; return; }
    col = cfg.defaultColumn;
    setBox();
    applyColumn();
    facets.forEach((group) => { group.querySelector("details").open = false; });
    tab = "lines";
    applyView();
    update(showing);
  }, 0));

  // ---- sort and view ------------------------------------------------------------------------------------------
  const SORTS = {
    book: (a, b) => a.dataset.order - b.dataset.order,
    amount: (a, b) => (Number(b.dataset[`v${col}`]) || 0) - (Number(a.dataset[`v${col}`]) || 0) || a.dataset.order - b.dataset.order,
    name: (a, b) => a.dataset.name.localeCompare(b.dataset.name),
  };
  let sort = SORTS[params().get("sort")] ? params().get("sort") : "book";
  let view = params().get("view") === "table" ? "table" : "cards";
  const PANELS = { stats: "line-stats", data: "line-data", notes: "line-notes" };
  let tab = PANELS[params().get("tab")] ? params().get("tab") : "lines";
  const press = (group, attr, value) => group.querySelectorAll(`[${attr}]`).forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute(attr) === value)));
  const applySort = () => {
    cards.slice().sort(SORTS[sort]).forEach((card) => {
      cardsEl.appendChild(card);
      tbody.appendChild(rows.get(card.dataset.line));
    });
    press(document.getElementById("sort-group"), "data-sort", sort);
    remember("sort", sort, "book");
    refreshOutput();
  };
  const listEl = document.getElementById("line-list");
  const linesTab = document.getElementById("lines-tab");
  const applyView = () => {
    const stats = tab === "stats";
    const other = tab === "data" || tab === "notes";
    listEl.querySelectorAll("#line-cards, #line-table-wrap, #line-empty, #select-all-field").forEach((el) => { if (tab !== "lines") el.hidden = true; });
    if (tab === "lines") { cardsEl.hidden = view !== "cards"; tableWrap.hidden = view !== "table"; emptyEl.hidden = cards.some((c) => !c.hidden); }
    Object.entries(PANELS).forEach(([name, id]) => { const el = document.getElementById(id); if (el) el.hidden = tab !== name; });
    Object.keys(PANELS).forEach((name) => { const t = document.getElementById(`${name}-toggle`); if (t) t.setAttribute("aria-pressed", String(tab === name)); });
    if (linesTab) linesTab.setAttribute("aria-selected", String(tab === "lines"));
    if (tab === "stats") ensureCharts().then(renderCharts).catch((error) => console.error(error));
    document.getElementById("sort-group").hidden = tab !== "lines";
    document.getElementById("view-group").hidden = tab !== "lines";
    document.querySelector(".search-results .mm-results-summary").hidden = other;
    document.querySelector(".search-results .action-toolbar").hidden = other;
    const chartActions = document.getElementById("chart-actions");
    if (chartActions) chartActions.hidden = !stats;
    if (bar) {
      bar.dataset.formatsFor = "#line-export";
      bar.querySelectorAll(".menu").forEach((el) => { el.hidden = stats; });
    }
    remember("tab", tab, "lines");
    press(document.getElementById("view-group"), "data-view", view);
    remember("view", view, "cards");
  };
  Object.keys(PANELS).forEach((name) => { const t = document.getElementById(`${name}-toggle`); if (t) t.addEventListener("click", () => { tab = name; applyView(); }); });
  if (linesTab) linesTab.addEventListener("click", () => { tab = "lines"; applyView(); });
  document.getElementById("sort-group").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sort]");
    if (b) { sort = b.dataset.sort; applySort(); }
  });
  document.getElementById("view-group").addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]");
    if (b) { view = b.dataset.view; applyView(); }
  });

  // ---- facets: what is chosen, in words -----------------------------------------------------------------------
  const facets = Array.from(document.querySelectorAll(".search-facet-group")).filter((group) => group.id !== "column-filter" && group.id !== "book-filter");
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
  const yearRows = Array.from(document.querySelectorAll("#selection-years tr"));
  const facetRows = Array.from(document.querySelectorAll("#selection-facet tr"));
  const cell = (tr, i, text) => { tr.children[i].textContent = text; };
  const facetKey = (name) => `facet${name.charAt(0).toUpperCase()}${name.slice(1)}`;

  const update = (visible) => {
    const shown = new Set(visible.map((c) => c.dataset.line));
    rows.forEach((row, slug) => { row.hidden = !shown.has(slug); });
    emptyEl.hidden = visible.length !== 0 || tab === "stats";
    setStat("total", millions(sum(visible, `v${col}`)));
    setStat("n", String(visible.length));
    setStat("count", String(new Set(visible.map((c) => c.dataset[facetKey(cfg.countFacet)])).size));
    yearRows.forEach((tr) => cell(tr, 1, money(sum(visible, `v${tr.dataset.year}`))));
    facetRows.forEach((tr) => {
      const mine = visible.filter((c) => c.dataset[facetKey(cfg.chartFacets[0])] === tr.dataset.value);
      cell(tr, 1, String(mine.length));
      cell(tr, 2, money(sum(mine, `v${col}`)));
    });
    // As on Marin Mentions: each filter in order (the year choice first, then the others), then the count with a breakdown of every value, zeros too.
    const parts = [YEARS[col].label, ...facets.map((group) => { const on = chosen(group); return on.length ? on.map(labelOf).join(" or ") : group.dataset.all; })];
    const q = document.getElementById("line-search").value.trim();
    const breakdown = valuesOf(cfg.breakdownFacet).map((v) => `${v} ${visible.filter((c) => c.dataset[facetKey(cfg.breakdownFacet)] === v).length}`).join(", ");
    summaryEl.textContent = `Showing: ${q ? `“${q}” · ` : ""}${parts.join(" · ")} (${visible.length} ${visible.length === 1 ? cfg.noun.one : cfg.noun.many} — ${breakdown})`;
    refreshSummaries();
    showing = visible;
    refreshOutput();
    renderCharts();
  };

  // ---- charts: drawn with Chart.js the first time Stats opens, then redrawn as the selection changes ---------------
  const BLUE = "#0072B2";
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
  const valuesOf = (name) => Array.from(new Set(cards.map((c) => c.dataset[facetKey(name)])));
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
    make("years", "bar", { data: { labels: YEARS.map((y) => y.label), datasets: [{ label: "Expenditures", data: [], backgroundColor: BLUE, borderRadius: 4, maxBarThickness: 48 }] },
      options: { ...base, plugins: { legend: { display: false }, tooltip: tip }, scales: { y: axis(), x: { grid: { display: false } } } } });
    cfg.chartFacets.forEach((name) => make(name, "bar", { data: { labels: valuesOf(name), datasets: [{ label: "Expenditures", data: [], backgroundColor: BLUE, borderRadius: 4, maxBarThickness: 20 }] },
      options: { ...base, indexAxis: "y", plugins: { legend: { display: false }, tooltip: tip }, scales: { x: axis(), y: { grid: { display: false } } } } }));
  };
  const renderCharts = () => {
    if (!charts.years) return;
    const none = `No ${cfg.noun.many} selected.`;
    const yearData = YEARS.map((y) => sum(showing, `v${y.key}`));
    charts.years.data.datasets[0].data = yearData;
    const peak = yearData.indexOf(Math.max(...yearData));
    describe("years", showing.length ? `${YEARS[peak].label} is the largest at ${amount(yearData[peak])}.` : none);
    cfg.chartFacets.forEach((name) => {
      const pairs = valuesOf(name).map((v) => [v, sum(showing.filter((c) => c.dataset[facetKey(name)] === v), `v${col}`)]).sort((a, b) => b[1] - a[1]);
      charts[name].data.labels = pairs.map((p) => p[0]);
      charts[name].data.datasets[0].data = pairs.map((p) => p[1]);
      const total = pairs.reduce((n, p) => n + p[1], 0);
      describe(name, showing.length ? `${pairs[0][0]} is the largest at ${amount(pairs[0][1])} of ${amount(total)} in ${YEARS[col].label}.` : none);
    });
    Object.values(charts).forEach((chart) => { chart.resize(); chart.update("none"); });
  };

  // ---- chart actions: Copy the charts (images and a summary) and download all as PNG --------------------------------
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
    drawnCanvases().forEach((canvas, index) => setTimeout(() => window.marinChartPng(canvas), index * 150));
  });
  const copyChartsButton = document.getElementById("copy-charts-button");
  if (copyChartsButton) copyChartsButton.addEventListener("click", async () => {
    const header = `${cfg.statsTitle} stats — ${dateText()}`;
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

  // ---- selection: Copy and Download hold the selected lines, or everything showing when none are selected --------
  const pickedIn = (list) => list.filter((c) => selected.has(c.dataset.line));
  const refreshOutput = () => {
    const picked = pickedIn(showing);
    const out = (picked.length ? picked : showing).slice().sort(SORTS[sort]);
    document.querySelectorAll("input[data-select]").forEach((box) => { box.checked = selected.has(box.dataset.select); });
    selectAll.disabled = showing.length === 0;
    selectAll.checked = showing.length > 0 && picked.length === showing.length;
    selectAll.indeterminate = picked.length > 0 && picked.length < showing.length;
    countEl.textContent = picked.length ? `${picked.length} selected` : "";
    const head = [cfg.titleLabel, ...cfg.facets.map((f) => f.label.replace(/s$/, "")), ...YEARS.map((y) => y.label)];
    const cellsOf = (c) => [c.dataset.title, ...cfg.facets.map((f) => c.dataset[facetKey(f.name)]), ...YEARS.map((y) => (c.dataset[`v${y.key}`] === "" ? "" : money(num(c, `v${y.key}`))))];
    const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    exportEl.innerHTML = `<table><caption>${esc(cfg.exportCaption)}</caption><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>` +
      out.map((c) => `<tr>${cellsOf(c).map((t) => `<td>${esc(t)}</td>`).join("")}</tr>`).join("") + "</tbody></table>";
    const csv = document.getElementById("csv-table");
    if (csv) {
      const first = JSON.parse(csv.textContent)[0];
      csv.textContent = JSON.stringify([first, ...out.map((c) => [c.dataset.title, ...cfg.facets.map((f) => c.dataset[facetKey(f.name)]), ...YEARS.map((y) => (c.dataset[`v${y.key}`] === "" ? "" : num(c, `v${y.key}`))), c.dataset.page])]);
    }
    const ld = document.getElementById("page-data");
    if (ld) {
      ld.dataset.all = ld.dataset.all || ld.textContent;
      const all = JSON.parse(ld.dataset.all);
      const keep = new Set(out.map((c) => c.dataset.ref));
      all["@graph"] = all["@graph"].filter((n) => keep.has(n["@id"]));
      ld.textContent = JSON.stringify(all);
    }
  };
  document.getElementById("line-list").addEventListener("change", (e) => {
    const box = e.target.closest("input[data-select]");
    if (!box) return;
    if (box.checked) selected.add(box.dataset.select);
    else selected.delete(box.dataset.select);
    refreshOutput();
  });
  selectAll.addEventListener("change", () => {
    showing.forEach((c) => { if (selectAll.checked) selected.add(c.dataset.line); else selected.delete(c.dataset.line); });
    refreshOutput();
  });

  window.MarinSearchLayout.init({
    input: document.getElementById("line-search"),
    items: () => cards,
    facetGroups: facets.map((group) => ({ name: group.id.replace("facet-", ""), container: group })),
    emptyEl,
    resetButton: document.getElementById("reset-filters-button"),
    toggleButton: toggle,
    onChange: update,
  });
  applyColumn();
  applySort();
  applyView();
})();

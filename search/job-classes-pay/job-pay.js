/* Job-class and published pay explorer, using public County Open Data only. */
(() => {
  "use strict";
  const Core = window.MarinJobPayCore;
  const API_URL = "https://data.marincounty.gov/resource/w7uw-fvda.json?$limit=5000";
  const CACHE_KEY = "marin-docs-job-pay-cache-v1";
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
  const $ = (id) => document.getElementById(id);
  const list = $("job-results");
  const countEl = $("job-results-count");
  const feedStatus = $("job-feed-status");
  let rows = [];
  let rowsById = new Map();
  let selectedIds = new Set();
  let loading = false;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function money(value, cents = false) {
    return Number.isFinite(value) ? (cents ? usdCents.format(value) : usd.format(value)) : "Not published";
  }

  function readCache(allowStale = false) {
    try {
      const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!saved || !Array.isArray(saved.rows) || !saved.rows.length || !Number.isFinite(saved.savedAt)) return null;
      if (!allowStale && Date.now() - saved.savedAt > CACHE_TTL_MS) return null;
      return saved;
    } catch { return null; }
  }

  function saveCache(raw) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ rows: raw, savedAt: Date.now() })); }
    catch { /* Browsers may disable local storage. Live fetch still works. */ }
  }

  function setFeedStatus(text = "") {
    feedStatus.hidden = !text;
    feedStatus.textContent = text;
  }

  function reportError(text) {
    $("job-error").hidden = false;
    $("job-error-text").textContent = text;
    countEl.textContent = "Unable to load job classes and pay rates.";
  }

  async function loadData(force = false) {
    if (loading) return;
    loading = true;
    $("job-error").hidden = true;
    const cache = force ? null : readCache();
    if (cache) {
      try {
        renderRows(Core.normalizeRows(cache.rows));
        loading = false;
        return;
      } catch { /* A malformed cache should not prevent a fresh fetch. */ }
    }
    countEl.textContent = "Loading job classes and pay rates…";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(API_URL, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.json();
      const parsed = Core.normalizeRows(raw);
      if (!parsed.length) throw new Error("No job classes returned");
      saveCache(raw);
      setFeedStatus();
      renderRows(parsed);
    } catch {
      const stale = readCache(true);
      if (stale) {
        try {
          renderRows(Core.normalizeRows(stale.rows));
          setFeedStatus("The live data feed could not be reached. Showing an older copy saved in this browser. Reload when connected for current rates.");
        } catch {
          reportError("Could not load the County Open Data feed or the saved copy. Check your connection and retry.");
        }
      } else {
        reportError("Could not load the County Open Data feed. Check your connection and retry.");
      }
    } finally {
      clearTimeout(timeout);
      loading = false;
    }
  }

  function createFacets(field, name, labels, orderedValues) {
    const counts = new Map();
    rows.forEach((row) => {
      const value = String(row[field] ?? "");
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    });
    const values = orderedValues || Array.from(counts.keys()).sort((a, b) => Number(a) - Number(b));
    $(name + "-options").innerHTML = values.filter((value) => counts.has(value)).map((value) => `
      <li><label><input type="checkbox" data-facet-filter="${name}" value="${escapeHtml(value)}">
        ${escapeHtml(labels[value] || value)} <span class="search-facet-count">(${counts.get(value)})</span></label></li>
    `).join("");
  }

  function sortRows() {
    const key = $("job-sort").value;
    const direction = $("job-sort-direction").value === "desc" ? -1 : 1;
    const sorted = [...list.querySelectorAll("[data-search-item]")].sort((a, b) => {
      const first = rowsById.get(Number(a.dataset.jobId));
      const second = rowsById.get(Number(b.dataset.jobId));
      let compare;
      if (key === "title" || key === "job_class_code") {
        compare = first[key].localeCompare(second[key], undefined, { numeric: true });
      } else {
        const va = first[key], vb = second[key];
        // Unpublished pay values sort last in either direction.
        if (va === null || vb === null) {
          if (va === null && vb !== null) return 1;
          if (vb === null && va !== null) return -1;
          return first.title.localeCompare(second.title);
        }
        compare = va - vb;
      }
      return compare * direction || first.title.localeCompare(second.title);
    });
    list.replaceChildren(...sorted);
  }

  function stepTable(row) {
    if (!row.steps.length) return "<p>No salary steps published for this class.</p>";
    const contents = row.steps.map((step) => `<tr><th scope="row">Step ${step.number}</th><td>${escapeHtml(money(step.hourly, true))}</td><td>${escapeHtml(money(step.yearly))}</td></tr>`).join("");
    return `<div class="app-table-wrap"><table><caption>Published salary steps for ${escapeHtml(row.title)}</caption><thead><tr><th scope="col">Pay step</th><th scope="col">Hourly</th><th scope="col">Yearly</th></tr></thead><tbody>${contents}</tbody></table></div>`;
  }

  function cardHtml(row) {
    const searchable = [row.title, row.job_class_code, row.hours_per_period, row.number_of_steps, row.min_yearly, row.max_yearly,
      row.min_hourly, row.max_hourly, ...row.steps.flatMap((step) => [step.hourly, step.yearly])]
      .filter((value) => value !== null && value !== undefined)
      .flatMap((value) => [String(value), typeof value === "number" ? numberFormat.format(value) : ""])
      .join(" ").toLowerCase();
    const rawJson = escapeHtml(JSON.stringify(row.raw, null, 2));
    const link = `${window.location.origin}${window.location.pathname}?q=${encodeURIComponent(row.job_class_code || row.title)}`;
    return `<li class="app-card" data-search-item data-job-id="${row.id}"
      data-search-text="${escapeHtml(searchable)}" data-facet-titlegroup="${escapeHtml(row.titlegroup)}"
      data-facet-payband="${escapeHtml(row.payband)}" data-facet-hours="${escapeHtml(row.hours_per_period ?? "")}"
      data-facet-steps="${escapeHtml(row.number_of_steps)}">
      <div class="job-card-header"><div><h3 class="job-card-title">${escapeHtml(row.title)}</h3><p class="job-card-code">Class code: ${escapeHtml(row.job_class_code || "Not listed")}</p></div></div>
      <p class="job-card-pay">${escapeHtml(money(row.min_yearly))}–${escapeHtml(money(row.max_yearly))} per year</p>
      <p class="job-card-meta">${escapeHtml(money(row.min_hourly, true))}–${escapeHtml(money(row.max_hourly, true))} per hour · ${escapeHtml(row.hours_per_period ?? "Unknown")} hours/period · ${escapeHtml(row.number_of_steps)} steps</p>
      <details class="job-card-details"><summary aria-label="Pay steps and record details for ${escapeHtml(row.title)}">Pay steps and record details</summary>${stepTable(row)}
        <details><summary>Source JSON</summary><pre>${rawJson}</pre></details>
      </details>
      <div class="job-card-actions"><label><input type="checkbox" class="job-compare-checkbox" data-compare-id="${row.id}" aria-label="Compare ${escapeHtml(row.title)}"> Compare</label>
        <button type="button" class="job-copy-link action-button" aria-label="Copy link to ${escapeHtml(row.title)}" data-copy-value="${escapeHtml(link)}" data-copy-announce="Copied job class link.">Copy link</button></div>
    </li>`;
  }

  function renderRows(parsed) {
    rows = parsed;
    rowsById = new Map(rows.map((row) => [row.id, row]));
    selectedIds = new Set([...selectedIds].filter((id) => rowsById.has(id)));
    $("job-total").textContent = numberFormat.format(rows.length);
    $("job-pay-schedules").textContent = new Set(rows.map((row) => row.hours_per_period).filter((value) => value !== null)).size;
    $("job-step-patterns").textContent = new Set(rows.map((row) => row.number_of_steps)).size;
    const yearlyMaximums = rows.map((row) => row.max_yearly).filter((value) => value !== null);
    $("job-highest").textContent = yearlyMaximums.length ? money(Math.max(...yearlyMaximums)) : "Not published";
    $("job-summary").hidden = false;
    $("job-exports").hidden = false;
    list.innerHTML = rows.map(cardHtml).join("");

    createFacets("titlegroup", "titlegroup", {}, [...Core.TITLE_GROUPS, "Other"]);
    createFacets("payband", "payband", Object.fromEntries([...Core.PAY_BANDS.map((item) => [item.value, item.label]), ["unknown", "Not published"]]), [...Core.PAY_BANDS.map((item) => item.value), "unknown"]);
    createFacets("hours_per_period", "hours", {}, undefined);
    createFacets("number_of_steps", "steps", {}, undefined);
    sortRows();
    window.MarinSearchLayout.init({
      input: $("job-search-input"),
      items: () => [...list.querySelectorAll("[data-search-item]")],
      facetGroups: ["titlegroup", "payband", "hours", "steps"].map((name) => ({ name, container: $(name + "-facet") })),
      countEl,
      emptyEl: $("job-empty"),
      resetButton: $("reset-filters-button"),
      toggleButton: $("filter-toggle"),
      formatCount: (visible, total) => `${visible} of ${total} job classes`,
    });
    refreshCompare();
  }

  function visibleRows() {
    return [...list.querySelectorAll("[data-search-item]")].filter((item) => !item.hidden).map((item) => rowsById.get(Number(item.dataset.jobId)));
  }

  function downloadFiltered(format) {
    const visible = visibleRows();
    if (!visible.length) {
      $("app-status-message").textContent = "No matching job classes to export.";
      return;
    }
    if (format === "json") {
      window.marinDownload({ content: JSON.stringify(visible.map((row) => row.raw), null, 2) + "\n", name: "marin-job-classes-pay.json" });
    } else {
      const headers = ["Title", "Job class code", "Hours per biweekly period", "Number of steps", "Min yearly", "Max yearly", "Min hourly", "Max hourly",
        ...Array.from({ length: 5 }, (_, i) => `Hourly step ${i + 1}`), ...Array.from({ length: 5 }, (_, i) => `Yearly step ${i + 1}`)];
      // County data is not trusted as spreadsheet instructions. Prevent formula evaluation in Excel.
      const csvCell = (value) => {
        const text = String(value ?? "");
        const safe = /^[\s\u0000-\u001f]*[=+@-]/u.test(text) ? `'${text}` : text;
        return `"${safe.replace(/"/g, '""')}"`;
      };
      const lines = visible.map((row) => [row.title, row.job_class_code, row.hours_per_period, row.number_of_steps, row.min_yearly, row.max_yearly, row.min_hourly, row.max_hourly,
        ...Array.from({ length: 5 }, (_, i) => row.steps.find((step) => step.number === i + 1)?.hourly ?? ""),
        ...Array.from({ length: 5 }, (_, i) => row.steps.find((step) => step.number === i + 1)?.yearly ?? "")].map(csvCell).join(","));
      window.marinDownload({ content: [headers.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n", name: "marin-job-classes-pay.csv" });
    }
    $("app-status-message").textContent = `Exported ${visible.length} job classes as ${format.toUpperCase()}.`;
  }

  function refreshCompare() {
    const selected = [...selectedIds].map((id) => rowsById.get(id)).filter(Boolean);
    const panel = $("job-compare");
    panel.hidden = selected.length === 0;
    $("job-compare-summary").textContent = `${selected.length} of 3 classes selected.`;
    list.querySelectorAll("[data-compare-id]").forEach((input) => {
      input.checked = selectedIds.has(Number(input.dataset.compareId));
      input.disabled = selected.length >= 3 && !input.checked;
    });
    if (!selected.length) {
      $("job-compare-table").replaceChildren();
      return;
    }
    const fields = [
      ["Class code", (row) => row.job_class_code],
      ["Hours per period", (row) => row.hours_per_period ?? "Not published"],
      ["Number of steps", (row) => row.number_of_steps],
      ["Minimum yearly", (row) => money(row.min_yearly)],
      ["Maximum yearly", (row) => money(row.max_yearly)],
      ["Minimum hourly", (row) => money(row.min_hourly, true)],
      ["Maximum hourly", (row) => money(row.max_hourly, true)],
      ...Array.from({ length: 5 }, (_, i) => [`Step ${i + 1} hourly`, (row) => money(row.steps.find((step) => step.number === i + 1)?.hourly ?? null, true)]),
      ...Array.from({ length: 5 }, (_, i) => [`Step ${i + 1} yearly`, (row) => money(row.steps.find((step) => step.number === i + 1)?.yearly ?? null)]),
    ];
    $("job-compare-table").innerHTML = `<table><caption>Comparison of selected job classes</caption><thead><tr><th scope="col">Pay detail</th>${selected.map((row) => `<th scope="col">${escapeHtml(row.title)}</th>`).join("")}</tr></thead><tbody>${fields.map(([label, get]) => `<tr><th scope="row">${escapeHtml(label)}</th>${selected.map((row) => `<td>${escapeHtml(get(row))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }

  // User controls; local state is never sent to the County data service.
  $("job-retry").addEventListener("click", () => loadData(true));
  $("job-sort").addEventListener("change", sortRows);
  $("job-sort-direction").addEventListener("change", sortRows);
  $("reset-filters-button").addEventListener("click", () => { $("job-sort").value = "title"; $("job-sort-direction").value = "asc"; sortRows(); });
  $("job-clear-compare").addEventListener("click", () => { selectedIds.clear(); refreshCompare(); });
  list.addEventListener("change", (event) => {
    if (!event.target.matches(".job-compare-checkbox")) return;
    const id = Number(event.target.dataset.compareId);
    if (event.target.checked) {
      if (selectedIds.size >= 3) {
        event.target.checked = false;
        $("app-status-message").textContent = "Compare up to 3 job classes.";
        return;
      }
      selectedIds.add(id);
    } else selectedIds.delete(id);
    refreshCompare();
  });
  $("job-export-csv").addEventListener("click", () => downloadFiltered("csv"));
  $("job-export-json").addEventListener("click", () => downloadFiltered("json"));
  loadData();
})();

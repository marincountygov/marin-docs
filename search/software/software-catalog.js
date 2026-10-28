(() => {
  const API_URL = "https://data.marincounty.gov/resource/ihh2-e4ix.json?$limit=1000";
  const CACHE_KEY = "software-catalog-cache-v1";
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

  const resultsEl = document.getElementById("software-results");
  const countEl = document.getElementById("software-results-count");
  const emptyEl = document.getElementById("software-empty");
  const searchInput = document.getElementById("software-search-input");
  const departmentGroup = document.getElementById("department-facet-group");
  const departmentList = document.getElementById("department-facet-list");
  const departmentDetails = document.getElementById("department-details");
  const departmentSummary = document.getElementById("department-summary");

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])
    );
  }

  function readCache(ignoreTtl) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.rows) || typeof parsed.fetchedAt !== "number") return null;
      if (!ignoreTtl && Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
      return parsed.rows;
    } catch {
      return null;
    }
  }

  function writeCache(rows) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ rows, fetchedAt: Date.now() }));
    } catch {
      // Storage full or unavailable — refetching next load is fine.
    }
  }

  function detailRow(label, value) {
    if (!value) return "";
    return `<dl class="mini-dl"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></dl>`;
  }

  const COPY_ICON = '<svg class="copy-icon" aria-hidden="true" viewBox="0 0 24 24"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
  const LINK_ICON = '<svg class="copy-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  const CHECK_ICON = '<svg class="copy-check-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';

  // Copy details copies the card as plain text. Copy link opens this page filtered to the one system.
  function copyButtons(row, name, department) {
    const text = [name, row.system_vendor, row.system_purpose, department && `Custodian department: ${department}`]
      .filter(Boolean)
      .join("\n");
    const link = `${window.location.origin}${window.location.pathname}?q=${encodeURIComponent(name)}`;
    return `<div class="software-card__actions"><div class="action-group" role="group" aria-label="Actions: ${escapeHtml(name)}">
      <button type="button" class="copy-button" data-copy-value="${escapeHtml(text)}" data-copy-announce="Copied details to clipboard." aria-label="Copy details: ${escapeHtml(name)}">${COPY_ICON}${CHECK_ICON}</button>
      <button type="button" class="copy-button" data-copy-value="${escapeHtml(link)}" data-copy-announce="Copied link to clipboard." aria-label="Copy link to: ${escapeHtml(name)}">${LINK_ICON}${CHECK_ICON}</button>
    </div></div>`;
  }

  function renderResults(rows) {
    const sorted = [...rows].sort((a, b) =>
      (a.system_name || "").localeCompare(b.system_name || "")
    );

    const departmentCounts = new Map();
    sorted.forEach((row) => {
      const department = (row.custodian_department || "").trim();
      if (!department) return;
      departmentCounts.set(department, (departmentCounts.get(department) || 0) + 1);
    });
    const departments = Array.from(departmentCounts.keys()).sort((a, b) => a.localeCompare(b));

    departmentList.innerHTML = departments
      .map(
        (department) => `
          <li>
            <label>
              <input type="checkbox" data-facet-filter="department" value="${escapeHtml(department)}">
              ${escapeHtml(department)}
              <span class="search-facet-count">(${departmentCounts.get(department)})</span>
            </label>
          </li>
        `
      )
      .join("");

    resultsEl.innerHTML = sorted
      .map((row) => {
        const department = (row.custodian_department || "").trim();
        const searchText = [
          row.system_name,
          row.system_vendor,
          row.system_product,
          row.system_purpose,
          row.data_category,
          department,
          row.data_custodian,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return `
          <li class="app-card" data-search-item
              data-search-text="${escapeHtml(searchText)}"
              data-facet-department="${escapeHtml(department)}">
            <h3 class="software-card__name">${escapeHtml(row.system_name || "Unnamed system")}</h3>
            ${row.system_vendor ? `<p class="software-card__vendor">${escapeHtml(row.system_vendor)}</p>` : ""}
            ${row.system_purpose ? `<p class="software-card__purpose">${escapeHtml(row.system_purpose)}</p>` : ""}
            <details class="software-card__details">
              <summary>More details</summary>
              ${detailRow("System / product", row.system_product)}
              ${detailRow("Data category", row.data_category)}
              ${detailRow("Custodian department", department)}
              ${detailRow("Data custodian", row.data_custodian)}
              ${detailRow("Collection frequency", row.data_collection_frequency)}
              ${detailRow("Update frequency", row.data_update_frequency)}
            </details>
            ${copyButtons(row, row.system_name || "Unnamed system", department)}
          </li>
        `;
      })
      .join("");

    window.MarinSearchLayout.init({
      input: searchInput,
      items: () => Array.from(resultsEl.querySelectorAll("[data-search-item]")),
      facetGroups: [{ name: "department", container: departmentGroup }],
      countEl,
      emptyEl,
      resetButton: document.getElementById("reset-filters-button"),
      toggleButton: document.getElementById("filter-toggle"),
      formatCount: (visible, total) => `${visible} of ${total} software systems`,
    });
    // Added after init so Reset has already cleared the boxes when the summary is read.
    departmentGroup.addEventListener("change", syncDepartmentSummary);
    document.getElementById("reset-filters-button").addEventListener("click", syncDepartmentSummary);
    syncDepartmentSummary();
  }

  // The summary says how many departments are chosen; the group opens on load when a choice came from the address.
  function syncDepartmentSummary() {
    const count = departmentGroup.querySelectorAll('input[data-facet-filter="department"]:checked').length;
    departmentSummary.textContent = count ? `${count} selected` : "All departments";
    if (count) departmentDetails.open = true;
  }

  function showError(message) {
    countEl.textContent = message;
  }

  const cached = readCache(false);
  if (cached) {
    renderResults(cached);
  } else {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    fetch(API_URL, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("bad response"))))
      .then((rows) => {
        writeCache(rows);
        renderResults(rows);
      })
      .catch(() => {
        const stale = readCache(true);
        if (stale) {
          renderResults(stale);
        } else {
          showError("Could not load the software catalog right now. Try reloading the page.");
        }
      })
      .finally(() => clearTimeout(timeout));
  }
})();

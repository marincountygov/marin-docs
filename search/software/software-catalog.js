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
      formatCount: (visible, total) => `${visible} of ${total} software systems`,
    });
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

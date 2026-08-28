/*
 * Generic, data-attribute-driven facet/search engine shared by every tool
 * under search/<tool>/. A new search tool wires its own markup + fetch/render
 * logic, then calls MarinSearchLayout.init() once to get filtering, URL
 * state syncing, and a live result count for free.
 *
 * Contract:
 * - Each result item passed via `items()` carries `data-search-text`
 *   (lowercased searchable blob) and, for every facet group, a
 *   `data-facet-<name>` attribute whose value is one or more facet values
 *   joined with "|".
 * - Each facet group is a container element holding
 *   `input[type=checkbox][data-facet-filter="<name>"]` checkboxes, one per
 *   distinct facet value (value = the facet value).
 */
(() => {
  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function capitalize(name) {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function readStateFromURL(facetNames) {
    const params = new URLSearchParams(window.location.search);
    const facets = {};
    facetNames.forEach((name) => {
      const raw = params.get(name);
      facets[name] = raw ? raw.split(",").filter(Boolean) : [];
    });
    return { query: params.get("q") || "", facets };
  }

  function writeStateToURL(query, facetState) {
    const params = new URLSearchParams(window.location.search);
    if (query) {
      params.set("q", query);
    } else {
      params.delete("q");
    }
    Object.entries(facetState).forEach(([name, values]) => {
      if (values.length) {
        params.set(name, values.join(","));
      } else {
        params.delete(name);
      }
    });
    const next = params.toString();
    const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }

  function init(options) {
    const { input, items, facetGroups = [], countEl, emptyEl, formatCount } = options;
    const facetNames = facetGroups.map((group) => group.name);
    const initialState = readStateFromURL(facetNames);

    if (input && initialState.query) {
      input.value = initialState.query;
    }

    facetGroups.forEach((group) => {
      const selected = initialState.facets[group.name] || [];
      group.container
        .querySelectorAll(`input[type="checkbox"][data-facet-filter="${group.name}"]`)
        .forEach((checkbox) => {
          checkbox.checked = selected.includes(checkbox.value);
        });
    });

    function currentFacetState() {
      const state = {};
      facetGroups.forEach((group) => {
        state[group.name] = Array.from(
          group.container.querySelectorAll(
            `input[type="checkbox"][data-facet-filter="${group.name}"]:checked`
          )
        ).map((checkbox) => checkbox.value);
      });
      return state;
    }

    function applyFilter() {
      const query = (input?.value || "").trim().toLowerCase();
      const facetState = currentFacetState();
      const allItems = items();
      let visible = 0;

      allItems.forEach((item) => {
        const text = item.dataset.searchText || "";
        const matchesQuery = !query || text.includes(query);
        const matchesFacets = facetNames.every((name) => {
          const selected = facetState[name];
          if (!selected.length) return true;
          const itemValues = (item.dataset[`facet${capitalize(name)}`] || "").split("|");
          return selected.some((value) => itemValues.includes(value));
        });
        const match = matchesQuery && matchesFacets;
        item.hidden = !match;
        if (match) visible += 1;
      });

      if (countEl) {
        countEl.textContent = formatCount
          ? formatCount(visible, allItems.length)
          : `${visible} of ${allItems.length} results`;
      }
      if (emptyEl) emptyEl.hidden = visible !== 0;

      writeStateToURL(query, facetState);
    }

    const debouncedFilter = debounce(applyFilter, 150);

    if (input) input.addEventListener("input", debouncedFilter);
    facetGroups.forEach((group) => {
      group.container.addEventListener("change", (event) => {
        if (event.target.matches(`input[type="checkbox"][data-facet-filter="${group.name}"]`)) {
          applyFilter();
        }
      });
    });

    applyFilter();
  }

  window.MarinSearchLayout = { init };
})();

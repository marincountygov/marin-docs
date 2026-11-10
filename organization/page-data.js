// Copy JSON, Download JSON and Download CSV for a page that carries its data as JSON-LD (<script type="application/ld+json" id="page-data">,
// or id="page-data-TAB" on a page with tabs).
// A CSV comes from the rows in <script type="application/json" id="csv-NAME">. The shell does the copying and saving
// (window.marinCopyText, window.marinDownload); a CSV starts with a byte-order mark so Excel reads it.
(() => {
  const say = (button, message) => {
    const status = button.closest(".doc-actions")?.querySelector(".doc-action-status");
    if (status) status.textContent = message;
  };
  // On a page with tabs the buttons follow the tab that is open: they copy and download that tab, and show only
  // what it has (a CSV only where it holds a table, JSON only where it has data). The Dashboard offers the link only.
  const bar = document.querySelector(".doc-actions[data-tabs]");
  const openTab = () => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const inside = id ? document.getElementById(id)?.closest("[data-tab-section]") : null;
    return (inside || document.querySelector("[data-tab-section]"))?.dataset.tabSection || "";
  };
  const sync = () => {
    if (!bar) return;
    const tab = openTab();
    bar.dataset.formatsFor = `#${tab}`;
    // Files are named for the tab: cda-programs.md, cda-budget.json.
    bar.dataset.baseName = bar.dataset.baseName || bar.dataset.fileName;
    bar.dataset.fileName = `${bar.dataset.baseName}-${tab}`;
    bar.querySelectorAll("[data-for-tabs]").forEach((item) => {
      item.hidden = !item.dataset.forTabs.split(" ").includes(tab);
    });
  };
  if (bar) {
    sync();
    window.addEventListener("hashchange", sync);
  }
  const read = () => {
    const holder = document.getElementById(`page-data-${openTab()}`) || document.getElementById("page-data");
    return holder ? JSON.stringify(JSON.parse(holder.textContent), null, 2) : null;
  };
  // One cell: plain characters, quoted when it holds a comma, quote or line break, and a leading = + - @ made harmless.
  const cell = (value) => {
    if (value == null) return "";
    if (typeof value === "number") return String(value);
    let text = window.marinCleanText ? window.marinCleanText(String(value)) : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  document.addEventListener("click", async (event) => {
    const table = event.target instanceof Element ? event.target.closest("[data-download-csv]") : null;
    if (table) {
      const holder = document.getElementById(`csv-${table.dataset.downloadCsv}`);
      if (!holder) return say(table, "No CSV is available for this page");
      const rows = JSON.parse(holder.textContent);
      // A table with its own file name (a table on the page, not the page) is saved under that name.
      const own = table.dataset.fileName;
      const name = own || table.closest(".doc-actions")?.dataset.fileName || "page";
      const suffix = own ? "" : table.dataset.downloadCsv === "table" || name === table.dataset.downloadCsv || name.endsWith(`-${table.dataset.downloadCsv}`) ? "" : `-${table.dataset.downloadCsv}`;
      window.marinDownload({ content: rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n", name: `${name}${suffix}.csv`, type: "text/csv" });
      return say(table, "CSV file downloaded.");
    }
    const target = event.target instanceof Element ? event.target : null;
    const copy = target?.closest("[data-copy-json]");
    const save = target?.closest("[data-download-json]");
    const button = copy || save;
    if (!button) return;
    const text = read();
    if (!text) return say(button, "No JSON is available for this page");
    if (copy) say(button, (await window.marinCopyText(text)) ? "Copied JSON." : "Could not copy.");
    else {
      const name = button.closest(".doc-actions")?.dataset.fileName || "page";
      window.marinDownload({ content: text, name: `${name}.json`, type: "application/ld+json" });
      say(button, "JSON file downloaded.");
    }
  });
})();

// Charts: a chart's own Copy and Download bar, shown like a table's (see chartActions in scripts/page-actions.js).
// window.marinChartImage, marinChartPng and marinChartTitle are also used by a page's own "All PNG" and Copy.
(() => {
  const dateText = () => new Date().toLocaleString([], { month: "short", day: "numeric", year: "numeric" });
  // The card's background goes behind the chart, so light text in dark mode stays readable on a white page or slide.
  const image = (canvas) => {
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const context = out.getContext("2d");
    context.fillStyle = getComputedStyle(canvas.closest(".app-card")).backgroundColor;
    context.fillRect(0, 0, out.width, out.height);
    context.drawImage(canvas, 0, 0);
    return out;
  };
  const titleOf = (canvas) => canvas.closest(".app-card")?.querySelector("h3")?.textContent.trim() || "Chart";
  const summaryOf = (canvas) => {
    const title = titleOf(canvas);
    const label = canvas.getAttribute("aria-label") || "";
    return label.startsWith(`${title}.`) ? label.slice(title.length + 1).trim() : "";
  };
  const download = (canvas) => {
    image(canvas).toBlob((blob) => {
      if (blob) window.marinDownload({ content: blob, name: `${document.title.split(" | ")[0]} - ${titleOf(canvas)} - ${dateText()}.png` });
    });
  };
  window.marinChartImage = image;
  window.marinChartPng = download;
  window.marinChartTitle = titleOf;
  const escape = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  document.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const png = target?.closest("[data-chart-png]");
    const copy = target?.closest("[data-chart-copy]");
    const item = png || copy;
    if (!item) return;
    const bar = item.closest(".chart-actions");
    const say = (message) => { bar.querySelector(".doc-action-status").textContent = message; };
    const canvas = bar.closest(".chart-block")?.querySelector("canvas");
    if (!canvas || !window.Chart || !window.Chart.getChart(canvas)) return say("The chart is not drawn yet.");
    if (png) {
      download(canvas);
      return say("PNG file downloaded.");
    }
    const title = titleOf(canvas);
    const summary = summaryOf(canvas);
    if (copy.dataset.chartCopy === "text") return say((await window.marinCopyText([title, summary].filter(Boolean).join("\n"))) ? "Copied text." : "Could not copy.");
    const html = `<div><b>${escape(title)}</b>${summary ? `<br>${escape(summary)}` : ""}<br><img src="${image(canvas).toDataURL("image/png")}" alt="${escape(title)}" width="${canvas.clientWidth}" height="${canvas.clientHeight}"></div>`;
    say((await window.marinCopyRich([title, summary].filter(Boolean).join("\n"), html)) ? "Copied image." : "Could not copy.");
  });
})();

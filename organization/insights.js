// The Insights tab: builds a prompt from the page's structured data and copies it with the shell's marinCopyText.
// Static sections are JSON in the page (<script type="application/json" id="insights-data-NAME">); live sections
// (Marin Mentions, Marin Reach, Marin Links) are fetched from the published files when the tab opens.
(() => {
  const root = document.querySelector("[data-insights]");
  if (!root) return;
  const subject = root.dataset.subject;
  const noun = root.dataset.noun;
  const boxes = [...root.querySelectorAll("input[data-insights-section]")];
  const question = root.querySelector("[data-insights-question]");
  const preview = root.querySelector("[data-insights-preview]");
  const status = root.querySelector("[data-insights-status]");
  const dayMs = 86400000;
  const expand = (url) => url.replace(/\{date:(-?\d+)\}/g, (_, offset) => new Date(Date.now() + Number(offset) * dayMs).toISOString().slice(0, 10));
  const pick = (value, path) => String(path || "").split(".").filter(Boolean).reduce((found, key) => (found == null ? found : found[key]), value);

  // What each live source gives the prompt.
  const loaders = {
    async mentions(c) {
      // One file for the agency and one for each division; a mention found in several is kept once.
      const files = await Promise.all(c.url.split(/\s+/).filter(Boolean).map((url) => fetch(expand(url), { cache: "no-store", credentials: "omit" }).then((r) => r.json()).catch(() => null)));
      const seen = new Set();
      const items = files.flatMap((body) => (body && pick(body, c.path || "items")) || []).filter((m) => (seen.has(m.id) ? false : seen.add(m.id))).sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
      return {
        note: "The latest mentions Marin Mentions found, newest first. Marin Mentions keeps about the past 60 days.",
        total: items.length,
        mentions: items.slice(0, 30).map((m) => ({ date: m.date || String(m.publishedAt || "").slice(0, 10), source: m.source, type: m.sourceType, title: m.title, url: m.url })),
      };
    },
    async reach(c) {
      const body = await (await fetch(expand(c.url), { cache: "no-store", credentials: "omit" })).json();
      const mine = (body.records || []).filter((r) => (r.agencies || []).includes(subject)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const campaigns = new Map();
      mine.forEach((r) => {
        const one = campaigns.get(r.project) || { campaign: r.project, engagements: 0, firstDate: r.date, lastDate: r.date, statuses: {} };
        one.engagements += 1;
        one.lastDate = r.date > one.lastDate ? r.date : one.lastDate;
        one.firstDate = r.date < one.firstDate ? r.date : one.firstDate;
        one.statuses[r.status] = (one.statuses[r.status] || 0) + 1;
        campaigns.set(r.project, one);
      });
      return {
        note: "Public engagement events from Marin Reach where this organization is named. A campaign is a Reach project.",
        campaigns: [...campaigns.values()],
        engagements: mine.map((r) => ({ date: r.date, startTime: r.startTime, event: r.eventName, campaign: r.project, type: r.type, status: r.status, location: r.location, partners: r.partners })),
      };
    },
    async links(c) {
      const body = await (await fetch(expand(c.url), { cache: "no-store", credentials: "omit" })).json();
      if (pick(body, "meta.suppressed") === true) return { note: "Marin Links does not show counts under 5 visits, so no link figures are available." };
      return { note: "Tracked short links for this organization over the past 30 days.", links: (pick(body, "data.items") || []).map((l) => ({ link: l.display, visits: l.redirects })) };
    },
  };

  const cache = new Map();
  const staticData = (id) => {
    const holder = document.getElementById(`insights-data-${id}`);
    return holder ? JSON.parse(holder.textContent) : null;
  };
  const load = (box) => {
    const id = box.dataset.insightsSection;
    if (!box.dataset.insightsLive) return Promise.resolve(staticData(id));
    if (!cache.has(id)) {
      const config = JSON.parse(box.dataset.insightsLive);
      cache.set(id, loaders[config.kind](config).catch((error) => {
        console.error(error);
        return { note: `${config.label} could not be loaded when this prompt was made.` };
      }));
    }
    return cache.get(id);
  };

  const RULES = [
    `You are helping a County of Marin staff member understand ${subject}. The data below comes from Marin Docs and the County's own published sources.`,
    "",
    "Rules:",
    "- Answer only from the data below. Do not use outside knowledge about the County.",
    "- If the data does not answer the question, say so, and say what data would.",
    "- Label every statement: Confirmed (the data says so; name the section), Inferred (the data implies it), or Open question (more data or a decision is needed).",
    "- Give figures as printed and name the fiscal year. Do not recalculate a figure the data already gives; say when you add or compare figures yourself.",
    "- Use plain language.",
    "- Do not repeat personal information beyond the names and titles of officeholders in the data.",
  ];

  const build = async () => {
    const chosen = boxes.filter((box) => box.checked);
    const parts = await Promise.all(chosen.map(async (box) => [box.parentElement.textContent.trim(), await load(box)]));
    const notes = [`- Prepared on ${new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })}.`];
    if (root.dataset.budgetNote && chosen.some((box) => box.dataset.insightsSection === "budget")) notes.push(`- ${root.dataset.budgetNote}`);
    const text = [
      ...RULES, "", "About this data:", ...notes, "",
      ...parts.flatMap(([label, data]) => [`## ${label}`, "```json", JSON.stringify(data, null, 1), "```", ""]),
      "## My question", question.value.trim() || `Summarize what matters most in this data about this ${noun}, and what I should ask next.`, "",
    ].join("\n");
    return text;
  };

  // The prompt is rebuilt when a choice or the question changes, so the preview and Copy prompt always agree.
  const refresh = async () => {
    const text = await build();
    preview.textContent = text;
    return text;
  };

  // Live sources load when the tab opens; the static ones are ready at once.
  const section = root.closest("[data-tab-section]") || root;
  let started = false;
  const start = () => {
    if (started || section.hidden) return;
    started = true;
    refresh();
  };
  start();
  if (!started) new MutationObserver(start).observe(section, { attributes: true, attributeFilter: ["hidden"] });

  boxes.forEach((box) => box.addEventListener("change", () => refresh()));
  question.addEventListener("input", () => {
    clearTimeout(question.timer);
    question.timer = setTimeout(refresh, 300);
  });
  // Preview shows the prompt as it will be copied; Reset puts every choice back and clears the question.
  const toggle = root.querySelector("[data-insights-preview-toggle]");
  toggle.addEventListener("click", async () => {
    const open = preview.hidden;
    preview.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) await refresh();
  });
  root.querySelector("[data-insights-reset]").addEventListener("click", () => {
    boxes.forEach((box) => { box.checked = true; });
    question.value = "";
    preview.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    status.textContent = "Reset.";
    refresh();
  });
  root.querySelector("[data-insights-copy]").addEventListener("click", async () => {
    const text = await refresh();
    const ok = await window.marinCopyText(text);
    status.textContent = ok ? "Copied. Paste it into your chatbot." : "Copy did not work. Open the preview, select the text and copy it by hand.";
  });
})();

#!/usr/bin/env node
// guides/<slug>/*.html is generated from a guide's Markdown (guides/<slug>/source/*.md) plus the small structured-data
// config next to it (guides/<slug>/data/guide.json, checked against guides/schema/guide.schema.json). It does not edit
// itself: change the source or the config, then re-run
//
//   node scripts/build-guide.js            every guide that has a data/guide.json
//   node scripts/build-guide.js <slug>     one guide
//
// and, before committing: node scripts/stamp-updated-dates.js
//
// The Markdown is the source of the words (an H2 is a page, an H3 a section, lists, numbered steps, tables and checklists
// keep their shape). The config names what is structured: the page order and groups, an optional lifecycle with a landing
// page for each step, content limits (specs), key terms and links. Besides the pages this writes
// guides/<slug>/structured-data.json (the whole guide as JSON-LD) and puts a JSON-LD block in each page. A spec or
// term whose quoted text is no longer in the Markdown stops the build, so the data cannot drift from the words.

const fs = require("fs");
const path = require("path");
const { validate } = require("./guide-schema.js");

const repoRoot = path.join(__dirname, "..");
const guidesDir = path.join(repoRoot, "guides");
const guideSlug = process.argv[2];

if (!guideSlug) {
  // No guide named: build each one that has a config, one process per guide.
  const { execFileSync } = require("child_process");
  const slugs = fs.readdirSync(guidesDir).filter((name) => fs.existsSync(path.join(guidesDir, name, "data", "guide.json")));
  if (!slugs.length) {
    console.error("build-guide: no guide has a data/guide.json");
    process.exit(1);
  }
  for (const slug of slugs) execFileSync(process.execPath, [__filename, slug], { stdio: "inherit" });
  process.exit(0);
}

const guideDir = path.join(guidesDir, guideSlug);
const config = JSON.parse(fs.readFileSync(path.join(guideDir, "data", "guide.json"), "utf8"));
const schemaErrors = validate(JSON.parse(fs.readFileSync(path.join(guidesDir, "schema", "guide.schema.json"), "utf8")), config);
if (schemaErrors.length) {
  console.error(`build-guide: guides/${guideSlug}/data/guide.json does not match guides/schema/guide.schema.json:\n  ${schemaErrors.join("\n  ")}`);
  process.exit(1);
}
if (config.slug !== guideSlug) {
  console.error(`build-guide: guides/${guideSlug}/data/guide.json says slug "${config.slug}"`);
  process.exit(1);
}
const markdown = fs.readFileSync(path.resolve(guideDir, "data", config.source), "utf8");

// Defaults for what a guide does not set.
config.specs = config.specs || [];
config.terms = config.terms || [];
config.links = config.links || {};
config.pages = config.pages || {};
const LABELS = { phase: "In this phase", limits: "Limits", training: "Training example", links: "Links", ...(config.labels || {}) };
const LIFECYCLE = config.lifecycle ? config.lifecycle.steps : [];
const LIFECYCLE_LABEL = config.lifecycle ? config.lifecycle.label : "";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- shared chrome (byte-identical to scripts/build-pmr-guide.js) ---

const FAVICON =

  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' rx='10' fill='%23000'/%3E%3Cg fill='none' stroke='%23e5b53b' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='9' y='9' width='12' height='12' rx='2'/%3E%3Crect x='27' y='9' width='12' height='12' rx='2'/%3E%3Crect x='9' y='27' width='12' height='12' rx='2'/%3E%3Crect x='27' y='27' width='12' height='12' rx='2'/%3E%3C/g%3E%3C/svg%3E";

const BANNER = `<marin-os-banner></marin-os-banner>`;

const DOC_ICON = `<svg viewBox="0 0 48 48"><path d="M24 12c-4-2-10-3-15-2v24c5-1 11 0 15 2 4-2 10-3 15-2V10c-5-1-11 0-15 2z"/><path d="M24 12v24"/></svg>`;

const FOOTER = `<footer class="site-footer" role="contentinfo"><div class="footer-inner"><a href="https://marincountygov.github.io/marin-os/">MarinOS</a></div></footer><a class="app-feedback" href="https://form.asana.com/?k=qVUT83d5DBmlDiIyi-WAyQ&amp;d=23133298259496" target="_blank" rel="noreferrer">Feedback</a>`;

// --- Markdown ---

function inline(text) {
  return esc(text)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function plain(text) {
  return String(text).replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function slugify(text) {
  return plain(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Returns { title, pages: [{ title, slug, intro: [block], sections: [{ title, id, blocks }] }] }.
// Blocks: p, ul, ol, checklist, table. "# " headings (the guide title and the
// Part labels) and "---" rules carry no content of their own.
function parseMarkdown(md) {
  const guide = { title: "", pages: [] };
  let page = null;
  let section = null;
  let list = null;
  let table = null;
  let para = [];
  const target = () => (section ? section.blocks : page ? page.intro : null);
  const flush = () => {
    if (para.length && target()) target().push({ type: "p", text: para.join(" ") });
    para = [];
    list = null;
    table = null;
  };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    let m;
    if (/^# /.test(line)) {
      flush();
      if (!guide.title) guide.title = line.slice(2).trim();
    } else if ((m = line.match(/^## (.+)/))) {
      flush();
      section = null;
      page = { title: m[1].trim(), slug: slugify(m[1]), intro: [], sections: [] };
      guide.pages.push(page);
    } else if ((m = line.match(/^### (.+)/))) {
      flush();
      section = { title: m[1].trim(), id: slugify(m[1]), blocks: [] };
      page.sections.push(section);
    } else if (/^---+$/.test(line) || line === "") {
      flush();
    } else if ((m = line.match(/^- \[[ x]\] (.+)/))) {
      if (!list || list.type !== "checklist") { flush(); list = { type: "checklist", items: [] }; target().push(list); }
      list.items.push(m[1]);
    } else if ((m = line.match(/^- (.+)/))) {
      if (!list || list.type !== "ul") { flush(); list = { type: "ul", items: [] }; target().push(list); }
      list.items.push(m[1]);
    } else if ((m = line.match(/^\d+\. (.+)/))) {
      if (!list || list.type !== "ol") { flush(); list = { type: "ol", items: [] }; target().push(list); }
      list.items.push(m[1]);
    } else if (line.startsWith("|")) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^-+$/.test(c))) continue;
      if (!table) { flush(); table = { type: "table", head: cells, rows: [] }; target().push(table); }
      else table.rows.push(cells);
    } else {
      list = null;
      table = null;
      para.push(line.trim());
    }
  }
  flush();
  return guide;
}

const source = parseMarkdown(markdown);
const indexSource = source.pages.find((pg) => pg.title === (config.indexPage || (source.pages[0] && source.pages[0].title)));
if (!indexSource) {
  console.error(`build-guide: indexPage "${config.indexPage}" is not an H2 in the playbook`);
  process.exit(1);
}
indexSource.slug = "index";

// A section that deserves a page of its own (config.split): "During engagement" covers three lifecycle steps, and each
// step should be its own page so every step of the lifecycle goes to a page of its own.
for (const rule of config.split || []) {
  const parent = source.pages.find((pg) => pg.title === rule.from);
  if (!parent) fail(`split names a page that is not in the playbook: ${rule.from}`);
  for (const title of rule.sections) {
    const section = parent.sections.find((sec) => sec.title === title);
    if (!section) fail(`split names a section that is not on ${rule.from}: ${title}`);
    parent.sections = parent.sections.filter((sec) => sec !== section);
    source.pages.splice(source.pages.indexOf(parent) + 1 + rule.sections.indexOf(title), 0, { title, slug: slugify(title), intro: section.blocks, sections: [] });
  }
}

// --- Check the config against the words ---

function fail(message) {
  console.error(`build-guide: ${message}`);
  process.exit(1);
}

for (const spec of config.specs) if (!markdown.includes(spec.evidence)) fail(`spec "${spec.id}" is not in the playbook: ${spec.evidence}`);
for (const term of config.terms) if (!markdown.includes(term.description)) fail(`term "${term.name}" is not in the playbook: ${term.description}`);

// Each lifecycle step has a landing page of its own: the playbook's sentence for the step (from "How it works"), then links to
// the pages of that phase. A page belongs to a phase through its config (pages.<slug>.stage), and the step goes to the
// landing page, never to one of the phase's pages, so no page looks like "the" thing to do first.
const stepTexts = new Map();
if (config.lifecycle) {
  const stepSource = source.pages.find((pg) => pg.title === config.lifecycle.source);
  const stepList = stepSource && stepSource.intro.find((b) => b.type === "ol");
  if (!stepList) fail(`the playbook has no numbered list of steps on ${config.lifecycle.source}`);
  for (const item of stepList.items) {
    const m = item.match(/^\*\*(.+?)\.\*\*\s*(.*)$/);
    if (m) stepTexts.set(m[1], m[2]);
  }
}
const PHASE_PAGES = LIFECYCLE.map(({ stage, page }) => {
  if (!stepTexts.has(stage)) fail(`${config.lifecycle.source} has no step called ${stage}`);
  return { title: stage, slug: page, generated: "phase", intro: [], sections: [], phase: { stage, text: stepTexts.get(stage) } };
});
const SPECS_PAGE = config.specs.length ? config.specsPage || { title: "Content limits", description: "The length and format limits in this guide, in one place." } : null;
const LINK_PAGES = config.linkPages || (Object.keys(config.links).length ? [{ slug: "links", title: "Links", description: "Links for this guide.", links: Object.keys(config.links) }] : []);
for (const lp of LINK_PAGES) for (const key of lp.links) if (!config.links[key]) fail(`link page ${lp.title} names a link that is not defined: ${key}`);
const GENERATED_PAGES = [
  ...(SPECS_PAGE ? [{ title: SPECS_PAGE.title, slug: "content-limits", generated: "specs", intro: [], sections: [] }] : []),
  ...LINK_PAGES.map((lp) => ({ title: lp.title, slug: lp.slug, generated: "links", linkPage: lp, intro: [], sections: [] }))
];
for (const pg of source.pages) pg.sourceTitle = pg.title;
const allPages = [...source.pages, ...GENERATED_PAGES, ...PHASE_PAGES];
for (const [from, to] of Object.entries(config.titles || {})) {
  const pg = allPages.find((x) => x.title === from);
  if (!pg) fail(`titles names a page that is not in the playbook: ${from}`);
  pg.title = to;
}
const bySlug = new Map(allPages.map((p) => [p.slug, p]));
const fileFor = (slug) => (slug === "index" ? "index.html" : `${slug}.html`);

const outlinePages = [];
const groups = config.groups.map((g) => ({
  name: g.name,
  pages: g.pages.map((title) => {
    const p = allPages.find((x) => x.title === title);
    if (!p) fail(`group "${g.name}" lists a page that is not in the playbook: ${title}`);
    outlinePages.push(p);
    p.group = g.name;
    return p;
  })
}));
for (const p of allPages) if (!outlinePages.includes(p)) fail(`page "${p.title}" is not in any group`);
for (const [slug] of Object.entries(config.pages)) if (!bySlug.has(slug)) fail(`config names a page that is not in the playbook: ${slug}`);
for (const term of config.terms) if (!bySlug.has(term.page)) fail(`term "${term.name}" names a missing page: ${term.page}`);
for (const [slug, cfg] of Object.entries(config.pages)) if (cfg.stage && !LIFECYCLE.some((l) => l.stage === cfg.stage)) fail(`page ${slug} names a stage that is not in the lifecycle: ${cfg.stage}`);
for (const stage of LIFECYCLE) if (!outlinePages.some((x) => config.pages[x.slug] && config.pages[x.slug].stage === stage.stage)) fail(`no page belongs to the lifecycle step ${stage.stage}`);
for (const stage of LIFECYCLE) if (!bySlug.has(stage.page)) fail(`lifecycle stage "${stage.stage}" names a missing page: ${stage.page}`);

const pageConfig = (p) => config.pages[p.slug] || {};

// --- Structured pieces ---

function specText(spec) {
  if (spec.value) return spec.value;
  const unit = (n) => `${n} ${spec.unit}${n === 1 ? "" : "s"}`;
  if (spec.min == null) return `${unit(spec.max)} or fewer`;
  return `${spec.min}–${spec.max} ${spec.unit}s`;
}

function specData(spec) {
  const out = { "@type": "PropertyValue", "@id": `${config.baseUrl}/content-limits.html#${spec.id}`, name: spec.label };
  if (spec.value) out.value = spec.value;
  else {
    if (spec.min != null) out.minValue = spec.min;
    out.maxValue = spec.max;
    out.unitText = spec.unit;
  }
  return out;
}

function specsTable(ids) {
  const rows = ids
    .map((id) => config.specs.find((s) => s.id === id))
    .map((s) => `<tr><th scope="row">${esc(s.label)}</th><td>${esc(specText(s))}</td></tr>`)
    .join("");
  return `<table class="guide-specs"><thead><tr><th scope="col">Content</th><th scope="col">Limit</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// The lifecycle is a way around the guide, not page content, so it is drawn above the page (outside .content). The step
// the page belongs to carries aria-current="step". Every step is a link to its landing page, except on that landing page
// itself, where it is plain text because a link to the page you are on does nothing.
function renderLifecycle(current, slug) {
  return `<nav class="guide-lifecycle" aria-label="${esc(LIFECYCLE_LABEL)}"><ol>${LIFECYCLE
    .map(({ stage, page }) => {
      const isCurrent = stage === current;
      if (isCurrent && page === slug) return `<li><span aria-current="step">${esc(stage)}</span></li>`;
      return `<li><a href="${fileFor(page)}"${isCurrent ? ' aria-current="step"' : ""}>${esc(stage)}</a></li>`;
    })
    .join("")}</ol></nav>`;
}

// --- Page chrome ---

function renderOutline(active) {
  return `<aside class="guide-outline" aria-label="Guide outline">${groups
    .map(
      (g) =>
        `<div><h2>${esc(g.name)}</h2><ul>${g.pages
          .map((p) => `<li><a href="${fileFor(p.slug)}"${p === active ? ' aria-current="page"' : ""}>${esc(p.title)}</a></li>`)
          .join("")}</ul></div>`
    )
    .join("")}</aside>`;
}

const ARROW_LEFT = '<svg class="guide-pager__arrow" aria-hidden="true" viewBox="0 0 24 24"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>';
const ARROW_RIGHT = '<svg class="guide-pager__arrow" aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';

function renderPager(active) {
  const i = outlinePages.indexOf(active);
  const prev = outlinePages[i - 1];
  const next = outlinePages[i + 1];
  if (!prev && !next) return "";
  const prevHtml = prev ? `<a class="guide-pager__prev" href="${fileFor(prev.slug)}"><span class="guide-pager__direction">${ARROW_LEFT}Previous</span>${esc(prev.title)}</a>` : "";
  const nextHtml = next ? `<a class="guide-pager__next" href="${fileFor(next.slug)}"><span class="guide-pager__direction">Next${ARROW_RIGHT}</span>${esc(next.title)}</a>` : "";
  return `<nav class="guide-pager" aria-label="Guide pages">${prevHtml}${nextHtml}</nav>`;
}

const CARET = '<svg class="menu-toggle__caret" aria-hidden="true" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg>';

function menuItems(attribute, items) {
  return items.map(([value, label]) => `<button type="button" data-button-kind="menu-item" ${attribute}="${value}">${label}</button>`).join("");
}

// Copy link, Copy and Download are icon-only (the name is the aria-label and the title), in that order everywhere. The buttons carry only what to do (data-copy-format, data-download-format, data-action="share"). the shell reads the page (data-formats-for) and hands its text, HTML and Markdown to marinCopyRich, marinCopyText and marinDownload; guides/guide-actions.js adds the JSON downloads.
function renderDocActions(p) {
  const fileName = p.slug === "index" ? config.slug : p.slug;
  return `<div class="doc-actions" data-formats-for="article.content" data-file-name="${esc(fileName)}" data-guide-name="${esc(config.slug)}" data-guide-json="structured-data.json"><div class="action-group" role="group" aria-label="Page actions"><button type="button" class="action-button" data-action="share" data-icon="link" aria-label="Copy link" title="Copy link"></button></div>` +
    `<div class="menu"><button type="button" class="action-button menu-toggle" data-icon="copy" aria-expanded="false" aria-controls="copy-panel" aria-label="Copy, choose a format" title="Copy">${CARET}</button><div id="copy-panel" class="menu-panel" hidden>${menuItems("data-copy-format", [["text", "Text"], ["html", "HTML"], ["markdown", "Markdown"]])}</div></div>` +
    `<div class="menu"><button type="button" class="action-button menu-toggle" data-icon="download" aria-expanded="false" aria-controls="download-panel" aria-label="Download, choose a format" title="Download">${CARET}</button><div id="download-panel" class="menu-panel" hidden>${menuItems("data-download-format", [["text", "Text"], ["html", "HTML"], ["markdown", "Markdown"], ["json", "JSON (this page)"], ["guide-json", "JSON (whole guide)"]])}</div></div>` +
    `<span class="doc-action-status" role="status" aria-live="polite"></span></div>`;
}

// --- Content ---

function renderBlock(block) {
  if (block.type === "p") return `<p>${inline(block.text)}</p>`;
  if (block.type === "ul") return `<ul>${block.items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`;
  if (block.type === "ol") return `<ol>${block.items.map((i) => `<li>${inline(i)}</li>`).join("")}</ol>`;
  if (block.type === "checklist")
    return `<ul class="guide-checklist">${block.items
      .map((item, n) => `<li><label><input type="checkbox" id="check-${n + 1}"> <span>${inline(item)}</span></label></li>`)
      .join("")}</ul>`;
  if (block.type === "table")
    return `<table><thead><tr>${block.head.map((h) => `<th scope="col">${inline(h)}</th>`).join("")}</tr></thead><tbody>${block.rows
      .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
  return "";
}

function renderLinksSection(p) {
  const links = (pageConfig(p).links || []).map((key) => config.links[key]);
  if (!links.length) return null;
  return {
    id: "links",
    label: LABELS.links,
    html: `<section class="section" id="links"><h2>${esc(LABELS.links)}</h2><ul>${links
      .map((l) => `<li><a href="${l.url}" target="_blank" rel="noreferrer">${esc(l.label)}</a></li>`)
      .join("")}</ul></section>`
  };
}

// The guide's home page: where each part of the guide begins, not a copy of the menu. The lifecycle steps carry the
// playbook's own sentence for each step; the other lists give every page with its first sentence.
// Without a home config the home page lists each group of the menu, with the first sentence of every page.
function defaultHomeSections() {
  return config.groups
    .map((g) => ({ id: slugify(g.name), title: g.name, pages: g.pages.filter((title) => allPages.find((x) => x.title === title).slug !== "index") }))
    .filter((sec) => sec.pages.length);
}

function renderHome(p) {
  const card = (href, title, text) => `<li><a href="${href}"><span class="guide-quick-links__question">${esc(title)}</span><span class="guide-quick-links__text">${esc(text)}</span></a></li>`;
  const out = [];
  const toc = [];
  const sections = config.home ? config.home.sections : defaultHomeSections();
  for (const sec of sections) {
    let intro = "";
    let items;
    if (sec.lifecycle) {
      const source = p.sections.find((x) => x.title === sec.source);
      intro = source ? source.blocks.filter((b) => b.type === "p" && !b.text.startsWith("**")).map(renderBlock).join("") : "";
      items = LIFECYCLE.map(({ stage, page }, i) => card(fileFor(page), `${i + 1}. ${stage}`, stepTexts.get(stage)));
    } else {
      items = sec.pages.map((title) => {
        const target = allPages.find((x) => x.title === title);
        if (!target) fail(`home lists a page that is not in the playbook: ${title}`);
        return card(fileFor(target.slug), target.title, summaryOf(target));
      });
    }
    toc.push({ id: sec.id, label: sec.title });
    out.push(`<section class="section" id="${sec.id}"><h2>${esc(sec.title)}</h2>${intro}<ul class="guide-quick-links">${items.join("")}</ul></section>`);
  }
  return { html: out.join("\n"), toc };
}

// One sentence about a page, for a list of links: its first paragraph.
function summaryOf(p) {
  if (p.generated === "phase") return p.phase.text;
  if (p.generated === "specs") return SPECS_PAGE.description;
  if (p.generated === "links") return p.linkPage.description;
  const first = p.intro[0];
  return first && first.type === "p" ? plain(first.text) : "";
}

function phaseOf(p) {
  const stage = pageConfig(p).stage;
  const step = stage && LIFECYCLE.find((l) => l.stage === stage);
  return step && p.generated !== "phase" ? bySlug.get(step.page) : null;
}

function buildPage(p) {
  const cfg = pageConfig(p);
  const toc = [];
  const parts = [];
  let description;
  let intro = p.intro.slice();
  if (p.generated === "specs") {
    description = SPECS_PAGE.description;
    parts.push(specsTable(config.specs.map((s) => s.id)));
  } else if (p.generated === "links") {
    description = p.linkPage.description;
    parts.push(`<ul class="guide-quick-links">${p.linkPage.links.map((key) => config.links[key])
      .map((l) => `<li><a href="${l.url}" target="_blank" rel="noreferrer"><span class="guide-quick-links__question">${esc(l.label)}</span><span class="guide-quick-links__text">${esc(l.description)}</span><span class="guide-quick-links__text">${esc(new URL(l.url).host + new URL(l.url).pathname.replace(/\/$/, ""))}</span><span class="visually-hidden"> (opens in a new tab)</span></a></li>`)
      .join("")}</ul>`);
  } else if (p.generated === "phase") {
    description = p.phase.text;
    const members = outlinePages.filter((x) => pageConfig(x).stage === p.phase.stage);
    parts.push(`<section class="section" id="pages"><h2>${esc(LABELS.phase)}</h2><ul class="guide-quick-links">${members
      .map((x) => `<li><a href="${fileFor(x.slug)}"><span class="guide-quick-links__question">${esc(x.title)}</span><span class="guide-quick-links__text">${esc(summaryOf(x))}</span></a></li>`)
      .join("")}</ul></section>`);
  } else {
    const first = intro[0];
    if (first && first.type === "p") {
      description = plain(first.text);
      intro = intro.slice(1);
    } else {
      description = `Part of the ${config.name}.`;
    }
  }
  if (cfg.training) {
    const i = intro.findIndex((b) => b.type === "p" && b.text.startsWith("*These examples"));
    const sectionNote = p.sections.length && p.sections[p.sections.length - 1].blocks;
    const noteIndex = sectionNote ? sectionNote.findIndex((b) => b.type === "p" && b.text.startsWith("*These examples")) : -1;
    let note = null;
    if (i >= 0) note = intro.splice(i, 1)[0];
    else if (noteIndex >= 0) note = sectionNote.splice(noteIndex, 1)[0];
    if (note) parts.push(`<div class="guide-example"><span class="guide-example__label">${esc(LABELS.training)}</span><p>${inline(note.text.replace(/^\*|\*$/g, ""))}</p></div>`);
  }
  if (cfg.specs) parts.push(`<section class="section" id="limits"><h2>${esc(LABELS.limits)}</h2>${specsTable(cfg.specs)}</section>`), toc.push({ id: "limits", label: LABELS.limits });
  parts.push(...intro.map(renderBlock));
  if (p.slug === "index") {
    const home = renderHome(p);
    parts.push(home.html);
    toc.push(...home.toc);
  }
  for (const s of p.sections) {
    if (p.slug === "index") break;
    toc.push({ id: s.id, label: s.title });
    let body;
    if (p.slug === "index" && s.title === "The lifecycle") body = s.blocks.filter((b) => !b.text || !b.text.startsWith("**")).map(renderBlock).join("");
    else if (p.slug === "index" && s.title === "Contents") body = renderContents();
    else body = s.blocks.map(renderBlock).join("\n");
    parts.push(`<section class="section" id="${s.id}"><h2>${esc(s.title)}</h2>${body}</section>`);
  }
  const links = renderLinksSection(p);
  if (links) {
    toc.push({ id: links.id, label: links.label });
    parts.push(links.html);
  }
  return { description, toc, body: parts.join("\n"), stage: p.generated === "phase" ? p.phase.stage : cfg.stage };
}

// --- JSON-LD ---

function pageUrl(p) {
  return p.slug === "index" ? `${config.baseUrl}/` : `${config.baseUrl}/${p.slug}.html`;
}

function listItems(items) {
  return items.map((text, i) => ({ "@type": "ListItem", position: i + 1, name: plain(text) }));
}

function pageLd(p, built) {
  const node = {
    "@type": "TechArticle",
    "@id": pageUrl(p),
    url: pageUrl(p),
    name: p.title,
    headline: p.title,
    description: built.description,
    inLanguage: "en",
    audience: { "@type": "Audience", audienceType: config.audience },
    publisher: { "@type": "GovernmentOrganization", name: config.publisher },
    isPartOf: { "@type": "CreativeWork", "@id": `${config.baseUrl}/`, name: config.name }
  };
  const all = [...p.intro, ...p.sections.flatMap((s) => s.blocks)];
  // The heading a list or table sits under names it in the data.
  const headingFor = (block) => (p.intro.includes(block) ? p.title : (p.sections.find((sec) => sec.blocks.includes(block)) || {}).title || p.title);
  const steps = all.find((b) => b.type === "ol" && config.lifecycle && p.sourceTitle === config.lifecycle.source);
  if (steps)
    node.mainEntity = {
      "@type": "HowTo",
      name: p.title,
      step: steps.items.map((item, i) => {
        const m = item.match(/^\*\*(.+?)\.\*\*\s*(.*)$/);
        return { "@type": "HowToStep", position: i + 1, name: m ? m[1] : plain(item), text: m ? m[2] : "" };
      })
    };
  const table = all.find((b) => b.type === "table");
  if (table)
    node.mainEntity = {
      "@type": "ItemList",
      name: headingFor(table),
      itemListElement: table.rows.map((r, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: `${table.head[0]}: ${r[0]}; ${table.head[1]}: ${r[1]}`
      }))
    };
  const checklist = all.find((b) => b.type === "checklist");
  if (checklist) node.mainEntity = { "@type": "ItemList", name: headingFor(checklist), itemListElement: listItems(checklist.items) };
  const ids = p.generated === "specs" ? config.specs.map((s) => s.id) : pageConfig(p).specs;
  if (ids) node.additionalProperty = ids.map((id) => specData(config.specs.find((s) => s.id === id)));
  return node;
}

function guideLd(builtPages) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CreativeWork",
        "@id": `${config.baseUrl}/`,
        name: config.name,
        description: config.description,
        inLanguage: "en",
        audience: { "@type": "Audience", audienceType: config.audience },
        publisher: { "@type": "GovernmentOrganization", name: config.publisher },
        hasPart: allPages.map((p) => ({ "@id": pageUrl(p) })),
        ...(config.lifecycle
          ? {
              mainEntity: {
                "@type": "HowTo",
                name: `${config.name}: ${config.lifecycle.label}`,
                step: LIFECYCLE.map((step, i) => ({ "@type": "HowToStep", position: i + 1, name: step.stage, url: pageUrl(bySlug.get(step.page)) }))
              }
            }
          : {})
      },
      ...(config.terms.length
        ? [
            {
              "@type": "DefinedTermSet",
              "@id": `${config.baseUrl}/#terms`,
              name: `${config.name} key terms`,
              hasDefinedTerm: config.terms.map((t) => ({ "@type": "DefinedTerm", name: t.name, description: t.description, url: pageUrl(bySlug.get(t.page)) }))
            }
          ]
        : []),
      ...allPages.map((p) => pageLd(p, builtPages.get(p)))
    ]
  };
}

// --- Write ---

function pageShell(p, built) {
  const breadcrumb =
    p.slug === "index"
      ? `<a href="../../index.html">Marin Docs</a> <span aria-hidden="true">/</span> <a href="../index.html">Guides</a> <span aria-hidden="true">/</span> ${esc(config.name)}`
      : `<a href="../../index.html">Marin Docs</a> <span aria-hidden="true">/</span> <a href="../index.html">Guides</a> <span aria-hidden="true">/</span> <a href="index.html">${esc(config.name)}</a> <span aria-hidden="true">/</span> ${phaseOf(p) ? `<a href="${fileFor(phaseOf(p).slug)}">${esc(phaseOf(p).title)}</a> <span aria-hidden="true">/</span> ` : ""}${esc(p.title)}`;
  const toc = built.toc.length
    ? `<aside class="toc" aria-label="On this page"><h2>On this page</h2><ul>${built.toc.map((t) => `<li><a href="#${t.id}">${esc(t.label)}</a></li>`).join("")}</ul></aside>`
    : "";
  const title = p.slug === "index" ? config.name : p.title;
  const ld = JSON.stringify({ "@context": "https://schema.org", ...pageLd(p, built) });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | Marin Docs</title><link rel="icon" type="image/svg+xml" href="${FAVICON}"><meta name="description" content="${esc(built.description.slice(0, 300))}"><link rel="stylesheet" href="../styles.css"></head><body><a class="skip-link" href="#main">Skip to main content</a>${BANNER}<header class="site-header"><div class="header-inner"><span class="docs-brand-icon" aria-hidden="true">${DOC_ICON}</span><nav class="breadcrumb-nav" aria-label="Breadcrumb">${breadcrumb}</nav></div></header><main id="main" class="page" tabindex="-1">${LIFECYCLE.length && (p.slug === "index" || built.stage || pageConfig(p).lifecycle) ? renderLifecycle(built.stage, p.slug) : ""}<div class="guide-layout">${renderOutline(p)}<article class="content"><h1 class="doc-title">${esc(title)}</h1><p class="doc-description">${esc(built.description)}</p><p class="doc-updated">Updated recently</p>${renderDocActions(p)}
${built.body}
${renderPager(p)}</article>${toc}</div></main>${FOOTER}<script type="application/ld+json">${ld.replace(/</g, "\\u003c")}</script><script src="../../vendor/marinos/marinos.js" defer></script><script src="../guide-actions.js" defer></script></body></html>`;
}

const built = new Map(allPages.map((p) => [p, buildPage(p)]));
for (const p of allPages) {
  const file = path.join(guideDir, fileFor(p.slug));
  const next = pageShell(p, built.get(p));
  // Keep the stamped "Updated" line of a page whose content did not change.
  let out = next;
  if (fs.existsSync(file)) {
    const stamp = fs.readFileSync(file, "utf8").match(/<p class="doc-updated">Updated [^<]*<\/p>/);
    if (stamp) out = next.replace('<p class="doc-updated">Updated recently</p>', stamp[0]);
  }
  fs.writeFileSync(file, out);
}
fs.writeFileSync(path.join(guideDir, "structured-data.json"), JSON.stringify(guideLd(built), null, 2) + "\n");
console.log(`Wrote ${allPages.length} pages and structured-data.json to guides/${guideSlug}/`);

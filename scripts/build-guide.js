#!/usr/bin/env node
// guides/engage-marin/*.html is generated from the playbook's Markdown
// (guides/engage-marin/source/playbook.md) plus the small structured-data
// config next to it (guides/engage-marin/data/guide.json). It does not edit
// itself: change the source or the config, then re-run
//
//   node scripts/build-guide.js
//
// and, before committing: node scripts/stamp-updated-dates.js
//
// The Markdown is the source of the words. The config names what is
// structured: the lifecycle, the content limits (specs), the key terms, the
// page order and groups, and the links. Besides the pages this writes
// guides/engage-marin/structured-data.json (the whole guide as JSON-LD) and puts
// a JSON-LD block in each page. A spec or term whose quoted text is no longer
// in the Markdown stops the build, so the data cannot drift from the words.

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const guideDir = path.join(repoRoot, "guides", "engage-marin");
const config = JSON.parse(fs.readFileSync(path.join(guideDir, "data", "guide.json"), "utf8"));
const markdown = fs.readFileSync(path.resolve(guideDir, "data", config.source), "utf8");

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

// --- Check the config against the words ---

function fail(message) {
  console.error(`build-guide: ${message}`);
  process.exit(1);
}

for (const spec of config.specs) if (!markdown.includes(spec.evidence)) fail(`spec "${spec.id}" is not in the playbook: ${spec.evidence}`);
for (const term of config.terms) if (!markdown.includes(term.description)) fail(`term "${term.name}" is not in the playbook: ${term.description}`);
const lifecycleLine = `**${config.lifecycle.map((s) => s.stage).filter((s, i, all) => all.indexOf(s) === i).join(" → ")}**`;
if (!markdown.includes(lifecycleLine)) fail(`the lifecycle in the config does not match the playbook: ${lifecycleLine}`);

const GENERATED_PAGES = [{ title: "Content limits", slug: "content-limits", generated: "specs", intro: [], sections: [] }];
const allPages = [...source.pages, ...GENERATED_PAGES];
const bySlug = new Map(allPages.map((p) => [p.slug === "quick-start" ? "index" : p.slug, p]));
for (const p of allPages) p.slug = p.slug === "quick-start" ? "index" : p.slug;
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
for (const stage of config.lifecycle) if (!bySlug.has(stage.page)) fail(`lifecycle stage "${stage.stage}" names a missing page: ${stage.page}`);

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

function renderLifecycle(current) {
  return `<ol class="guide-lifecycle" aria-label="Engagement lifecycle">${config.lifecycle
    .map(({ stage, page }) => {
      const here = stage === current ? ' aria-current="step"' : "";
      return `<li><a href="${fileFor(page)}"${here}>${esc(stage)}</a></li>`;
    })
    .join("")}</ol>`;
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

function renderPager(active) {
  const i = outlinePages.indexOf(active);
  const prev = outlinePages[i - 1];
  const next = outlinePages[i + 1];
  if (!prev && !next) return "";
  const prevHtml = prev ? `<a class="guide-pager__prev" href="${fileFor(prev.slug)}"><span class="guide-pager__direction">Previous</span>${esc(prev.title)}</a>` : "";
  const nextHtml = next ? `<a class="guide-pager__next" href="${fileFor(next.slug)}"><span class="guide-pager__direction">Next</span>${esc(next.title)}</a>` : "";
  return `<nav class="guide-pager" aria-label="Guide pages">${prevHtml}${nextHtml}</nav>`;
}

function renderDocActions() {
  return `<div class="doc-actions"><div class="action-group" role="group" aria-label="Page actions"><button type="button" class="action-button" data-action="share" data-icon="share" aria-label="Share: copy the link to this page" title="Copy link"></button></div><span class="doc-action-status" role="status" aria-live="polite"></span></div>`;
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

function renderContents() {
  return groups
    .filter((g) => g.name !== "Overview")
    .map((g) => `<h3>${esc(g.name)}</h3><ul>${g.pages.map((p) => `<li><a href="${fileFor(p.slug)}">${esc(p.title)}</a></li>`).join("")}</ul>`)
    .join("");
}

function renderTerms() {
  return `<dl class="guide-glossary">${config.terms
    .map((t) => `<dt>${esc(t.name)}</dt><dd>${esc(t.description)} <a href="${fileFor(t.page)}">${esc(bySlug.get(t.page).title)}</a></dd>`)
    .join("")}</dl>`;
}

function renderLinksSection(p) {
  const links = (pageConfig(p).links || []).map((key) => config.links[key]);
  if (!links.length) return null;
  return {
    id: "links",
    label: "Links",
    html: `<section class="section" id="links"><h2>Links</h2><ul>${links
      .map((l) => `<li><a href="${l.url}" target="_blank" rel="noreferrer">${esc(l.label)}</a></li>`)
      .join("")}</ul></section>`
  };
}

function buildPage(p) {
  const cfg = pageConfig(p);
  const toc = [];
  const parts = [];
  let description;
  let intro = p.intro.slice();
  if (p.generated === "specs") {
    description = "The length and format limits in this playbook, in one place.";
    parts.push(specsTable(config.specs.map((s) => s.id)));
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
    if (note) parts.push(`<div class="guide-example"><span class="guide-example__label">Training example</span><p>${inline(note.text.replace(/^\*|\*$/g, ""))}</p></div>`);
  }
  if (cfg.specs) parts.push(`<section class="section" id="limits"><h2>Limits</h2>${specsTable(cfg.specs)}</section>`), toc.push({ id: "limits", label: "Limits" });
  parts.push(...intro.map(renderBlock));
  for (const s of p.sections) {
    toc.push({ id: s.id, label: s.title });
    let body;
    if (p.slug === "index" && s.title === "The lifecycle") body = renderLifecycle(null) + s.blocks.filter((b) => !b.text || !b.text.startsWith("**")).map(renderBlock).join("");
    else if (p.slug === "index" && s.title === "Contents") body = renderContents();
    else body = s.blocks.map(renderBlock).join("\n");
    parts.push(`<section class="section" id="${s.id}"><h2>${esc(s.title)}</h2>${body}</section>`);
  }
  if (p.slug === "index") {
    toc.push({ id: "key-terms", label: "Key terms" });
    parts.push(`<section class="section" id="key-terms"><h2>Key terms</h2>${renderTerms()}</section>`);
  }
  const links = renderLinksSection(p);
  if (links) {
    toc.push({ id: links.id, label: links.label });
    parts.push(links.html);
  }
  if (p.slug === "index") {
    toc.push({ id: "data", label: "Data" });
    parts.push(`<section class="section" id="data"><h2>Data</h2><p>The whole guide as structured data: <a href="structured-data.json">structured-data.json</a></p></section>`);
  }
  return { description, toc, body: parts.join("\n"), stage: cfg.stage };
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
  const steps = all.find((b) => b.type === "ol" && p.slug === "how-it-works");
  if (steps)
    node.mainEntity = {
      "@type": "HowTo",
      name: "How an Engage Marin engagement works",
      step: steps.items.map((item, i) => {
        const m = item.match(/^\*\*(.+?)\.\*\*\s*(.*)$/);
        return { "@type": "HowToStep", position: i + 1, name: m ? m[1] : plain(item), text: m ? m[2] : "" };
      })
    };
  const table = all.find((b) => b.type === "table");
  if (table)
    node.mainEntity = {
      "@type": "ItemList",
      name: "Who does what",
      itemListElement: table.rows.map((r, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: `${table.head[0]}: ${r[0]}; ${table.head[1]}: ${r[1]}`
      }))
    };
  const checklist = all.find((b) => b.type === "checklist");
  if (checklist) node.mainEntity = { "@type": "ItemList", name: "Readiness checklist", itemListElement: listItems(checklist.items) };
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
        mainEntity: {
          "@type": "HowTo",
          name: "The Engage Marin lifecycle",
          step: config.lifecycle
            .filter((s, i, all) => all.findIndex((x) => x.stage === s.stage) === i)
            .map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.stage, url: pageUrl(bySlug.get(s.page)) }))
        }
      },
      {
        "@type": "DefinedTermSet",
        "@id": `${config.baseUrl}/#terms`,
        name: `${config.name} key terms`,
        hasDefinedTerm: config.terms.map((t) => ({ "@type": "DefinedTerm", name: t.name, description: t.description, url: pageUrl(bySlug.get(t.page)) }))
      },
      ...allPages.map((p) => pageLd(p, builtPages.get(p)))
    ]
  };
}

// --- Write ---

function pageShell(p, built) {
  const breadcrumb =
    p.slug === "index"
      ? `<a href="../../index.html">Marin Docs</a> <span aria-hidden="true">/</span> <a href="../index.html">Guides</a> <span aria-hidden="true">/</span> ${esc(config.name)}`
      : `<a href="../../index.html">Marin Docs</a> <span aria-hidden="true">/</span> <a href="../index.html">Guides</a> <span aria-hidden="true">/</span> <a href="index.html">${esc(config.name)}</a> <span aria-hidden="true">/</span> ${esc(p.title)}`;
  const toc = built.toc.length
    ? `<aside class="toc" aria-label="On this page"><h2>On this page</h2><ul>${built.toc.map((t) => `<li><a href="#${t.id}">${esc(t.label)}</a></li>`).join("")}</ul></aside>`
    : "";
  const title = p.slug === "index" ? config.name : p.title;
  const ld = JSON.stringify({ "@context": "https://schema.org", ...pageLd(p, built) });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | Marin Docs</title><link rel="icon" type="image/svg+xml" href="${FAVICON}"><meta name="description" content="${esc(built.description.slice(0, 300))}"><link rel="stylesheet" href="../styles.css"></head><body><a class="skip-link" href="#main">Skip to main content</a>${BANNER}<header class="site-header"><div class="header-inner"><span class="docs-brand-icon" aria-hidden="true">${DOC_ICON}</span><nav class="breadcrumb-nav" aria-label="Breadcrumb">${breadcrumb}</nav></div></header><main id="main" class="page" tabindex="-1"><div class="guide-layout">${renderOutline(p)}<article class="content"><h1 class="doc-title">${esc(title)}</h1><p class="doc-description">${esc(built.description)}</p><p class="doc-updated">Updated recently</p>${renderDocActions()}${p.slug === "index" ? "" : renderLifecycle(built.stage || null)}
${built.body}
${renderPager(p)}</article>${toc}</div></main>${FOOTER}<script type="application/ld+json">${ld.replace(/</g, "\\u003c")}</script><script src="../../vendor/marinos/marinos.js" defer></script></body></html>`;
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
console.log(`Wrote ${allPages.length} pages and structured-data.json to guides/engage-marin/`);

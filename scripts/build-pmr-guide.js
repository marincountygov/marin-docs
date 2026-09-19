#!/usr/bin/env node
// guide/personnel-management-regulations/*.html is generated from the
// JSON in guide/personnel-management-regulations/data/ — it does not
// edit itself. That data is a copy of policy-knowledge-model's generated
// (not hand-authored) PMR 23/24 output; re-copy it from that sibling
// repo's examples/ after re-running its extractor, then re-run this
// script. Matches this repo's no-build-step, run-on-demand pattern (see
// scripts/build-brand-center.js).
//
//   node scripts/build-pmr-guide.js
//
// Then, before committing: node scripts/stamp-updated-dates.js

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const guideDir = path.join(repoRoot, "guide", "personnel-management-regulations");
const dataDir = path.join(guideDir, "data");

const OFFICIAL_SOURCE_URL =
  "https://www.hr.marincounty.gov/regulations-policies-procedures/personnel-management-regulations/all-personnel-management-regulations";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// marin-digital-standards/content-design/interface-writing.md: every
// heading in this app - not just page titles - uses AP-style sentence
// case (capitalize only the first word, proper nouns, and
// acronyms/official names). This is a mechanical best-effort transform
// for headings *we* construct (e.g. a subsection label lifted from the
// source); it is never applied to a policy's own official title
// (policy.sourceHeading) or the source statement text itself, both of
// which are quoted verbatim on purpose. It will over-lowercase a true
// proper noun it can't recognize (e.g. "Personnel Commission") - a known,
// accepted limitation of a mechanical rule rather than a full grammar-
// aware title-caser.
function sentenceCase(text) {
  let firstWordSeen = false;
  return text.replace(/[A-Za-z][A-Za-z'’-]*/g, (word) => {
    const isAcronym = word.length > 1 && word === word.toUpperCase();
    if (isAcronym) return word;
    if (!firstWordSeen) {
      firstWordSeen = true;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    return word.toLowerCase();
  });
}

function loadPmr(slug) {
  const dir = path.join(dataDir, slug);
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  return {
    policy: read("policy.json"),
    statements: read("policy-statements.json"),
    rules: read("rules.json"),
    procedures: read("procedures.json"),
    references: read("references.json"),
    history: read("history.json")
  };
}

const pmr23 = loadPmr("pmr23");
const pmr24 = loadPmr("pmr24");

// --- shared chrome (byte-identical to guide/public-engagement-plan/*.html) ---

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' rx='10' fill='%23000'/%3E%3Cg fill='none' stroke='%23e5b53b' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='9' y='9' width='12' height='12' rx='2'/%3E%3Crect x='27' y='9' width='12' height='12' rx='2'/%3E%3Crect x='9' y='27' width='12' height='12' rx='2'/%3E%3Crect x='27' y='27' width='12' height='12' rx='2'/%3E%3C/g%3E%3C/svg%3E";

const BANNER = `<div class="marinos-banner"><div class="marinos-banner__inner"><div class="menu marinos-menu"><button type="button" class="menu-toggle marinos-menu__toggle" aria-expanded="false" aria-controls="marinos-menu-panel"><span class="marinos-banner__icon" aria-hidden="true"><svg viewBox="0 0 48 48"><rect x="7" y="7" width="13" height="13" rx="2"/><rect x="28" y="7" width="13" height="13" rx="2"/><rect x="7" y="28" width="13" height="13" rx="2"/><rect x="28" y="28" width="13" height="13" rx="2"/></svg></span>MarinOS<sup>ALPHA</sup><svg class="menu-toggle__caret" aria-hidden="true" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg></button><div id="marinos-menu-panel" class="menu-panel marinos-menu__panel" hidden><a href="https://marincountygov.github.io/marin-magic/"><span class="marinos-menu__icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="m24 5 2.8 9.2L36 17l-9.2 2.8L24 29l-2.8-9.2L12 17l9.2-2.8zM37 28l1.6 5.4L44 35l-5.4 1.6L37 42l-1.6-5.4L30 35l5.4-1.6zM11 28l1.2 3.8L16 33l-3.8 1.2L11 38l-1.2-3.8L6 33l3.8-1.2z"/></svg></span>MarinMagic</a><a href="https://marincountygov.github.io/marin-decision-maker/"><span class="marinos-menu__icon" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="11" cy="12" r="4"/><circle cx="37" cy="12" r="4"/><circle cx="24" cy="37" r="4"/><path d="M15 12h18M35 16 26 33M13 16l9 17"/></svg></span>Marin Decision Maker</a><a href="https://marincountygov.github.io/marin-docs/"><span class="marinos-menu__icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M13 6h17l8 8v28H13z"/><path d="M30 6v9h8M19 24h13M19 31h13"/></svg></span>MarinDocs</a><a class="marinos-menu__all" href="https://marincountygov.github.io/marin-os/">Browse all in MarinOS</a></div></div></div></div>`;

const DOC_ICON = `<svg viewBox="0 0 48 48"><path d="M24 12c-4-2-10-3-15-2v24c5-1 11 0 15 2 4-2 10-3 15-2V10c-5-1-11 0-15 2z"/><path d="M24 12v24"/></svg>`;

const FOOTER = `<footer class="site-footer" role="contentinfo"><div class="footer-inner"><a href="https://marincountygov.github.io/marin-os/">MarinOS</a></div></footer><a class="app-feedback" href="https://form.asana.com/?k=qVUT83d5DBmlDiIyi-WAyQ&amp;d=23133298259496" target="_blank" rel="noreferrer">Feedback</a>`;

// Labels here are each policy's own official heading (policy.sourceHeading,
// verbatim from the source - e.g. "Personnel Regulation 24: Grievance
// Procedure") rather than a reconstructed "PMR N: Title" string, so a
// reader sees the same official name everywhere: the page's own <h1>,
// this outline, the breadcrumb, and the pager all agree.
const OUTLINE_PAGES = [
  { slug: "index", label: "Personnel Management Regulations", group: "Overview" },
  { slug: "electronic-media", label: pmr23.policy.sourceHeading, group: "The regulations" },
  { slug: "grievance-procedure", label: pmr24.policy.sourceHeading, group: "The regulations" },
  { slug: "about-this-guide", label: "About this guide", group: "About" }
];

function renderOutline(activeSlug) {
  const groups = [];
  for (const page of OUTLINE_PAGES) {
    let group = groups.find((g) => g.name === page.group);
    if (!group) {
      group = { name: page.group, pages: [] };
      groups.push(group);
    }
    group.pages.push(page);
  }
  return `<aside class="guide-outline" aria-label="Guide outline">${groups
    .map(
      (g) =>
        `<div><h2>${esc(g.name)}</h2><ul>${g.pages
          .map((p) => {
            const href = `${p.slug}.html`;
            const current = p.slug === activeSlug ? ' aria-current="page"' : "";
            return `<li><a href="${href}"${current}>${esc(p.label)}</a></li>`;
          })
          .join("")}</ul></div>`
    )
    .join("")}</aside>`;
}

function renderPager(activeSlug) {
  const i = OUTLINE_PAGES.findIndex((p) => p.slug === activeSlug);
  const prev = OUTLINE_PAGES[i - 1];
  const next = OUTLINE_PAGES[i + 1];
  if (!prev && !next) return "";
  const prevHtml = prev
    ? `<a class="guide-pager__prev" href="${prev.slug}.html"><span class="guide-pager__direction">Previous</span>${esc(prev.label)}</a>`
    : "";
  const nextHtml = next
    ? `<a class="guide-pager__next" href="${next.slug}.html"><span class="guide-pager__direction">Next</span>${esc(next.label)}</a>`
    : "";
  return `<nav class="guide-pager" aria-label="Guide pages">${prevHtml}${nextHtml}</nav>`;
}

// viewToggle is the sop/-style .view-toggle tablist markup (see
// VIEW_TOGGLE_HTML below) - only PMR content pages pass one in; index and
// about-this-guide pages have a single view and omit it.
function renderDocActions(viewToggle = "") {
  return `<div class="doc-actions">${viewToggle}<div class="menu"><button type="button" class="doc-action menu-toggle" aria-expanded="false" aria-controls="share-menu-panel">Share<svg class="menu-toggle__caret" aria-hidden="true" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg></button><div id="share-menu-panel" class="menu-panel" hidden><button type="button" data-action="share">Copy link</button></div></div><span class="doc-action-status" role="status" aria-live="polite"></span></div>`;
}

// A plain in-content link, not a doc-action button - the official source
// is reference material, not a page action, so it belongs in its own
// section at the end of the page rather than the top action bar.
function renderSourceSection() {
  return `<section class="section" id="source"><h2>Source</h2><p>Official source: <a href="${OFFICIAL_SOURCE_URL}" target="_blank" rel="noreferrer">County of Marin Personnel Management Regulations</a></p></section>`;
}

// The sop/ collection's .view-toggle tablist (see sop/flow-view.js and
// sop/styles.css) has generic, reusable tab-switching mechanics - click
// handling, arrow-key navigation, aria-selected/tabindex wiring, and a
// URL query-param sync - that have nothing to do with its BPMN/flow-chart
// rendering. view-toggle.js below reuses only that generic part.
const VIEW_TOGGLE_HTML = `<div class="view-toggle" role="tablist" aria-label="Document view"><button type="button" role="tab" id="view-tab-interactive" data-view="interactive" aria-selected="true" aria-controls="interactive-view" tabindex="0">Interactive</button><button type="button" role="tab" id="view-tab-original" data-view="original" aria-selected="false" aria-controls="original-view" tabindex="-1">Original text</button></div>`;

function pageShell({ slug, title, description, docTitle, docDescription, breadcrumbLabel, content, tocItems, extraScripts = [], viewToggle = "" }) {
  const outline = renderOutline(slug);
  const pager = renderPager(slug);
  const toc = tocItems.length
    ? `<aside class="toc" aria-label="On this page"><h2>On this page</h2><ul>${tocItems
        .map((t) => `<li><a href="#${t.id}">${esc(t.label)}</a></li>`)
        .join("")}</ul></aside>`
    : "";
  const breadcrumb =
    slug === "index"
      ? `<a href="../../index.html">MarinDocs</a> <span aria-hidden="true">/</span> <a href="../index.html">Guides</a> <span aria-hidden="true">/</span> Personnel Management Regulations`
      : `<a href="../../index.html">MarinDocs</a> <span aria-hidden="true">/</span> <a href="../index.html">Guides</a> <span aria-hidden="true">/</span> <a href="index.html">Personnel Management Regulations</a> <span aria-hidden="true">/</span> ${esc(breadcrumbLabel)}`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | MarinDocs</title><link rel="icon" type="image/svg+xml" href="${FAVICON}"><meta name="description" content="${esc(description)}"><link rel="stylesheet" href="../styles.css"></head><body><a class="skip-link" href="#main">Skip to main content</a>${BANNER}<header class="site-header"><div class="header-inner"><span class="docs-brand-icon" aria-hidden="true">${DOC_ICON}</span><nav class="breadcrumb-nav" aria-label="Breadcrumb">${breadcrumb}</nav></div></header><main id="main" class="page" tabindex="-1"><div class="guide-layout">${outline}<article class="content"><h1 class="doc-title">${esc(docTitle)}</h1><p class="doc-description">${esc(docDescription)}</p><p class="doc-updated">Updated recently</p>${renderDocActions(viewToggle)}
${content}
${pager}</article>${toc}</div></main>${FOOTER}<script src="../../shared/app-shell.js"></script>${extraScripts
    .map((s) => `<script src="${s}"></script>`)
    .join("")}</body></html>`;
}

// --- content builders ---

const RULE_TYPE_LABEL = { Requirement: "Required", Prohibition: "Required" };

// Grouped by the rule's originating subsection (rule.source.heading), in
// the order that subsection first appears - not by rule.category. Rules
// keep their source's own lettered prefix ("A.", "F.", ...), which only
// makes sense as a locally-numbered sequence within one subsection; an
// earlier version grouped by category instead, which interleaved
// subsections and made the lettering look scrambled even though every
// individual statement was untouched.
//
// Two client-side filters sit above the list (status: All/Required/
// Permitted, and topic: the distinct rule.category values present) so a
// reader can narrow a long rule list without navigating away - see
// rules-filter-template.js. This deliberately isn't the sop/ collection's
// .topic-filters pattern (plain links between separate pre-rendered
// pages): that pattern fits browsing a list of documents, not thinning
// out content within a single long page. It reuses the same "toggle
// visibility via the hidden attribute" mechanism shared/app-shell.js
// already uses for tab sections, just applied to filtering instead.
function renderRulesSection(rules) {
  if (rules.length === 0) return { html: "", hasFilters: false };
  const bySubsection = new Map();
  const categoriesSeen = [];
  for (const rule of rules) {
    const key = rule.source.heading || "General";
    if (!bySubsection.has(key)) bySubsection.set(key, []);
    bySubsection.get(key).push(rule);
    const category = rule.category || "General";
    if (!categoriesSeen.includes(category)) categoriesSeen.push(category);
  }

  function ruleItem(r) {
    const category = r.category || "General";
    return `<li data-status="${RULE_TYPE_LABEL[r.type] ? "required" : "permitted"}" data-category="${esc(category)}">${esc(r.statement)}</li>`;
  }

  const sections = [...bySubsection.entries()]
    .map(([heading, subsectionRules]) => {
      const required = subsectionRules.filter((r) => RULE_TYPE_LABEL[r.type]);
      const permitted = subsectionRules.filter((r) => !RULE_TYPE_LABEL[r.type]);
      const requiredHtml = required.length
        ? `<div class="guide-callout guide-callout--required"><span class="guide-callout__label">Required</span><ul>${required
            .map(ruleItem)
            .join("")}</ul></div>`
        : "";
      const permittedHtml = permitted.length
        ? `<div class="rules-permitted"><p><strong>Permitted:</strong></p><ul>${permitted.map(ruleItem).join("")}</ul></div>`
        : "";
      return `<div class="rules-subsection"><h3>${esc(sentenceCase(heading))}</h3>${requiredHtml}${permittedHtml}</div>`;
    })
    .join("\n");

  const filterGroup = (label, buttons) =>
    `<div class="rules-filter-group" role="group" aria-label="${esc(label)}">${buttons.join("")}</div>`;
  const filterButton = (attr, value, text, pressed) =>
    `<button type="button" class="rules-filter" data-${attr}="${esc(value)}" aria-pressed="${pressed}">${esc(text)}</button>`;

  const statusFilters = filterGroup("Filter by status", [
    filterButton("status-filter", "all", "All", true),
    filterButton("status-filter", "required", "Required", false),
    filterButton("status-filter", "permitted", "Permitted", false)
  ]);
  const categoryFilters = filterGroup("Filter by topic", [
    filterButton("category-filter", "all", "All topics", true),
    ...categoriesSeen.map((c) => filterButton("category-filter", c, sentenceCase(c), false))
  ]);
  const filters =
    categoriesSeen.length > 1
      ? `<div class="app-toolbar rules-filter-toolbar">${statusFilters}${categoryFilters}</div>`
      : `<div class="app-toolbar rules-filter-toolbar">${statusFilters}</div>`;

  return {
    html: `<section class="section" id="rules"><h2>Rules</h2>${filters}${sections}</section>`,
    hasFilters: true
  };
}

const STEP_LABEL_PREFIX = /^Step\s+\d+:?\s*\n?/i;

function renderStepDescription(description) {
  // s.description carries the step's own "Step N:" label verbatim from
  // the source (see policy-knowledge-model's extract-procedures.js) -
  // strip it for display, since the <ol> marker already numbers the
  // step. Leaving it in produced two problems at once: redundant "1.
  // Step 1:" text, and inconsistent styling between steps, since a step
  // where the label shares its line with the rest of the text (Step 2)
  // looked different from one where it's on its own line (Steps 1 and
  // 3). The canonical JSON keeps the full verbatim text; this is a
  // display-only trim in the generated guide.
  const withoutLabel = description.replace(STEP_LABEL_PREFIX, "");
  // A description can still carry genuine line breaks after that (e.g.
  // PMR 24 Step 3's "Alternative A." / "Alternative B." clauses,
  // separated by <br><br> in the source). Only wrap in multiple <p> tags
  // when there's more than one paragraph to show - a single-paragraph
  // step stays plain text so it matches the Rules list's styling instead
  // of picking up extra paragraph spacing for no reason.
  const paragraphs = withoutLabel.split("\n").filter(Boolean);
  if (paragraphs.length <= 1) return esc(paragraphs[0] || "");
  return paragraphs.map((p) => `<p>${esc(p)}</p>`).join("");
}

function renderProceduresSection(procedures) {
  if (procedures.length === 0) return "";
  const items = procedures
    .map(
      (proc) =>
        `<h3>${esc(sentenceCase(proc.title))}</h3><ol>${proc.steps
          .map((s) => `<li>${renderStepDescription(s.description)}</li>`)
          .join("")}</ol>`
    )
    .join("\n");
  return `<section class="section" id="procedures"><h2>Procedures</h2>${items}</section>`;
}

function renderReferencesSection(references) {
  if (references.length === 0) return "";
  return `<section class="section" id="references"><h2>References</h2><ul>${references
    .map((r) => `<li>${esc(r.citation || r.title)}</li>`)
    .join("")}</ul></section>`;
}

function renderHistorySection(history) {
  if (history.length === 0) return "";
  // A flat list, not one <li><ul>...</ul></li> per entry - nested lists
  // add structure the content doesn't need. With one history entry (the
  // normal case here) that nesting bought nothing; if this repo ever
  // needs multiple entries, revisit then rather than pre-building for it.
  const items = history.flatMap((h) =>
    [
      h.date && `Date: ${h.date}`,
      h.version && `Revision: ${h.version}`,
      h.changedBy && `Prepared by: ${h.changedBy}`,
      h.approvedBy && `Approved by: ${h.approvedBy}`
    ].filter(Boolean)
  );
  return `<section class="section" id="history"><h2>Revision history</h2><ul>${items
    .map((f) => `<li>${esc(f)}</li>`)
    .join("")}</ul></section>`;
}

// The Interactive view above reorganizes and relabels source content for
// readability (grouped into Required/Permitted, sentence-cased headings,
// "Step N:" labels stripped, etc.) - useful, but it means no single page
// shows the source document untouched. This builds that page: every
// extracted policyStatement plus the closing Approval history entry,
// rendered in the source's own order, under its own verbatim (not
// sentence-cased) heading, with paragraphs and lists reconstructed from
// each statement's own htmlElement. Nothing here classifies, relabels,
// or drops anything - it's the same non-destructive extraction the Rules/
// Procedures/References sections are built from, just not reorganized.
function renderOriginalText(data) {
  const entries = [
    ...data.statements.map((s) => ({ text: s.statement, ...s.source })),
    ...data.history.map((h) => ({ text: h.description, ...h.source }))
  ];

  const groups = [];
  let current = null;
  for (const entry of entries) {
    if (!current || current.heading !== entry.heading) {
      current = { heading: entry.heading, items: [] };
      groups.push(current);
    }
    current.items.push(entry);
  }

  // A statement can carry an embedded line break (e.g. PMR 24 Step 3's
  // "Alternative A." / "Alternative B." clauses, from a <br><br> in the
  // source) - reproduce it as a real <br>, matching the source markup,
  // rather than collapsing or paragraph-wrapping it.
  const withBreaks = (text) => text.split("\n").map(esc).join("<br>");

  const sections = groups
    .map((group) => {
      const blocks = [];
      let list = null;
      const flushList = () => {
        if (list) {
          blocks.push(`<ul>${list.join("")}</ul>`);
          list = null;
        }
      };
      for (const item of group.items) {
        if (item.htmlElement === "li") {
          if (!list) list = [];
          list.push(`<li>${withBreaks(item.text)}</li>`);
        } else {
          flushList();
          blocks.push(`<p>${withBreaks(item.text)}</p>`);
        }
      }
      flushList();
      return `<div class="original-subsection"><h2>${esc(group.heading)}</h2>${blocks.join("")}</div>`;
    })
    .join("\n");

  return `<div id="original-view" role="tabpanel" aria-labelledby="view-tab-original" tabindex="0" hidden>${sections}</div>`;
}

function pmrPage(slug, data) {
  const officialTitle = data.policy.sourceHeading;
  const purposeHtml = data.policy.purpose
    ? `<section class="section" id="purpose"><h2>Purpose</h2><p>${esc(data.policy.purpose.statement)}</p></section>`
    : "";
  const scopeHtml = data.policy.scope
    ? `<section class="section" id="scope"><h2>Scope</h2><p>${esc(data.policy.scope.statement)}</p></section>`
    : "";
  const rulesSection = renderRulesSection(data.rules);
  const proceduresHtml = renderProceduresSection(data.procedures);
  const referencesHtml = renderReferencesSection(data.references);
  const historyHtml = renderHistorySection(data.history);

  const tocItems = [
    data.policy.purpose && { id: "purpose", label: "Purpose" },
    data.policy.scope && { id: "scope", label: "Scope" },
    data.rules.length && { id: "rules", label: "Rules" },
    data.procedures.length && { id: "procedures", label: "Procedures" },
    data.references.length && { id: "references", label: "References" },
    data.history.length && { id: "history", label: "Revision history" },
    { id: "source", label: "Source" }
  ].filter(Boolean);

  const interactiveHtml = `<div id="interactive-view" role="tabpanel" aria-labelledby="view-tab-interactive" tabindex="0">${[
    purposeHtml,
    scopeHtml,
    rulesSection.html,
    proceduresHtml,
    referencesHtml,
    historyHtml
  ]
    .filter(Boolean)
    .join("\n")}</div>`;
  const originalHtml = renderOriginalText(data);

  const extraScripts = ["view-toggle.js"];
  if (rulesSection.hasFilters) extraScripts.push("rules-filter.js");

  return pageShell({
    slug,
    title: officialTitle,
    description: (data.policy.purpose && data.policy.purpose.statement) || data.policy.title,
    docTitle: officialTitle,
    docDescription: (data.policy.purpose && data.policy.purpose.statement) || "",
    breadcrumbLabel: officialTitle,
    // The Source section sits outside both tabpanels - it's a page-level
    // fact ("here's where this came from"), not part of either view.
    content: `${interactiveHtml}\n${originalHtml}\n${renderSourceSection()}`,
    tocItems,
    viewToggle: VIEW_TOGGLE_HTML,
    extraScripts
  });
}

const indexContent = `<section class="section" id="overview"><h2>What this guide covers</h2><p>Two Personnel Management Regulations (PMRs) from the County of Marin's Personnel Management Regulations Manual, generated from the official source document and organized for day-to-day reference.</p><ul>
<li><a href="electronic-media.html">${esc(pmr23.policy.sourceHeading)}</a>: business and personal use, monitoring, records retention, and prohibited uses of County electronic media.</li>
<li><a href="grievance-procedure.html">${esc(pmr24.policy.sourceHeading)}</a>: informal and formal grievance steps, from initial filing through Personnel Commission or arbitration.</li>
</ul></section>
${renderSourceSection()}`;

const indexPage = pageShell({
  slug: "index",
  title: "Personnel Management Regulations",
  description: "Electronic Media (PMR 23) and Grievance Procedure (PMR 24), from the County of Marin's Personnel Management Regulations.",
  docTitle: "Personnel Management Regulations",
  docDescription: "Electronic Media (PMR 23) and Grievance Procedure (PMR 24), from the County of Marin's Personnel Management Regulations.",
  breadcrumbLabel: "Personnel Management Regulations",
  content: indexContent,
  tocItems: [
    { id: "overview", label: "What this guide covers" },
    { id: "source", label: "Source" }
  ]
});

const aboutContent = `<section class="section" id="methodology"><h2>How this guide was built</h2><p>This guide is generated, not hand-written. It's produced by a deterministic HTML-extraction pipeline in the <code>policy-knowledge-model</code> repository, which parses the County's official Personnel Management Regulations page into schema-validated JSON (rules, procedures, references, revision history), which this guide's <code>scripts/build-pmr-guide.js</code> then renders into these pages.</p><p>Rule classification (Required vs. Permitted) is produced by a keyword heuristic, not a legal review — always confirm against the official source below before relying on a specific rule.</p></section>
<section class="section" id="source"><h2>Source</h2><p>The official, authoritative record is the County of Marin's own Personnel Management Regulations page. This guide is a reading aid, not a replacement for it.</p><p>Official source: <a href="${OFFICIAL_SOURCE_URL}" target="_blank" rel="noreferrer">County of Marin Personnel Management Regulations</a></p></section>`;

const aboutPage = pageShell({
  slug: "about-this-guide",
  title: "About this guide",
  description: "How the Personnel Management Regulations guide was generated, and where to find the official source.",
  docTitle: "About this guide",
  docDescription: "How this guide was generated, and where to find the official source.",
  breadcrumbLabel: "About this guide",
  content: aboutContent,
  tocItems: [
    { id: "methodology", label: "How this guide was built" },
    { id: "source", label: "Source" }
  ]
});

fs.writeFileSync(path.join(guideDir, "index.html"), indexPage);
fs.writeFileSync(path.join(guideDir, "electronic-media.html"), pmrPage("electronic-media", pmr23));
fs.writeFileSync(path.join(guideDir, "grievance-procedure.html"), pmrPage("grievance-procedure", pmr24));
fs.writeFileSync(path.join(guideDir, "about-this-guide.html"), aboutPage);

console.log(`Wrote 4 pages to ${path.relative(repoRoot, guideDir)}/`);

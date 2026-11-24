#!/usr/bin/env node
// Builds pmrs/index.html and one page per Personnel Management Regulation from pmrs/data/*.jsonld.
// That data is copied from marin-data (output/regulations/) by its consumers.json; never edit it here.
//   node scripts/build-pmrs.js
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const { renderDocNav } = require("./doc-nav.js");
const { renderDocPager } = require("./doc-pager.js");
const { renderDocDetails } = require("./doc-details.js");
const { shellBody, bodyAttrs, homeScript } = require("./shell-chrome.js");
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "pmrs/data", f), "utf8"))["@graph"];
const manual = read("manual.jsonld");
const regs = read("regulations.jsonld");
const byId = new Map([...manual, ...regs].map((n) => [n["@id"], n]));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const refs = (n) => [].concat(n.hasPart || []).map((r) => byId.get(r["@id"])).filter(Boolean);
// A property of the data by its full name (the dates the source gives are "as written"; the date of the last check is ours: see plans/PMR-LAST-CHECKED.md).
const property = (n, id) => ((n.identifier || []).find((i) => i.propertyID === id) || {}).value;
const local = (n, key) => ((n.identifier || []).find((i) => i.propertyID === `local:pmr-${key}-as-written`) || {}).value;
const number = (n) => n.legislationIdentifier.replace(/^PMR\s*/, "");
const slug = (n) => `pmr-${number(n)}`;

const top = manual.find((n) => n.codificationLevel === "code");
const source = manual.find((n) => n["@type"] === "LegislationObject");
const groups = refs(top).sort((a, b) => a.position - b.position);

// The page chrome is the one of the guides list: its head (the icon and the shared styles) and the MarinOS shell (scripts/shell-chrome.js).
const base = fs.readFileSync(path.join(ROOT, "guides/index.html"), "utf8");
const head = (title, description) => base.slice(0, base.indexOf("<title>")) + `<title>${esc(title)} | Marin Docs</title>` +
  base.slice(base.indexOf("</title>") + 8, base.indexOf("<meta name=\"description\"")).replace(/<link rel="stylesheet"[^>]*>/, "") +
  `<meta name="description" content="${esc(description)}"><link rel="stylesheet" href="../guides/styles.css"></head><body${bodyAttrs(1)}>`;
const page = (title, description, body) =>
  head(title, description) + shellBody(1, body) + `<script src="../vendor/marinos/marinos.js" defer></script>${homeScript(1)}</body></html>`;
const anchor = (id) => `<a class="heading-anchor" href="#${id}" aria-label="Link to this section">#</a>`;
const heading = (id, text) => `<h2 id="${id}">${text}${anchor(id)}</h2>`;
// The data keeps a list as lines that begin "1. " (a numbered list) or "- " (a bulleted one), as the source page's lists are. Show them as lists.
const paragraphs = (text) => {
  const out = [];
  let open = null;
  const close = () => { if (open) { out.push(`</${open}>`); open = null; } };
  for (const line of text.split(/\n+/)) {
    const numbered = line.match(/^(\d+)\. (.*)$/);
    const bullet = line.match(/^- (.*)$/);
    const kind = numbered ? "ol" : bullet ? "ul" : null;
    if (kind !== open) { close(); if (kind) { out.push(`<${kind}>`); open = kind; } }
    out.push(kind ? `<li${numbered ? ` value="${numbered[1]}"` : ""}>${esc(numbered ? numbered[2] : bullet[1])}</li>` : `<p>${esc(line)}</p>`);
  }
  close();
  return out.join("");
};

// Copy link, Copy and Download, icon-only and in that order, above the title: the same buttons as a guide page.
// The shell reads the article (data-formats-for) and does Text, HTML and Markdown; guides/guide-actions.js adds the two JSON downloads.
const CARET = '<svg class="menu-toggle__caret" aria-hidden="true" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg>';
const menuItems = (attribute, items) => items.map(([value, label]) => `<button type="button" data-button-kind="menu-item" ${attribute}="${value}">${label}</button>`).join("");
// The citation is built when someone copies it (guide-actions.js), from these: the name of the manual, what a section is called (PMR 24.3), and the
// effective date when the data has one. Nothing else is added to it but the address and the day it was copied.
const docActions = (fileName, effective) => `<div class="doc-actions" data-formats-for="article" data-file-name="${esc(fileName)}" data-guide-name="pmr" data-guide-json="data/regulations.jsonld" data-citation-base="County of Marin, Personnel Management Regulations" data-citation-prefix="PMR"${effective ? ` data-citation-effective="${esc(effective)}"` : ""}><div class="action-group" role="group" aria-label="Page actions"><button type="button" class="action-button" data-action="share" data-icon="link" aria-label="Copy link" title="Copy link"></button></div>` +
  `<div class="menu"><button type="button" class="action-button menu-toggle" data-icon="copy" aria-expanded="false" aria-controls="copy-panel" aria-label="Copy, choose a format" title="Copy">${CARET}</button><div id="copy-panel" class="menu-panel" hidden>${menuItems("data-copy-format", [["text", "Text"], ["html", "HTML"], ["markdown", "Markdown"], ["citation", "Citation"]])}</div></div>` +
  `<div class="menu"><button type="button" class="action-button menu-toggle" data-icon="download" aria-expanded="false" aria-controls="download-panel" aria-label="Download, choose a format" title="Download">${CARET}</button><div id="download-panel" class="menu-panel" hidden>${menuItems("data-download-format", [["text", "Text"], ["html", "HTML"], ["markdown", "Markdown"], ["json", "JSON (this regulation)"], ["guide-json", "JSON (all regulations)"], ["print", "Print or save as PDF"]])}</div></div>` +
  `<span class="doc-action-status" role="status" aria-live="polite"></span></div>`;
const context = JSON.parse(fs.readFileSync(path.join(ROOT, "pmrs/data/regulations.jsonld"), "utf8"))["@context"];

// The regulations in the order of the manual (Section 1 to 4), for the previous and next links.
const inOrder = groups.flatMap((g) => refs(g).sort((a, b) => a.position - b.position));
const stepLink = (p) => (p ? { label: `PMR ${number(p)}: ${p.name || ""}`, href: `${slug(p)}.html` } : null);

let count = 0;
for (const group of groups) {
  for (const pmr of refs(group)) {
    const provisions = refs(pmr);
    const sections = provisions.sort((a, b) => a.position - b.position).map((p) => ({ id: p.legislationIdentifier.replace(/\./g, "-"), label: `${p.legislationIdentifier} ${p.name || ""}`.trim(), text: p.text }));
    const outline = sections.map((x) => [x.id, x.label]).concat([["source", "Source"]]);
    const toc = `<aside class="toc" aria-label="On this page"><h2>On this page</h2><ul>${outline.map((o) => `<li><a href="#${o[0]}">${esc(o[1])}</a></li>`).join("")}</ul></aside>`;
    // The details are the data's own words ("as written": the dates and names are shown as the regulation gives them), and the two dates the data
    // holds for a few regulations, with the names Schema.org gives them. A row with no value is not drawn.
    const details = renderDocDetails({
      label: "About this regulation",
      rows: [["Effective", local(pmr, "effective-date")], ["Applies from", pmr.legislationDateOfApplicability], ["Version dated", pmr.legislationDateVersion],
        ["Prepared by", local(pmr, "prepared-by")], ["Approved by", local(pmr, "approved-by")],
        // When the text here was last compared with the published regulation: a date on the regulation, or one on the source for the whole manual.
        // The data does not carry it yet, so no page shows this row; the row appears on its own once the data has the date.
        ["Last checked", property(pmr, "local:pmr-last-checked") || property(source, "local:pmr-last-checked")]],
    });
    const nav = renderDocNav({
      label: "Personnel Management Regulations",
      set: { name: "Personnel Management Regulations", href: "./" },
      collapse: true,
      search: { src: "search.json", script: "../doc-search.js" },
      groups: groups.map((g) => ({ name: `${g.legislationIdentifier}: ${g.name}`, items: refs(g).sort((a, b) => a.position - b.position).map((p) => ({ label: `PMR ${number(p)}: ${p.name || ""}`, href: `${slug(p)}.html`, current: p === pmr })) })),
    });
    const body = `<div class="pmr-layout">${nav}<article>${docActions(slug(pmr), local(pmr, "effective-date"))}<section class="hero pmr-hero"><h1>PMR ${esc(number(pmr))}: ${esc(pmr.name || "")}</h1>` + (pmr.description ? `<p class="lede">${esc(pmr.description)}</p>` : "") + `</section>` +
      details +
      sections.map((x) => `<section>${heading(x.id, esc(x.label))}${x.text ? paragraphs(x.text) : ""}</section>`).join("") +
      `<section>${heading("source", "Source")}<p><a href="${esc(source.url)}">${esc(source.name)}</a></p></section>${renderDocPager({ label: "Regulations", prev: stepLink(inOrder[inOrder.indexOf(pmr) - 1]), next: stepLink(inOrder[inOrder.indexOf(pmr) + 1]) })}</article>${toc}</div>` +
      `<script type="application/ld+json">${JSON.stringify({ "@context": context, "@graph": [pmr, ...provisions] }).replace(/</g, "\\u003c")}</script><script src="../guides/guide-actions.js" defer></script>`;
    fs.writeFileSync(path.join(ROOT, "pmrs", `${slug(pmr)}.html`), page(`PMR ${number(pmr)}: ${pmr.name || ""}`, pmr.description || `Personnel Management Regulation ${number(pmr)}.`, body));
    count += 1;
  }
}

// The list page: one card for each Section of the manual, listing its regulations as links, and a search box that looks through the whole manual.
const cards = groups.map((g) => `<article class="app-card set-card"><h2 id="section-${g.position}">${esc(g.legislationIdentifier)}: ${esc(g.name)}</h2><ul>${refs(g).sort((a, b) => a.position - b.position).map((p) => `<li><a href="./${slug(p)}.html">PMR ${esc(number(p))}: ${esc(p.name || "")}</a></li>`).join("")}</ul></article>`).join("");
const searchBox = `<search class="doc-nav__search set-search" data-doc-search data-search-src="search.json" data-hide="#set-cards" aria-label="Search Personnel Management Regulations" hidden><div class="search-input-field"><label for="doc-nav-search">Search</label><input type="search" id="doc-nav-search" autocomplete="off"></div><p class="doc-nav__status app-help-text" role="status" aria-live="polite"></p><div class="doc-nav__results"></div></search><script src="../doc-search.js" defer></script>`;
fs.writeFileSync(path.join(ROOT, "pmrs/index.html"), page("Personnel Management Regulations", "The County of Marin's rules for personnel matters.",
  `<section class="hero pmr-hero"><h1>Personnel Management Regulations</h1><p class="lede">The County of Marin's rules for personnel matters.</p></section>${searchBox}<div class="docs-grid docs-grid--2" id="set-cards">${cards}</div><section>${heading("source", "Source")}<p><a href="${esc(source.url)}">${esc(source.name)}</a></p></section>`));
console.log(`wrote pmrs/index.html and ${count} regulation pages`);

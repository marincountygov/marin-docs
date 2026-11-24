#!/usr/bin/env node
// Builds pmrs/index.html and one page per Personnel Management Regulation from pmrs/data/*.jsonld.
// That data is copied from marin-data (output/regulations/) by its consumers.json; never edit it here.
//   node scripts/build-pmrs.js
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "pmrs/data", f), "utf8"))["@graph"];
const manual = read("manual.jsonld");
const regs = read("regulations.jsonld");
const byId = new Map([...manual, ...regs].map((n) => [n["@id"], n]));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const refs = (n) => [].concat(n.hasPart || []).map((r) => byId.get(r["@id"])).filter(Boolean);
const local = (n, key) => ((n.identifier || []).find((i) => i.propertyID === `local:pmr-${key}-as-written`) || {}).value;
const number = (n) => n.legislationIdentifier.replace(/^PMR\s*/, "");
const slug = (n) => `pmr-${number(n)}`;

const top = manual.find((n) => n.codificationLevel === "code");
const source = manual.find((n) => n["@type"] === "LegislationObject");
const groups = refs(top).sort((a, b) => a.position - b.position);

// The page chrome (header, footer, scripts) is the one of the guides list, so the section looks like the rest of Marin Docs.
const base = fs.readFileSync(path.join(ROOT, "guides/index.html"), "utf8");
const head = (title, description) => base.slice(0, base.indexOf("<title>")).replace(/^/, "") + `<title>${esc(title)} | Marin Docs</title>` +
  base.slice(base.indexOf("</title>") + 8, base.indexOf("<meta name=\"description\"")).replace(/<link rel="stylesheet"[^>]*>/, "") +
  `<meta name="description" content="${esc(description)}"><link rel="stylesheet" href="../guides/styles.css">` +
  base.slice(base.indexOf("</head>"), base.indexOf("<nav class=\"breadcrumb-nav\""));
const tail = base.slice(base.indexOf("</nav>") + 6).replace(/\.\.\/vendor/g, "../vendor");
const page = (title, description, crumb, body) => {
  const html = head(title, description).replace(/href="(?!#|https?:|data:)([^"]*)"/g, (m, h) => (h.startsWith("../") || h.startsWith("./") ? m : m));
  return html + `<nav class="breadcrumb-nav" aria-label="Breadcrumb"><a href="../index.html">Marin Docs</a> <span aria-hidden="true">/</span> ${crumb}</nav>` +
    tail.replace(/<main id="main"[\s\S]*?<\/main>/, `<main id="main" class="page" tabindex="-1">${body}</main>`);
};
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

let count = 0;
for (const group of groups) {
  for (const pmr of refs(group)) {
    const provisions = refs(pmr);
    const sections = provisions.sort((a, b) => a.position - b.position).map((p) => ({ id: p.legislationIdentifier.replace(/\./g, "-"), label: `${p.legislationIdentifier} ${p.name || ""}`.trim(), text: p.text }));
    const outline = sections.map((x) => [x.id, x.label]).concat([["source", "Source"]]);
    const toc = `<aside class="toc" aria-label="On this page"><h2>On this page</h2><ul>${outline.map((o) => `<li><a href="#${o[0]}">${esc(o[1])}</a></li>`).join("")}</ul></aside>`;
    const facts = [["Effective", local(pmr, "effective-date")], ["Prepared by", local(pmr, "prepared-by")], ["Approved", local(pmr, "approved-by")]].filter((f) => f[1]);
    const body = `<div class="pmr-layout"><article><section class="hero pmr-hero"><h1>PMR ${esc(number(pmr))}: ${esc(pmr.name || "")}</h1>` + (pmr.description ? `<p class="lede">${esc(pmr.description)}</p>` : "") + `</section>` +
      (facts.length ? `<section aria-label="About this regulation"><ul>${facts.map((f) => `<li>${f[0]}: ${esc(f[1])}</li>`).join("")}</ul></section>` : "") +
      sections.map((x) => `<section>${heading(x.id, esc(x.label))}${x.text ? paragraphs(x.text) : ""}</section>`).join("") +
      `<section>${heading("source", "Source")}<p><a href="${esc(source.url)}">${esc(source.name)}</a></p></section></article>${toc}</div>`;
    fs.writeFileSync(path.join(ROOT, "pmrs", `${slug(pmr)}.html`), page(`PMR ${number(pmr)}: ${pmr.name || ""}`, pmr.description || `Personnel Management Regulation ${number(pmr)}.`, `<a href="./">Personnel Management Regulations</a> <span aria-hidden="true">/</span> PMR ${esc(number(pmr))}`, body));
    count += 1;
  }
}

const list = groups.map((g) => `<section>${heading(`section-${g.position}`, `${esc(g.legislationIdentifier)}: ${esc(g.name)}`)}<ul>${refs(g).sort((a, b) => a.position - b.position).map((p) => `<li><a href="./${slug(p)}.html">PMR ${esc(number(p))}: ${esc(p.name || "")}</a></li>`).join("")}</ul></section>`).join("");
fs.writeFileSync(path.join(ROOT, "pmrs/index.html"), page("Personnel Management Regulations", "The County of Marin's rules for personnel matters.", "Personnel Management Regulations",
  `<section class="hero pmr-hero"><h1>Personnel Management Regulations</h1><p class="lede">The County of Marin's rules for personnel matters.</p></section>${list}<section>${heading("source", "Source")}<p><a href="${esc(source.url)}">${esc(source.name)}</a></p></section>`));
console.log(`wrote pmrs/index.html and ${count} regulation pages`);

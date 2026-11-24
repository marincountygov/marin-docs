#!/usr/bin/env node
// Puts the left navigation and the previous and next links (the document set outline, scripts/doc-nav.js) into each SOP page, between <!--doc-nav--> markers.
// The SOP pages are written by hand, so this script is what keeps their navigation the same on every page.
// Only the listed SOPs (scripts/sop-list.js) are in it. A short collection is one plain list, A to Z. When it grows past about 8 documents, group it by department (see plans/DOCS-LEFTNAV-PLAN.md).
//
//   node scripts/build-sop-nav.js           write the navigation into each SOP page
//   node scripts/build-sop-nav.js --check   fail if a page is out of date
"use strict";
const fs = require("fs");
const path = require("path");
const { renderDocNav } = require("./doc-nav.js");
const { renderDocPager } = require("./doc-pager.js");
const { listedSopFiles } = require("./sop-list.js");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "sop");
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
const MARK = /<!--doc-nav-->[\s\S]*?<!--\/doc-nav-->/;
const PAGER = /<!--doc-pager-->[\s\S]*?<!--\/doc-pager-->/;

const listed = new Set(listedSopFiles());
const all = fs.readdirSync(DIR).filter((f) => f.endsWith(".html")).sort().map((f) => {
  const html = fs.readFileSync(path.join(DIR, f), "utf8");
  const h1 = html.match(/<h1 class="doc-title">(.*?)<\/h1>/);
  return h1 ? { file: f, html, title: decode(h1[1].replace(/<[^>]+>/g, "").trim()) } : null;
}).filter(Boolean);
const pages = all.filter((p) => listed.has(p.file));
pages.sort((a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base", numeric: true }));

const check = process.argv.includes("--check");
let stale = 0;
// A page that is not listed has no navigation (its pages stay in place but are left off the lists).
for (const page of all.filter((p) => !listed.has(p.file))) {
  const bare = page.html.replace(MARK, "").replace(PAGER, "");
  if (bare === page.html) continue;
  if (check) { stale += 1; console.error(`sop/${page.file}: is not listed and should have no navigation or pager`); } else fs.writeFileSync(path.join(DIR, page.file), bare);
}
for (const page of pages) {
  const nav = renderDocNav({
    label: "Standard operating procedures",
    set: { name: "Standard operating procedures", href: "./" },
    search: { src: "search.json", script: "../doc-search.js" },
    groups: [{ items: pages.map((p) => ({ label: p.title, href: p.file, current: p === page })) }],
  });
  const block = `<!--doc-nav-->${nav}<!--/doc-nav-->`;
  const at = pages.indexOf(page);
  const link = (p) => (p ? { label: p.title, href: p.file } : null);
  const pager = `<!--doc-pager-->${renderDocPager({ label: "Standard operating procedures", prev: link(pages[at - 1]), next: link(pages[at + 1]) })}<!--/doc-pager-->`;
  let next = MARK.test(page.html) ? page.html.replace(MARK, () => block) : page.html.replace('<div class="docs-layout">', () => `<div class="docs-layout">${block}`);
  // The pager is the last thing in the article, before the "On this page" column.
  next = PAGER.test(next) ? next.replace(PAGER, () => pager) : next.replace('</article><aside class="toc"', () => `${pager}</article><aside class="toc"`);
  if (next === page.html) continue;
  if (check) { stale += 1; console.error(`sop/${page.file}: navigation is out of date`); } else fs.writeFileSync(path.join(DIR, page.file), next);
}
if (check && stale) { console.error("Run: node scripts/build-sop-nav.js"); process.exit(1); }
console.log(check ? `SOP navigation is current (${pages.length} pages).` : `Wrote the navigation into ${pages.length} SOP pages.`);

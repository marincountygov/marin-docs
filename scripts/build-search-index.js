#!/usr/bin/env node
// Writes search-index.json: one flat list of what a person can look up in Marin Docs, for the search box on the home page
// and for the search box on the MarinOS home page (marin-os reads it through the "searchIndex" of this app in its catalog.json).
//
// Each entry is { "k": kind, "n": name, "a": other names, "d": one plain line, "h": where it opens }, with "h" relative to "base".
//   SOP    each standard operating procedure (sop/*.html)
//   Guide  each page of each guide (guides/<guide>/*.html), with the guide's name as another name
//   PMR    each Personnel Management Regulation (pmrs/pmr-*.html) and each of its numbered sections
// It reads the built pages, so every entry opens a page that exists. Only the SOPs that are listed (sop/sops.json) are in it.
// It also writes one search file for each set, read by the search box in that set's left navigation and on its list page:
//   pmrs/search.json, guides/<guide>/search.json, sop/search.json
// Each is a list of { n: name, p: the document it is in, h: where it opens (relative to the file), t: its text }, one entry for every document and every section.
// They are large (the regulations are about 400 KB) and are loaded only when a person clicks into a search box.
// Built from the pages; do not edit by hand.
//
//   node scripts/build-search-index.js           write search-index.json
//   node scripts/build-search-index.js --check   fail if the file is out of date
"use strict";
const fs = require("fs");
const path = require("path");
const { listedSopFiles } = require("./sop-list.js");
const { decodeEntities, stripTags, removeElements } = require("./html-text.js");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "search-index.json");
const BASE = "https://marincountygov.github.io/marin-docs/";

// A heading's own anchor link ("#") is not part of its text.
const isAnchor = (name, startTag) => name === "a" && startTag.includes('class="heading-anchor"');
const text = (html) => decodeEntities(stripTags(html, " ", isAnchor)).replace(/\s+/g, " ").trim();
const clip = (s, n = 160) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
const one = (html, re) => { const m = html.match(re); return m ? text(m[1]) : ""; };
const pages = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".html")).sort().map((f) => `${dir}/${f}`);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const byName = (a, b) => a.n.localeCompare(b.n, "en", { sensitivity: "base", numeric: true });

const entries = [];

// SOPs: the pages of sop/ that carry a title of their own (the list page and the folders are not procedures).
const sops = [];
const listed = new Set(listedSopFiles());
for (const file of pages("sop")) {
  if (!listed.has(path.basename(file))) continue; // a page that is not listed stays out of every list
  const html = read(file);
  const name = one(html, /<h1 class="doc-title">(.*?)<\/h1>/);
  if (!name) continue;
  sops.push({ k: "SOP", n: name, a: [], d: one(html, /<p class="doc-description">(.*?)<\/p>/), h: file });
}
entries.push(...sops.sort(byName));

// Guides: every page of every guide. A guide's name is another name for each of its pages.
const guideNames = {};
for (const item of JSON.parse(read("guides/guides.json"))["@graph"][0].itemListElement) guideNames[item.item["@id"].split("/").pop()] = item.item.name;
const guides = [];
for (const slug of Object.keys(guideNames).sort()) {
  const dir = `guides/${slug}`;
  if (!fs.existsSync(path.join(ROOT, dir))) continue;
  for (const file of pages(dir)) {
    const html = read(file);
    const name = one(html, /<h1 class="doc-title">(.*?)<\/h1>/);
    if (!name) continue;
    guides.push({ k: "Guide", n: name, a: name === guideNames[slug] ? [] : [guideNames[slug]], d: one(html, /<p class="doc-description">(.*?)<\/p>/), h: file });
  }
}
entries.push(...guides.sort(byName));

// PMRs: the chapter, then each numbered section, opened at its heading.
const regs = JSON.parse(read("pmrs/data/regulations.jsonld"))["@graph"];
const sectionText = new Map();
for (const r of regs) if (r.codificationLevel === "section") sectionText.set(r["@id"], r.text || "");
const pmrs = [];
for (const file of pages("pmrs").filter((f) => /pmr-\d+\.html$/.test(f))) {
  const html = read(file);
  const title = one(html, /<h1>(.*?)<\/h1>/); // "PMR 5: Probation"
  const number = (title.match(/^PMR\s+(\d+)/) || [])[1];
  if (!number) continue;
  pmrs.push({ k: "PMR", n: title, a: [`PMR ${number}`, "Personnel Management Regulations"], d: clip(one(html, /<p class="lede">(.*?)<\/p>/)), h: file });
  const re = /<h2 id="(\d+-\d+)">(.*?)<\/h2>/g;
  let m;
  while ((m = re.exec(html))) {
    const [, id, heading] = m;
    const label = text(heading); // "5.3 Probationary Period"
    const dotted = id.replace("-", ".");
    const body = sectionText.get(`https://marincountygov.github.io/marin-data/id/regulation/pmr-${number}/${dotted}`) || "";
    pmrs.push({ k: "PMR", n: `PMR ${label}`, a: [`PMR ${dotted}`], d: clip(body.replace(/\s+/g, " ").replace(/^[A-Z]\.\s*/, "")) || `Section of PMR ${number}`, h: `${file}#${id}` });
  }
}
// The glossary: each defined term, opened at its entry on the glossary page. It is in the set's text file (in the same list as the regulations,
// so a search of the manual finds a definition) and in the list of names.
const defined = JSON.parse(read("pmrs/data/definitions.jsonld"))["@graph"].filter((n) => n["@type"] === "DefinedTerm").sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
const glossary = defined.map((t) => ({ k: "PMR", n: t.name, a: ["Glossary"], d: clip(t.description), h: `pmrs/glossary.html#${t["@id"].split("/").pop()}`, full: String(t.description || "").replace(/\s+/g, " ").trim() }));
entries.push(...pmrs, ...glossary); // chapters and their sections stay in the order of the manual, then the glossary

// ---- the search file of each set ----
const setFiles = new Map(); // path (from the repo root) -> list of { n, p, h, t }
const norm = (t) => String(t || "").replace(/\s+/g, " ").trim();
// A page's sections: <section class="section" id="x"><h2>Heading</h2>…, each with its text up to the next one.
function sectionsOf(html) {
  const article = removeElements((html.match(/<article class="content">([\s\S]*)<\/article>/) || [, ""])[1].replace(/<div class="doc-actions"[\s\S]*?<span class="doc-action-status"[^>]*><\/span><\/div>/, ""), ["script", "style"]);
  const out = [];
  const re = /<section class="section" id="([^"]+)">\s*<h2>([\s\S]*?)<\/h2>([\s\S]*?)(?=<section class="section" id=|$)/g;
  let m;
  while ((m = re.exec(article))) out.push({ id: m[1], heading: text(m[2]), body: norm(text(m[3])) });
  return out;
}
function pageEntries(file, dir) {
  const html = read(file);
  const title = one(html, /<h1 class="doc-title">(.*?)<\/h1>/);
  if (!title) return [];
  const href = path.relative(dir, file);
  return [{ n: title, p: "", h: href, t: norm(one(html, /<p class="doc-description">(.*?)<\/p>/)) }, ...sectionsOf(html).map((x) => ({ n: x.heading, p: title, h: `${href}#${x.id}`, t: x.body }))];
}
for (const slug of Object.keys(guideNames).sort()) {
  const dir = `guides/${slug}`;
  if (fs.existsSync(path.join(ROOT, dir))) setFiles.set(`${dir}/search.json`, pages(dir).flatMap((f) => pageEntries(f, dir)));
}
setFiles.set("sop/search.json", pages("sop").filter((f) => listed.has(path.basename(f))).flatMap((f) => pageEntries(f, "sop")));
const pmrSet = [];
for (const e of pmrs) {
  const [file, id] = e.h.split("#");
  const name = path.basename(file);
  if (!id) { pmrSet.push({ n: e.n, p: "", h: name, t: norm(e.d) }); continue; }
  const dotted = id.replace("-", ".");
  const number = (name.match(/pmr-(\d+)/) || [])[1];
  const full = sectionText.get(`https://marincountygov.github.io/marin-data/id/regulation/pmr-${number}/${dotted}`) || "";
  const chapter = pmrs.find((x) => x.h === file);
  pmrSet.push({ n: e.n, p: chapter ? chapter.n : "", h: `${name}#${id}`, t: norm(full) });
}
for (const g of glossary) pmrSet.push({ n: g.n, p: "Glossary", h: path.basename(g.h), t: g.full });
setFiles.set("pmrs/search.json", pmrSet);
const setOut = new Map([...setFiles].map(([f, list]) => [f, `${JSON.stringify(list)}\n`]));

const doc = {
  schemaVersion: "1.0.0",
  title: "Marin Docs search list",
  base: BASE,
  // The full text of each set, for a search box that shows where the words are (a snippet) and highlights them on arrival.
  // Large, so a box loads these only after a person starts to search. When a box reads them it uses them in place of this list's
  // entries of the same kind (the set files have every section as well as every document).
  sets: [{ src: "pmrs/search.json", kind: "PMR" }, { src: "sop/search.json", kind: "SOP" }, ...Object.keys(guideNames).sort().filter((g) => fs.existsSync(path.join(ROOT, `guides/${g}`))).map((g) => ({ src: `guides/${g}/search.json`, kind: "Guide" }))],
  entries: entries.map((e) => ({ k: e.k, n: e.n, ...(e.a.length ? { a: e.a } : {}), d: e.d, h: e.h })),
};
const out = `${JSON.stringify(doc, null, 1)}\n`;

if (process.argv.includes("--check")) {
  const files = [[OUT, out], ...[...setOut].map(([f, body]) => [path.join(ROOT, f), body])];
  const old = files.filter(([f, body]) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "") !== body);
  if (old.length) { console.error(`Out of date: ${old.map(([f]) => path.relative(ROOT, f)).join(", ")}. Run: node scripts/build-search-index.js`); process.exit(1); }
  console.log(`The search files are current (search-index.json: ${doc.entries.length} entries; ${setOut.size} set files).`);
} else {
  fs.writeFileSync(OUT, out);
  for (const [f, body] of setOut) fs.writeFileSync(path.join(ROOT, f), body);
  const by = {};
  doc.entries.forEach((e) => { by[e.k] = (by[e.k] || 0) + 1; });
  console.log(`Wrote search-index.json: ${doc.entries.length} entries`, by);
}

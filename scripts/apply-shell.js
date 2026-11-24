#!/usr/bin/env node
// Puts the MarinOS shell (scripts/shell-chrome.js) around the pages of Marin Docs that are written by hand: the SOPs, their lists, topics,
// departments and organizations, the guides list and the Public Engagement Plan. Pages the generators write already have it. Safe to run again.
//
//   node scripts/apply-shell.js           convert the pages
//   node scripts/apply-shell.js --check   fail if a page still has the older header or footer
"use strict";
const fs = require("fs");
const path = require("path");
const { toShell } = require("./shell-chrome.js");

const ROOT = path.resolve(__dirname, "..");
const SKIP = new Set(["vendor", "node_modules", ".git", "organization", "places", "programs", "service-areas", "search", "tests", "scripts", "plans"]);
const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
  const rel = dir ? `${dir}/${e.name}` : e.name;
  if (e.isDirectory()) return SKIP.has(e.name) && !dir ? [] : walk(rel);
  return e.name.endsWith(".html") ? [rel] : [];
});

const check = process.argv.includes("--check");
let changed = 0;
for (const file of walk("").filter((f) => f.includes("/"))) {
  const html = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (!html.includes('<header class="site-header">')) {
    // Already has the shell: make sure it has the script that highlights searched words.
    if (!html.includes("doc-highlight.js") && html.includes('app-home.js" defer></script>')) {
      if (check) { console.error(`${file}: has no doc-highlight.js`); changed += 1; continue; }
      const root = "../".repeat(file.split("/").length - 1);
      fs.writeFileSync(path.join(ROOT, file), html.replace(/<script src="[^"]*app-home\.js" defer><\/script>/, (m) => `${m}<script src="${root}doc-highlight.js" defer></script>`));
      changed += 1;
    }
    continue;
  }
  if (check) { console.error(`${file}: still has the older header`); changed += 1; continue; }
  fs.writeFileSync(path.join(ROOT, file), toShell(html, file));
  changed += 1;
}
if (check && changed) process.exit(1);
console.log(check ? "Every page has the shell." : `Put the shell around ${changed} pages.`);

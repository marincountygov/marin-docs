#!/usr/bin/env node
// Keeps every page's "Updated" date in sync with its real edit history,
// instead of a free-typed string that's correct once and stale forever.
//
// Local use, before committing content changes:
//   node scripts/stamp-updated-dates.js
// A file with uncommitted changes is stamped with today's date (the date of
// the commit you're about to make). A clean, already-committed file is
// stamped with its last commit's date, correcting any historical drift.
//
// CI use, verify without writing:
//   node scripts/stamp-updated-dates.js --check

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const repoRoot = path.join(__dirname, "..");
const checkOnly = process.argv.includes("--check");
const DATE_PATTERN = /(<p class="doc-updated">Updated )([^<]+)(<\/p>)/;

function run(cmd) {
  return execSync(cmd, { cwd: repoRoot }).toString().trim();
}

function findHtmlFiles(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(findHtmlFiles(full));
    else if (entry.name.endsWith(".html")) results.push(full);
  }
  return results;
}

function formatDate(date) {
  // Pin America/Los_Angeles explicitly — County of Marin is a Pacific-time
  // organization, and otherwise this renders a different calendar date
  // (or time) depending on the machine's local timezone (a run here vs. a
  // GitHub Actions runner, which defaults to UTC, can disagree by a day
  // near midnight Pacific). timeZoneName: "short" renders PST/PDT
  // correctly across the DST boundary rather than a hardcoded label.
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  });
}

function targetDate(file) {
  const relative = path.relative(repoRoot, file);
  const dirty = run(`git status --porcelain -- "${relative}"`).length > 0;
  if (dirty) return formatDate(new Date());

  const iso = run(`git log -1 --format=%aI -- "${relative}"`);
  if (!iso) return null;
  return formatDate(new Date(iso));
}

let mismatches = 0;
let updated = 0;

for (const file of findHtmlFiles(repoRoot)) {
  const html = fs.readFileSync(file, "utf8");
  const match = DATE_PATTERN.exec(html);
  if (!match) continue;

  const date = targetDate(file);
  if (!date || match[2] === date) continue;

  const relative = path.relative(repoRoot, file);
  if (checkOnly) {
    console.error(`${relative}: shows "${match[2]}" but should be "${date}"`);
    mismatches += 1;
    continue;
  }

  fs.writeFileSync(file, html.replace(match[0], `${match[1]}${date}${match[3]}`));
  console.log(`${relative}: "${match[2]}" -> "${date}"`);
  updated += 1;
}

if (checkOnly) {
  if (mismatches > 0) {
    console.error(`\n${mismatches} page(s) have a stale "Updated" date. Run: node scripts/stamp-updated-dates.js`);
    process.exit(1);
  }
  console.log("All doc-updated dates match git history.");
} else if (updated === 0) {
  console.log("All doc-updated dates already match git history.");
}

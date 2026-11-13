// The FY 2025-26 Final Budget on a department's and a fund's Budget tab: the rows the book prints for the department's
// budget unit (Schedules 8 and 9 and the personnel allocation) and for the fund (Schedules 2 and 3), in the book's own
// words and columns. Returns '' when the book has nothing for the body, or when its data is not in the repository.

const fs = require('fs');
const path = require('path');

const { BUDGET_SITE, dataDir } = require('./budget-data');
let cache;
function book() {
  if (cache !== undefined) return cache;
  const FILE = path.join(dataDir(), 'budget-2025-26', 'schedules.json');
  if (!fs.existsSync(FILE)) { cache = null; return cache; }
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const by = Object.fromEntries(data.schedules.map((s) => [s.number, s]));
  const rows = (s) => s.items.filter((x) => !x.heading);
  // Schedule 8: the unit's lines, each under its function and activity.
  const units = new Map();
  let fn = null;
  let act = null;
  let afterFunction = true;
  for (const x of by[8].items) {
    if (x.heading) { if (afterFunction) { fn = x.heading; act = null; } else act = x.heading; afterFunction = false; continue; }
    if (x.label.startsWith('Function Total:')) { afterFunction = true; continue; }
    if (x.label.startsWith('Activty Total:') || !x.code) continue;
    if (!units.has(x.code)) units.set(x.code, { lines: [], objects: [], pages: new Set() });
    units.get(x.code).lines.push({ fn, act, values: x.values, page: x.page });
    units.get(x.code).pages.add(x.page);
  }
  // Schedule 9: every item under "Budget Unit: <code> ...".
  let current = null;
  for (const x of by[9].items) {
    if (x.heading && /^Budget Unit:/.test(x.heading)) { const m = x.heading.match(/^Budget Unit:\s*(\d+)/); current = m && units.get(m[1]); continue; }
    if (current) { current.objects.push(x); current.pages.add(x.page); }
  }
  const personnel = new Map(data.personnel.departments.map((d) => [d.unit, d]));
  const funds = new Map(rows(by[2]).filter((x) => x.code).map((x) => [x.code, x]));
  const balances = new Map(rows(by[3]).filter((x) => x.code).map((x) => [x.code, x]));
  const info = path.join(dataDir(), 'sources.json');
  const sourceBook = fs.existsSync(info) ? JSON.parse(fs.readFileSync(info, 'utf8')).budgetBook2025 : null;
  cache = { data, by, units, personnel, funds, balances, offset: data.offset, url: sourceBook ? sourceBook.url : null };
  return cache;
}

const printed = (b, pages) => [...pages].map((p) => p - b.offset).sort((x, y) => x - y);
// Each printed page links to the book (PDF page = printed page + the offset) when the book's address is known.
const pagesText = (list, b) => (list.length === 1 ? 'page ' : 'pages ') + list.map((p) => (b.url ? `<a href="${esc(b.url)}#page=${p + b.offset}">${p}</a>` : p)).join(', ');

function sourceBlock(b, pages, up, schedulePages) {
  const items = [`${esc(b.data.book)}, ${pagesText(printed(b, pages), b)}`, ...schedulePages.map(([label, href]) => `<a href="${BUDGET_SITE}budget/fy2025-26/${href}">${esc(label)}</a>`)];
  return `<h3 id="budget-fy2025-26-source">Source, FY 2025-26 Final Budget</h3><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A department's section. `up` is the path to the repository root from the page ("../").
function departmentSection(org, up = '../') {
  const b = book();
  if (!b) return '';
  const code = ((org.identifier || []).find((i) => i.propertyID === 'local:marin-budget-department-code') || {}).value;
  const unit = code && b.units.get(code);
  if (!unit) return '';
  const { table, num, money } = require('./budget-data');
  const cols = b.by[8].columns;
  const lineRows = unit.lines.map((l) => `<tr><th scope="row">${esc(l.fn)}, ${esc(l.act)}</th>${l.values.map((v) => num(v, money(v))).join('')}</tr>`);
  const group = (name, n) => `<tr class="budget-table__group"><th scope="rowgroup" colspan="${n + 1}">${esc(name)}</th></tr>`;
  const objectRows = unit.objects.map((x) => (x.heading
    ? group(x.heading, cols.length)
    : `<tr${/^(Total|Activty Total|Function Total)/.test(x.label) ? ' class="budget-table__subtotal"' : ''}><th scope="row">${esc(x.label)}</th>${x.values.map((v) => num(v, money(v))).join('')}</tr>`));
  const pers = b.personnel.get(code);
  const persCols = b.data.personnel.columns.slice(0, 4);
  const parts = [`<h3 id="budget-fy2025-26">FY 2025-26 Final Budget</h3>`, table(`Budget unit ${code}, by function and activity`, ['', ...cols], lineRows)];
  if (objectRows.length) parts.push(table(`Budget unit ${code}, revenues and expenditures by object`, ['', ...cols], objectRows));
  if (pers && pers.total) parts.push(table(`Personnel allocation, budget unit ${code}`, ['', ...persCols], [`<tr><th scope="row">Total FTE</th>${pers.total.slice(0, 4).map((v) => num(v, v == null ? '' : v.toFixed(2))).join('')}</tr>`]));
  const pages = new Set([...unit.pages, ...(pers ? [pers.page] : [])]);
  parts.push(sourceBlock(b, pages, up, [['Schedule 8', 'schedule-8.html'], ['Schedule 9', 'schedule-9.html'], ['Personnel allocation', 'personnel.html']]));
  return parts.join('');
}

// A fund's section: Schedule 2 (sources and uses) and Schedule 3 (fund balance) rows for its fund number.
function fundSection(code, up = '../../') {
  const b = book();
  if (!b) return '';
  const f = b.funds.get(code);
  const bal = b.balances.get(code);
  if (!f && !bal) return '';
  const { table, num, money } = require('./budget-data');
  const parts = [`<h3 id="budget-fy2025-26">FY 2025-26 Final Budget</h3>`];
  const pages = new Set();
  if (f) {
    const cols = b.by[2].columns;
    parts.push(table(`Fund ${code}, sources and uses`, ['', 'Amount'], cols.map((c, i) => `<tr><th scope="row">${esc(c)}</th>${num(f.values[i], money(f.values[i]))}</tr>`)));
    pages.add(f.page);
  }
  if (bal) {
    const cols = b.by[3].columns;
    parts.push(table(`Fund ${code}, fund balance`, ['', 'Amount'], cols.map((c, i) => `<tr><th scope="row">${esc(c)}</th>${num(bal.values[i], money(bal.values[i]))}</tr>`)));
    pages.add(bal.page);
  }
  parts.push(sourceBlock(b, pages, up, [['Schedule 2', 'schedule-2.html'], ['Schedule 3', 'schedule-3.html']]));
  return parts.join('');
}

module.exports = { departmentSection, fundSection };

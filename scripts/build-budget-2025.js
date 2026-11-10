#!/usr/bin/env node
// Builds the FY 2025-26 Final Budget pages (budget/fy2025-26/) from the rows read out of the book.
//
//   node scripts/build-budget-2025.js [source-dir]
//
// With a source-dir (marin-data/output), schedules.json and the JSON-LD files are copied into budget/fy2025-26/data/ first.
// One page for each schedule, the Road Fund work program, personnel allocation and the property tax trends, and an
// overview. Every label and figure is the book's own. Edit the data, never the generated pages.

const fs = require('fs');
const path = require('path');
const bd = require('./budget-data');
const { shell, esc } = require('./budget-shell');
const { actions, jsonBlock } = require('./page-actions');
const { toolHtml, toolScripts } = require('./budget-tool');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'budget', 'fy2025-26');
const DATA = path.join(OUT, 'data');
const FILES = ['budgets-2025-26.jsonld', 'budget-lines-2025-26.jsonld', 'funds-2025-26.jsonld'];
const crypto = require('crypto');
const PAGE_DATA = '../../organization/page-data.js';
const LIB = '../../vendor/chart.min.js';

fs.mkdirSync(DATA, { recursive: true });
const src = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (src) {
  fs.copyFileSync(path.join(src, 'budget-2025-26', 'schedules.json'), path.join(DATA, 'schedules.json'));
  fs.copyFileSync(path.join(src, 'budget-2025-26', 'notes.json'), path.join(DATA, 'notes.json'));
  for (const f of FILES) fs.copyFileSync(path.join(src, f), path.join(DATA, f));
  const sources = JSON.parse(fs.readFileSync(path.join(src, 'sources.json'), 'utf8'));
  fs.writeFileSync(path.join(DATA, 'book.json'), JSON.stringify(sources.budgetBook2025, null, 2) + '\n');
}
const book = JSON.parse(fs.readFileSync(path.join(DATA, 'book.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(DATA, 'schedules.json'), 'utf8'));
const notes = JSON.parse(fs.readFileSync(path.join(DATA, 'notes.json'), 'utf8'));
const adoptedLines = new Map(JSON.parse(fs.readFileSync(path.join(DATA, 'budget-lines-2025-26.jsonld'), 'utf8'))['@graph'].filter((l) => l.budget['@id'].endsWith('/fy2025-26-adopted')).map((l) => [l['@id'], l]));
const stampOf = (file) => crypto.createHash('sha1').update(fs.readFileSync(path.join(ROOT, file))).digest('hex').slice(0, 8);
const OFFSET = data.offset;
const { money, num, table, kpi, chart, charts, millions } = bd;

const printed = (pdfPage) => pdfPage - OFFSET;
const rangeText = (pdfPages) => {
  const list = [...new Set(pdfPages)].filter((p) => p != null).sort((a, b) => a - b).map(printed);
  if (!list.length) return '';
  const runs = [];
  for (const p of list) {
    const last = runs[runs.length - 1];
    if (last && p === last[1] + 1) last[1] = p;
    else runs.push([p, p]);
  }
  const text = runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ');
  return (list.length === 1 ? 'page ' : 'pages ') + text;
};
const sourceSection = (pdfPages, files = []) => {
  const items = [];
  const pages = rangeText(pdfPages);
  if (pages) items.push(`${esc(book.title)}, ${pages}`);
  items.push(...files.map(([label, href]) => `<a href="${esc(href)}">${esc(label)}</a>`));
  return `<section class="section" aria-labelledby="source"><h2 id="source">Source</h2><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul></section>`;
};
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const SUBTOTAL = /^(Total|Subtotal|Grand Total|Activty Total|Function Total|Net Cost|Change in Net Position|Operating Income)/;
const FIGURE = (v) => (v == null ? null : money(v));
const label = (x) => (x.code ? `${x.code} ${x.label}` : x.label);
const fte = (v) => (v == null ? null : v.toFixed(2));

// One table from a list of rows and headings. A heading is a full-width line; a total row is set apart.
function scheduleTable(caption, columns, items, first = 'Description') {
  const head = [first, ...columns];
  const body = items.map((x) => {
    if (x.heading) return `<tr><th scope="rowgroup" colspan="${head.length}" class="budget-table__group">${esc(x.heading)}</th></tr>`;
    const cls = SUBTOTAL.test(x.label) ? ' class="budget-table__subtotal"' : '';
    return `<tr${cls}><th scope="row">${esc(label(x))}</th>${columns.map((_, i) => { const v = x.values[i]; return num(v, FIGURE(v)); }).join('')}</tr>`;
  });
  return table(caption, head, body);
}

// Sections: one for each fund or budget unit on the schedules that print one after another.
const ENTITY = { 4: /^\d{4}\s/, 6: /^\d{4}\s/, 9: /^Budget Unit:/, 10: /^\d{4}\s/, 11: /^\d{4}\s/, 15: /^\d{4}\s/ };
function sections(s) {
  const test = ENTITY[s.number];
  if (!test) return [{ title: null, items: s.items }];
  const out = [{ title: null, items: [] }];
  const byTitle = new Map();
  let cur = out[0];
  for (const x of s.items) {
    if (x.heading && test.test(x.heading)) {
      const title = x.heading.replace(/^Budget Unit:\s*/, '');
      // The group headings just before it belong to it.
      const lead = [];
      while (cur.items.length && cur.items[cur.items.length - 1].heading && !test.test(cur.items[cur.items.length - 1].heading)) lead.unshift(cur.items.pop());
      // The book prints a budget unit again for each function it spends in; its lines go under the one section.
      if (byTitle.has(title)) cur = byTitle.get(title);
      else {
        cur = { title, items: [] };
        byTitle.set(title, cur);
        out.push(cur);
      }
      cur.items.push(...lead);
      continue;
    }
    cur.items.push(x);
  }
  return out.filter((sec) => sec.items.length || sec.title);
}

const crumbs = (...tail) => [['Marin Docs', '../../index.html'], ['Budget', '../index.html'], ['FY 2025-26', tail.length ? './index.html' : null], ...tail];
const csvOf = (columns, items, first = 'Description') => [[first, ...columns], ...items.map((x) => (x.heading ? [x.heading, ...columns.map(() => '')] : [label(x), ...columns.map((_, i) => (x.values[i] == null ? '' : x.values[i]))]))];

function schedulePage(s) {
  const secs = sections(s);
  const many = secs.filter((sec) => sec.title).length > 1;
  const names = secs.map((sec, i) => ({ id: `s${i}-${slug(sec.title || 'schedule').slice(0, 40)}`, ...sec }));
  const allCsv = names.flatMap((sec, i) => csvOf(s.columns, sec.title ? [{ heading: sec.title }, ...sec.items] : sec.items).slice(i === 0 ? 0 : 1));
  const toc = many ? `<ul aria-label="Sections">${names.filter((n) => n.title).map((n) => `<li><a href="#${n.id}">${esc(n.title)}</a></li>`).join('')}</ul>` : '';
  const body = names.map((n) => (n.title
    ? `<section class="section" aria-labelledby="${n.id}"><h2 id="${n.id}">${esc(n.title)}</h2>${scheduleTable(n.title, s.columns, n.items)}</section>`
    : scheduleTable(`Schedule ${s.number}: ${s.title}`, s.columns, n.items))).join('');
  const title = `Schedule ${s.number}: ${s.title}`;
  return shell(title, `${s.title}, FY 2025-26, as printed in the County of Marin Final Budget.`, crumbs([title, null]),
    `<article class="content budget-schedule"><h1 class="doc-title">${esc(title)}</h1>${actions(`budget-fy2025-26-schedule-${s.number}`, 'article.content', true, [{ id: 'table', label: 'schedule' }])}${toc}${body}` +
    sourceSection(s.pages, [['Schedules (JSON)', './data/schedules.json']]) + jsonBlock({ schedule: [{ '@type': 'Dataset', name: title, schedule: s.number, columns: s.columns, rows: s.items }] }, PAGE_DATA, [{ id: 'table', rows: allCsv }]) + '</article>', '../');
}

function roadFundPage() {
  const r = data.roadFund;
  const items = r.items.map((x) => (x.heading ? x : { ...x, values: x.values.length === 1 ? [null, x.values[0]] : x.values }));
  const plain = items.map((x) => (x.heading ? x : { ...x, code: null }));
  return shell(r.title, 'The Road Fund work program, FY 2025-26, as printed in the County of Marin Final Budget.', crumbs([r.title, null]),
    `<article class="content budget-schedule"><h1 class="doc-title">${esc(r.title)}</h1>${actions('budget-fy2025-26-road-fund', 'article.content', true, [{ id: 'table', label: 'work program' }])}` +
    scheduleTable(r.title, r.columns, plain) + sourceSection([r.page]) +
    jsonBlock({ schedule: [{ '@type': 'Dataset', name: r.title, columns: r.columns, rows: r.items }] }, PAGE_DATA, [{ id: 'table', rows: csvOf(r.columns, plain) }]) + '</article>', '../');
}

function personnelPage() {
  const p = data.personnel;
  const cols = p.columns;
  const tables = p.departments.map((d) => {
    const items = d.rows.map((r) => ({ code: r.code, label: r.label, values: [...r.fte, r.min, r.max] }));
    const body = items.map((x) => `<tr><th scope="row">${esc(label(x))}</th>${x.values.map((v, i) => num(v, i < 4 ? fte(v) : money(v))).join('')}</tr>`);
    const foot = d.total ? `<tfoot><tr><th scope="row">Total</th>${d.total.map((v) => num(v, fte(v))).join('')}${num(null)}${num(null)}</tr></tfoot>` : '';
    return { d, html: `<section class="section" aria-labelledby="dept-${d.unit}"><h2 id="dept-${d.unit}">${esc(d.unit)} ${esc(d.name)}</h2>${table(`${d.unit} ${d.name}`, ['Job class', ...cols], body, foot)}</section>`, csv: [[`${d.unit} ${d.name}`, ...cols], ...items.map((x) => [label(x), ...x.values.map((v) => (v == null ? '' : v))]), ...(d.total ? [['Total', ...d.total, '', '']] : [])] };
  });
  const f = p.byFund;
  const fundRows = f.rows.map((r) => `<tr class="${SUBTOTAL.test(r.label) ? 'budget-table__subtotal' : ''}"><th scope="row">${esc(r.label)}</th>${r.values.map((v) => num(v, fte(v))).join('')}</tr>`);
  const fundCsv = [['Fund', ...f.columns], ...f.rows.map((r) => [r.label, ...r.values.map((v) => (v == null ? '' : v))])];
  const toc = `<ul aria-label="Sections"><li><a href="#by-fund">Personnel allocation by fund</a></li>${tables.map((t) => `<li><a href="#dept-${t.d.unit}">${esc(t.d.unit)} ${esc(t.d.name)}</a></li>`).join('')}</ul>`;
  return shell('Personnel allocation', 'Personnel allocation by department and by fund, FY 2025-26, as printed in the County of Marin Final Budget.', crumbs(['Personnel allocation', null]),
    `<article class="content budget-schedule"><h1 class="doc-title">Personnel allocation</h1>${actions('budget-fy2025-26-personnel', 'article.content', true, [{ id: 'by-fund', label: 'by fund' }, { id: 'by-department', label: 'by department' }])}${toc}` +
    `<section class="section" aria-labelledby="by-fund"><h2 id="by-fund">Personnel allocation by fund</h2>${table('Personnel allocation by fund', ['Fund', ...f.columns], fundRows)}</section>` +
    tables.map((t) => t.html).join('') + sourceSection([...p.departments.map((d) => d.page), 385]) +
    jsonBlock({ schedule: [{ '@type': 'Dataset', name: 'Personnel allocation', columns: p.columns, departments: p.departments, byFund: p.byFund }] }, PAGE_DATA, [{ id: 'by-fund', rows: fundCsv }, { id: 'by-department', rows: tables.flatMap((t) => t.csv) }]) + '</article>', '../');
}

function trendsPage() {
  const t = data.propertyTaxTrends;
  const head = ['Fiscal year', 'Budget requirements', 'Percent change', 'Current secured property tax', 'Percent change'];
  const body = t.map((r) => `<tr><th scope="row">${esc(r.fiscalYear)}</th>${num(r.budgetRequirements, money(r.budgetRequirements))}${num(1, esc(r.budgetRequirementsChange))}${num(r.currentSecured, money(r.currentSecured))}${num(1, esc(r.currentSecuredChange))}</tr>`);
  const csv = [head, ...t.map((r) => [r.fiscalYear, r.budgetRequirements, r.budgetRequirementsChange, r.currentSecured, r.currentSecuredChange])];
  const labels = t.map((r) => r.fiscalYear);
  return shell('Trends relating to property taxes', 'Trends relating to property taxes, county funds only, as printed in the County of Marin Final Budget.', crumbs(['Trends relating to property taxes', null]),
    `<article class="content budget-schedule"><h1 class="doc-title">Trends relating to property taxes</h1>${actions('budget-fy2025-26-property-tax-trends', 'article.content', true, [{ id: 'table', label: 'trends' }])}` +
    charts(chart('chart-trends', 'Current secured property tax', 'line', { labels, series: [{ name: 'Current secured property tax', values: t.map((r) => r.currentSecured) }], summary: `Current secured property tax was ${millions(t[t.length - 1].currentSecured)} in ${labels[labels.length - 1]}.` }, false, LIB)) +
    table('Trends relating to property taxes', head, body) + sourceSection([372]) +
    jsonBlock({ schedule: [{ '@type': 'Dataset', name: 'Trends relating to property taxes', rows: t }] }, PAGE_DATA, [{ id: 'table', rows: csv }]) + '</article>', '../');
}

// ---- Budget lines: a tool with filters, live stats, and cards or a table, as the Capital projects page is -------
const BASE = 'https://marincountygov.github.io/marin-data/id/';
function budgetLines() {
  const out = [];
  let fn = null;
  let act = null;
  let afterFunction = true;
  for (const x of data.schedules.find((sc) => sc.number === 8).items) {
    if (x.heading) { if (afterFunction) { fn = x.heading; act = null; } else act = x.heading; afterFunction = false; continue; }
    if (x.label.startsWith('Function Total:')) { afterFunction = true; continue; }
    if (x.label.startsWith('Activty Total:')) continue;
    if (!x.code) continue;
    out.push({ id: `${BASE}budget-line/fy2025-26-adopted/function-${slug(fn)}/activity-${slug(act)}/unit-${x.code}/expenditure`, slug: `${x.code}-${slug(fn)}-${slug(act)}`, unit: `${x.code} ${x.label}`, code: x.code, fn, act, values: x.values, page: x.page });
  }
  return out;
}
const LINES = budgetLines();
const YEAR_OPTIONS = [{ label: 'FY 2026-27 Proposed', href: '../index.html' }, { label: 'FY 2025-26 Final', href: './index.html' }];
const YSHORT = ['2023-24 Actual', '2024-25 Estimated', '2025-26 Recommended', '2025-26 Adopted'];

function homePage() {
  const S = Object.fromEntries(data.schedules.map((sc) => [sc.number, sc]));
  const rows = (sc) => sc.items.filter((x) => !x.heading);
  const cols = S[5].columns;
  const gov = rows(S[1]).find((x) => x.label === 'Total Governmental Funds');
  const general = rows(S[2]).find((x) => x.code === '1000');
  const uses = rows(S[7]).find((x) => x.label === 'Subtotal Financing Uses');
  const sourcesRows = rows(S[5]).filter((x) => x.page === 90 && !x.label.startsWith('Total'));
  const sourcesTotal = rows(S[5]).find((x) => x.label === 'Total Summarization by Source');
  const t7 = rows(S[7]).find((x) => x.label === 'Total Financing Uses by Function');
  const fnRows = rows(S[7]).filter((x) => !x.code && x.values.length === 4 && rows(S[7]).indexOf(x) < rows(S[7]).indexOf(t7));
  const mil = (n) => (n < 0 ? '−' : '') + '$' + (Math.abs(n) / 1e6).toFixed(1) + 'M';
  const change = uses.values[3] - uses.values[1];
  const cards = `<div class="mm-stats-kpis">${[
    kpi('Financing uses, FY 2025-26', millions(uses.values[3])),
    kpi('Additional financing sources, FY 2025-26', millions(sourcesTotal.values[3])),
    kpi('Change in financing uses', `${change > 0 ? '+' : ''}${mil(change)} (${((change / uses.values[1]) * 100).toFixed(1)}%)`),
    kpi('General Fund', millions(general.values[4])),
    kpi('Decreases to obligated fund balances', millions(gov.values[1])),
  ].join('')}</div>`;
  const largest = (list) => [...list].sort((a, b) => b.values[3] - a.values[3])[0];
  const one = (id, title, list) => chart(id, title, 'bars', { labels: list.map((r) => r.label), series: [{ name: cols[3], values: list.map((r) => r.values[3]) }],
    summary: `${largest(list).label} is the largest at ${millions(largest(list).values[3])} in FY 2025-26.` }, false, LIB);
  const group = (name) => `<tr class="budget-table__group"><th scope="rowgroup" colspan="${cols.length + 1}">${esc(name)}</th></tr>`;
  const line = (r, total) => `<tr${total ? ' class="budget-table__total"' : ''}><th scope="row">${esc(r.label)}</th>${r.values.map((v) => num(v, money(v))).join('')}</tr>`;
  const mixed = [group('Additional financing sources'), ...sourcesRows.map((r) => line(r)), line(sourcesTotal, true), group('Financing uses by function'), ...fnRows.map((r) => line(r)), line(t7, true)];
  const overview = `<section class="section" aria-labelledby="overview"><h2 id="overview">Overview</h2>${cards}<h3 id="overview-types">Additional financing sources and financing uses</h3>` +
    `${charts(one('chart-county-sources', 'Additional financing sources, FY 2025-26', sourcesRows), one('chart-county-functions', 'Financing uses by function, FY 2025-26', fnRows))}` +
    `${table('Additional financing sources and financing uses', ['', ...cols], mixed)}</section>`;
  const pages = [['road-fund.html', data.roadFund.title, [data.roadFund.page]], ['personnel.html', 'Personnel allocation', [373, 385]], ['property-tax-trends.html', 'Trends relating to property taxes', [372]]];
  const list = [...data.schedules.map((sc) => [`schedule-${sc.number}.html`, `Schedule ${sc.number}: ${sc.title}`, sc.pages]), ...pages];
  const dataHtml = `<section class="section" aria-labelledby="schedules"><h2 id="schedules">Schedules</h2><ul>${list.map(([href, name, pgs]) => `<li><a href="./${href}">${esc(name)}</a>, ${rangeText(pgs)}</li>`).join('')}</ul></section>` +
    sourceSection(LINES.map((l) => l.page), [['Budgets (JSON-LD)', './data/budgets-2025-26.jsonld'], ['Budget lines (JSON-LD)', './data/budget-lines-2025-26.jsonld'], ['Funds (JSON-LD)', './data/funds-2025-26.jsonld'], ['Schedules (JSON)', './data/schedules.json']]);
  const noteLines = [...notes.notes, `${notes.fundsAddedToTheDataset} fund numbers in Schedule 2 were not in the funds data and were added with the book's name and number.`];
  const notesHtml = `<ul>${noteLines.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` +
    (notes.totalsThatDifferFromTheirParts.length ? table('Totals that differ from their parts as printed', ['Line', 'Printed', 'Parts add to', 'Difference'], notes.totalsThatDifferFromTheirParts.map((r) => `<tr><th scope="row">${esc(r.line)}</th>${num(r.printed, money(r.printed))}${num(r.parts, money(r.parts))}${num(r.difference, money(r.difference))}</tr>`)) : '') +
    (notes.unitsWithoutOrganization.length ? table('Budget units with no organization in the data', ['Budget unit', 'Name'], notes.unitsWithoutOrganization.map((u) => `<tr><th scope="row">${esc(u.unit)}</th><td>${esc(u.name)}</td></tr>`)) : '') +
    (notes.unreadableCells.length ? table('Cells printed over each other in the PDF, left empty', ['Book page', 'Row', 'Column'], notes.unreadableCells.map((u) => `<tr><th scope="row">${printed(u.page)}</th><td>${esc(u.label)}</td><td>${u.column}</td></tr>`)) : '');
  const lines = LINES.map((l) => ({ slug: l.slug, ref: l.id, title: l.unit, values: l.values, facets: { function: l.fn, activity: l.act, unit: l.unit }, badges: ['function', 'activity'], page: printed(l.page) }));
  const csv = [['Budget unit', 'Function', 'Activity', ...YSHORT, 'Book page'], ...LINES.map((l) => [l.unit, l.fn, l.act, ...l.values, printed(l.page)])];
  const tool = toolHtml({ id: 'fy2025-26', titleLabel: 'Budget unit', noun: { one: 'line', many: 'lines', Many: 'Lines' }, columns: YSHORT.map((label) => ({ label })), defaultColumn: 3,
    facets: [{ name: 'function', label: 'Functions', all: 'All functions' }, { name: 'activity', label: 'Activities', all: 'All activities' }, { name: 'unit', label: 'Budget units', all: 'All budget units' }],
    chartFacets: ['function', 'unit'], breakdownFacet: 'function', countFacet: 'unit', countLabel: 'Budget units', lines, statsExtra: overview, dataHtml, notesHtml, exportCaption: 'Budget lines in the County of Marin FY 2025-26 Final Budget', statsTitle: 'Budget', lib: LIB, books: YEAR_OPTIONS, currentBook: './index.html' });
  return shell('Budget FY 2025-26', 'The County of Marin Final Budget for fiscal year 2025-26.', crumbs(),
    `<section class="hero"><h1>Budget</h1><p class="lede">The County of Marin budget, as printed in the ${esc(book.title)}.</p></section>${tool}` +
    jsonBlock(LINES.map((l) => adoptedLines.get(l.id)).filter(Boolean), PAGE_DATA, [{ id: 'table', rows: csv }]) + toolScripts('../../'), '../');
}

fs.writeFileSync(path.join(OUT, 'styles.css'), '@import url("../../capital/styles.css");\n');
for (const f of fs.readdirSync(OUT)) if (/^(schedule-\d+|road-fund|personnel|property-tax-trends|lines|index)\.html$/.test(f)) fs.unlinkSync(path.join(OUT, f));
fs.writeFileSync(path.join(OUT, 'index.html'), homePage());
for (const s of data.schedules) fs.writeFileSync(path.join(OUT, `schedule-${s.number}.html`), schedulePage(s));
fs.writeFileSync(path.join(OUT, 'road-fund.html'), roadFundPage());
fs.writeFileSync(path.join(OUT, 'personnel.html'), personnelPage());
fs.writeFileSync(path.join(OUT, 'property-tax-trends.html'), trendsPage());
console.log(`Wrote budget/fy2025-26/ with ${data.schedules.length + 4} pages.`);

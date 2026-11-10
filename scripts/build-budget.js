#!/usr/bin/env node
// Builds the Budget collection from schemaGov JSON-LD.
//
//   node scripts/build-budget.js [source-dir]
//
// With a source-dir, funds.jsonld and sources.json are copied into budget/data/
// first. Then budget/index.html and budget/funds.html are written.
// Edit the data, never the generated pages.

const fs = require('fs');
const { cleanText } = require('./clean-text');
const bd = require('./budget-data');
const { actions, jsonBlock } = require('./page-actions');
const { insightsTab } = require('./insights');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'budget');
const DATA = path.join(OUT, 'data');

const src = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (src) {
  for (const f of ['funds.jsonld', 'sources.json']) fs.copyFileSync(path.join(src, f), path.join(DATA, f));
  bd.copyData(src);
}
const data = bd.load();
const orgFile = path.join(ROOT, 'organization', 'data', 'organizations.jsonld');
const orgs = fs.existsSync(orgFile) ? JSON.parse(fs.readFileSync(orgFile, 'utf8'))['@graph'] : [];
const orgById = new Map(orgs.map((o) => [o['@id'], o]));
const slugOf = (id) => id.split(/[/:]/).pop();
const areaSlug = (o) => slugOf(o['@id']).replace(/^service-area-/, '');
const orgHref = (o) => (o.organizationClassification === 'serviceArea' ? `../service-areas/${areaSlug(o)}.html` : `../organization/${slugOf(o['@id'])}.html`);
const funds = JSON.parse(fs.readFileSync(path.join(DATA, 'funds.jsonld'), 'utf8'))['@graph'];
const sources = JSON.parse(fs.readFileSync(path.join(DATA, 'sources.json'), 'utf8'));

const { shell, esc } = require('./budget-shell');
const { toolHtml, toolScripts } = require('./budget-tool');
const finalBook = require('./budget-2025-org');

const book = sources.budgetBook;
const sourceNote = book ? `<section class="section" aria-labelledby="source"><h2 id="source">Source</h2><p>${esc(book.title)}. ${esc(book.note)}</p></section>` : '';

const fundCard = (f) => {
  const code = (f.identifier || []).find((i) => i.propertyID === 'local:fund-code');
  return `<li class="app-card mm-card"><div class="mm-card__body">${code ? `<div class="mm-card__meta"><span class="app-badge">Fund ${esc(code.value)}</span></div>` : ''}<h3 class="mm-card__title"><a href="./funds/${bd.fundSlug(f)}.html">${esc(bd.fundName(f))}</a></h3>${f.description ? `<p class="mm-card__text">${esc(cleanText(f.description))}</p>` : ''}</div></li>`;
};
const fundCsvs = [{ id: 'table', label: 'funds', rows: [['Fund code', 'Fund', 'Description'], ...funds.map((f) => { const c = (f.identifier || []).find((i) => i.propertyID === 'local:fund-code'); return [c ? c.value : '', bd.fundName(f), f.description ? cleanText(f.description) : '']; })] }];
const fundsSource = `<section class="section" aria-labelledby="source"><h2 id="source">Source</h2><ul>${book ? `<li>${esc(book.title)}</li>` : ''}<li><a href="./data/funds.jsonld">Fund data (JSON-LD)</a></li></ul>${book ? `<p class="app-help-text">${esc(book.note)}</p>` : ''}</section>`;
const fundsPage = shell('Funds', 'The funds the County of Marin accounts for.', [['Marin Docs', '../index.html'], ['Budget', './index.html'], ['Funds', null]],
  `<article class="content"><h1 class="doc-title">Funds</h1>${actions('budget-funds', 'article.content', true, fundCsvs)}` +
  `<ul class="search-results-list" aria-label="Funds">${funds.map(fundCard).join('')}</ul>` +
  fundsSource + jsonBlock(funds, '../organization/page-data.js', fundCsvs) + '</article>');


const { YEARS, LATEST, money, signed, change, num, table, label, val, pagesText, fteText, chart, charts } = bd;
const inMillions = (n) => '$' + (n / 1e6).toFixed(1) + ' million';
const link = (o, text) => (o ? `<a href="${orgHref(o)}">${esc(text || o.name)}</a>` : esc(text));
const NOTE = 'Figures are whole dollars as printed; the final edition still labels FY 2026-27 as Proposed.';
// A page's Source: the book with its pages, and the data files, one item each.
const sourceSection = (pageNums, files, note = NOTE) => `<section class="section" aria-labelledby="source">${bd.sourceList(data, pageNums, files, note, 2, 'source')}</section>`;

let indexOverview = '';
let indexCsvs = [];
let statsOverview = '';
let toolLines = [];
let lineGraph = [];
let indexSources = new Set();
let areasPage = '';
let deptsPage = '';
if (data) {
  const areas = orgs.filter((o) => o.organizationClassification === 'serviceArea');
  const pages = new Set();
  const totalOf = (area, y) => (data.idx.get(y.key).get(area['@id']) || new Map()).get('expenditure-total');
  const areaCsv = [['Service area', 'Department or division', ...YEARS.map((y) => y.label), 'Change', 'FTE']];
  const sections = areas.map((a) => {
    const b = bd.areaBudget(data, a, { orgById, orgHref });
    if (!b) return '';
    b.pages.forEach((p) => pages.add(p));
    areaCsv.push(...b.csvRows);
    return `<section class="section" aria-labelledby="${areaSlug(a)}"><h2 id="${areaSlug(a)}"><a href="../service-areas/${areaSlug(a)}.html">${esc(a.name)}</a></h2>${b.chart}${b.table}</section>`;
  }).join('');
  const areaTotals = areas.map((a) => ({ a, v: YEARS.map((y) => val(totalOf(a, y))) })).filter((x) => x.v[2]).sort((p, q) => q.v[2] - p.v[2]);
  const overviewFor = (base) => `<section class="section" aria-labelledby="areas-compared"><h2 id="areas-compared">Service areas</h2>` +
    charts(chart('chart-areas', 'Expenditures by service area', 'bars', { labels: areaTotals.map((x) => x.a.name), series: YEARS.map((y, i) => ({ name: y.label, values: areaTotals.map((x) => x.v[i]) })),
      summary: `${areaTotals[0].a.name} is the largest at ${inMillions(areaTotals[0].v[2])} in FY 2026-27.` })) +
    table('Expenditures by service area', ['Service area', ...YEARS.map((y) => y.label)], areaTotals.map((x) => `<tr><th scope="row"><a href="${base}#${areaSlug(x.a)}">${esc(x.a.name)}</a></th>${x.v.map((v) => num(v, money(v))).join('')}</tr>`)) + '</section>';
  areasPage = shell('Budget by service area', 'What each County of Marin service area spends, department by department.', [['Marin Docs', '../index.html'], ['Budget', './index.html'], ['Service areas', null]],
    `<article class="content"><h1 class="doc-title">Service areas</h1><p class="app-help-text">Expenditures for each service area. Non Departmental, which holds countywide revenues and transfers, is not included.</p>${actions('budget-by-service-area', 'article.content', true, [{ id: 'table', label: 'service areas' }])}${overviewFor('')}${sections}${sourceSection(pages, [['Budget lines (JSON-LD)', './data/budget-lines.jsonld'], ['Budgets (JSON-LD)', './data/budgets.jsonld']])}` +
    jsonBlock(areas.flatMap((a) => YEARS.map((y) => totalOf(a, y)).filter(Boolean).flatMap((t) => [t, ...(t.hasPart || []).map((p) => data.byId.get(p['@id']))])), '../organization/page-data.js', [{ id: 'table', rows: areaCsv }]) + '</article>');

  const dpages = new Set();
  const depRows = [];
  for (const [oid, o] of orgById) {
    // The County as a whole and a service area are not departments.
    if (o.organizationClassification === 'serviceArea' || o.organizationClassification === 'government') continue;
    const f = bd.figures(data, oid, LATEST);
    if (!f || !f.expTotal || !f.expTypes.length) continue;
    const d = (data.display.organizations || {})[oid] || {};
    const ncc = (d.department || {})['Net County Cost'];
    const fte = bd.fteFor(data, o, o.parentOrganization && orgById.get(o.parentOrganization['@id']));
    dpages.add(data.display.linePages[f.expTotal['@id']]);
    depRows.push({ o, exp: val(f.expTotal), rev: val(f.revTotal), ncc: ncc && ncc.fy2026_27, fte, line: f.expTotal });
  }
  depRows.sort((a, b) => b.exp - a.exp);
  // The Budget page opens with the picture: the service areas compared, and the largest departments.
  const top = depRows.slice(0, 10);
  const county = orgs.find((o) => o.organizationClassification === 'government');
  const cw = county && bd.countywideOverview(data, county);
  indexOverview = (cw ? cw.html : '') + overviewFor('./service-areas.html') +
    `<section class="section" aria-labelledby="largest"><h2 id="largest">Departments</h2>` +
    charts(chart('chart-largest', 'Largest departments, FY 2026-27', 'bars', { labels: top.map((r) => r.o.name), series: [{ name: 'FY 2026-27 Proposed', values: top.map((r) => r.exp) }],
      summary: `${top[0].o.name} is the largest at ${inMillions(top[0].exp)} of ${depRows.length} departments.` })) +
    table('Largest departments, FY 2026-27', ['Department', 'Expenditures'], top.map((r) => `<tr><th scope="row">${link(r.o)}</th>${num(r.exp, money(r.exp))}</tr>`)) +
    `<p><a href="./departments.html">All ${depRows.length} departments</a></p></section>`;
  indexCsvs = [...(cw ? [{ id: 'overview', label: 'overview', rows: cw.csv }] : []), { id: 'areas', label: 'service areas', rows: [['Service area', ...YEARS.map((y) => y.label)], ...areaTotals.map((x) => [x.a.name, ...x.v])] },
    { id: 'departments', label: 'largest departments', rows: [['Department', 'Expenditures FY 2026-27'], ...top.map((r) => [r.o.name, r.exp])] }];
  indexSources = new Set([...pages, ...dpages, ...(cw ? cw.pages : [])]);
  // The tool's lines: each department or division, with its expenditures in each year the book prints.
  const expAt = (oid, key) => { const m = (data.idx.get(key) || new Map()).get(oid); const l = m && (m.get('expenditure-total-department-page') || m.get('expenditure-total')); return l ? val(l) : null; };
  const areaOf = (o) => { for (let p = o; p; p = p.parentOrganization && orgById.get(p.parentOrganization['@id'])) if (p.organizationClassification === 'serviceArea') return p.name; return 'Other'; };
  statsOverview = cw ? cw.html : '';
  toolLines = depRows.map((r) => ({ slug: slugOf(r.o['@id']), ref: r.line['@id'], title: r.o.name, href: orgHref(r.o), values: YEARS.map((y) => expAt(r.o['@id'], y.key)),
    facets: { area: areaOf(r.o), department: r.o.name, kind: r.o.organizationClassification === 'department' ? 'Department' : 'Division' }, badges: ['area', 'kind'], page: data.display.linePages[r.line['@id']] }));
  lineGraph = depRows.map((r) => r.line);
  const rows = depRows.map((r) => `<tr><th scope="row">${link(r.o)}</th>${num(r.exp, money(r.exp))}${num(r.rev, money(r.rev))}${num(r.ncc, money(r.ncc))}${num(r.fte, fteText(r.fte))}</tr>`);
  deptsPage = shell('Budget by department', 'Expenditures, revenues and net County cost for each County of Marin department.', [['Marin Docs', '../index.html'], ['Budget', './index.html'], ['Departments', null]],
    `<article class="content"><h1 class="doc-title">Departments</h1><p class="app-help-text">FY 2026-27, largest first.</p>${actions('budget-by-department', 'article.content', true, [{ id: 'table', label: 'departments' }])}` +
    charts(chart('chart-departments', 'Expenditures by department, FY 2026-27', 'bars', { labels: depRows.map((r) => r.o.name), series: [{ name: 'FY 2026-27 Proposed', values: depRows.map((r) => r.exp) }],
      summary: `${depRows[0].o.name} is the largest at ${inMillions(depRows[0].exp)} of ${depRows.length} departments.` })) +
    table('Budget by department, FY 2026-27', ['Department', 'Expenditures', 'Revenues', 'Net County cost', 'FTE'], rows) + sourceSection(dpages, [['Budget lines (JSON-LD)', './data/budget-lines.jsonld']]) +
    jsonBlock(depRows.flatMap((r) => { const f = bd.figures(data, r.o['@id'], LATEST); return [f.expTotal, f.revTotal].filter(Boolean); }), '../organization/page-data.js', [{ id: 'table', rows: [['Department', 'Expenditures FY 2026-27', 'Revenues FY 2026-27', 'Net County cost FY 2026-27', 'FTE FY 2026-27'], ...depRows.map((r) => [r.o.name, r.exp, r.rev == null ? '' : r.rev, r.ncc == null ? '' : r.ncc, r.fte == null ? '' : r.fte])] }]) + '</article>');
}

const YEAR_OPTIONS = [{ label: 'FY 2026-27 Proposed', href: './index.html' }, { label: 'FY 2025-26 Final', href: './fy2025-26/index.html' }];
const indexTool = data && toolLines.length ? (() => {
  const csv = [['Department or division', 'Service area', 'Type', ...YEARS.map((y) => y.label), 'Book page'], ...toolLines.map((l) => [l.title, l.facets.area, l.facets.kind, ...l.values, l.page || ''])];
  const dataHtml = bd.sourceList(data, indexSources, [['Budget lines (JSON-LD)', './data/budget-lines.jsonld'], ['Budgets (JSON-LD)', './data/budgets.jsonld']], '', 2, 'source').replace(/^/, '<section class="section" aria-labelledby="source">').concat('</section>') +
    `<section class="section" aria-labelledby="pages"><h2 id="pages">Pages</h2><ul><li><a href="./service-areas.html">Service areas</a></li><li><a href="./departments.html">Departments</a></li><li><a href="./funds.html">Funds</a></li></ul></section>`;
  const notesHtml = `<ul>${[NOTE, book && book.note].filter(Boolean).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
  const html = toolHtml({ id: 'fy2026-28', titleLabel: 'Department or division', noun: { one: 'line', many: 'lines', Many: 'Lines' }, columns: YEARS.map((y) => ({ label: y.label })), defaultColumn: YEARS.length - 1,
    facets: [{ name: 'area', label: 'Service areas', all: 'All service areas' }, { name: 'department', label: 'Departments and divisions', all: 'All departments and divisions' }, { name: 'kind', label: 'Types', all: 'All types' }],
    chartFacets: ['area', 'department'], breakdownFacet: 'kind', countFacet: 'department', countLabel: 'Departments', lines: toolLines, statsExtra: statsOverview, dataHtml, notesHtml, exportCaption: 'Budget lines in the County of Marin Proposed Budget FY 2026-28', statsTitle: 'Budget', lib: '../vendor/chart.min.js', books: YEAR_OPTIONS, currentBook: './index.html' });
  return html + jsonBlock(lineGraph, '../organization/page-data.js', [{ id: 'table', rows: csv }]) + toolScripts('../');
})() : '';
const index = shell('Budget', 'The County of Marin budget: service areas, departments and funds.', [['Marin Docs', '../index.html'], ['Budget', null]],
  `<section class="hero"><h1>Budget</h1><p class="lede">The County of Marin budget, as printed in the ${data ? esc(data.bookTitle) : 'budget book'}.</p></section>` +
  (indexTool || (indexOverview + (data ? sourceSection(indexSources, [['Budget lines (JSON-LD)', './data/budget-lines.jsonld'], ['Budgets (JSON-LD)', './data/budgets.jsonld']], `${NOTE}${book ? ' ' + esc(book.note) : ''}`) : sourceNote))));


// ---- A page for each fund -----------------------------------------------------------------------------------------
const programFile = path.join(ROOT, 'organization', 'data', 'programs.jsonld');
const programNames = new Map((fs.existsSync(programFile) ? JSON.parse(fs.readFileSync(programFile, 'utf8'))['@graph'] : []).map((p) => [p['@id'], p.name]));
const FUNDS = path.join(OUT, 'funds');
fs.rmSync(FUNDS, { recursive: true, force: true });
fs.mkdirSync(FUNDS, { recursive: true });
fs.writeFileSync(path.join(FUNDS, 'styles.css'), '@import url("../../organization/styles.css");\n');
const row = (label, html) => `<dt>${esc(label)}</dt><dd>${html}</dd>`;

function fundPage(f) {
  const name = bd.fundName(f);
  const fb = bd.fundBudget(data, f, { orgById, orgHref: (o) => '../' + orgHref(o), programName: (id) => programNames.get(id), lib: '../../vendor/chart.min.js' });
  const facts = [row('Fund code', `<code>${esc(bd.fundCode(f))}</code>`), row('Type', 'Fund')];
  if (f.description) facts.push(row('Description', esc(cleanText(f.description))));
  // A fund for capital projects points to the plan that lists them.
  if (/capital/i.test(name) || /capital (improvement|projects)|\bCIP\b/i.test(f.description || '')) facts.push(row('Capital plan', '<a href="../../capital/index.html">Capital Improvement Plan</a>'));
  const budgetTab0 = fb
    ? `<section class="section" id="budget" data-tab-section="budget" aria-labelledby="budget-heading" hidden><h2 id="budget-heading">Budget</h2>${fb.kpis}<h3 id="budget-departments">Departments</h3>${charts(fb.pie)}` +
      bd.table('Budget by department', fb.head, fb.body, fb.foot) +
      bd.sourceList(data, fb.pages, [['Budget lines (JSON-LD)', '../data/budget-lines.jsonld']], `The budget book lists each program under a fund group, and ${esc(name)} is the group these figures come from. Figures are whole dollars as printed; revenues are positive and net County cost is the book's own figure.`) + '</section>'
    : '';
  // The FY 2025-26 Final Budget's rows for this fund number, when the book has them, join the Budget tab.
  const fin = finalBook.fundSection(bd.fundCode(f), '../../');
  const budgetTab = fb ? budgetTab0.replace(/<\/section>$/, fin + '</section>') : fin ? `<section class="section" id="budget" data-tab-section="budget" aria-labelledby="budget-heading" hidden><h2 id="budget-heading">Budget</h2>${fin}</section>` : '';
  const tabs = ['about', (fb || fin) && 'budget', 'data'].filter(Boolean);
  const csvs = fb ? [{ id: 'departments', label: 'departments', rows: fb.csvDepartments, tab: 'budget' }, { id: 'programs', label: 'programs', rows: fb.csvPrograms, tab: 'budget' }] : [];
  const nav = `<nav id="app-nav" class="org-tabs" aria-label="Sections"><a href="#dashboard">Dashboard</a><a href="#about">About</a>${fb || fin ? '<a href="#budget">Budget</a>' : ''}<a href="#data">Data</a><a href="#insights">Insights</a></nav>`;
  const dashboard = `<div id="dashboard" data-tab-section="dashboard" data-no-copy><div class="org-dashboard">` + (fb
    ? `<section class="org-dash" aria-labelledby="dash-budget"><h2 id="dash-budget">Budget</h2>${fb.kpis}<p class="org-dash__more"><a href="#budget">Budget</a></p></section>`
    : `<section class="org-dash" aria-labelledby="dash-about"><h2 id="dash-about">About</h2><dl class="org-facts">${facts.join('')}</dl><p class="org-dash__more"><a href="#about">About</a></p></section>`) + '</div></div>';
  const insights = insightsTab({ subject: name + ' fund', noun: 'fund', sections: [{ id: 'about', label: 'About', data: { name, code: bd.fundCode(f), description: f.description ? cleanText(f.description) : undefined } }, ...(fb ? [{ id: 'budget', label: 'Budget', data: fb.insights }] : [])],
    scriptPath: '../../organization/insights.js', budgetNote: fb ? bd.BUDGET_NOTE : '' });
  const body = `<article class="content"><h1 class="doc-title">${esc(name)}</h1>${nav}${actions('fund-' + bd.fundSlug(f), 'article.content', true, csvs, { content: tabs, json: tabs })}` + dashboard +
    `<div id="about" data-tab-section="about" hidden><section class="section" aria-labelledby="about-heading"><h2 id="about-heading">About</h2><dl class="org-facts">${facts.join('')}</dl></section></div>` + budgetTab +
    `<div id="data" data-tab-section="data" hidden><section class="section" aria-labelledby="record"><h2 id="record">Record</h2><dl class="org-facts">${row('Record id', `<code>${esc(f['@id'])}</code>`)}${row('Record type', `<code>${esc(f['@type'])}</code>`)}</dl></section>` +
    `<section class="section" aria-labelledby="source"><h2 id="source">Source</h2><ul><li><a href="../data/funds.jsonld">Fund data (JSON-LD)</a></li>${fb ? '<li><a href="../data/budget-lines.jsonld">Budget lines (JSON-LD)</a></li>' : ''}</ul>${book ? `<p class="app-help-text">${esc(book.note)}</p>` : ''}</section></div>` +
    jsonBlock({ about: [f], data: [f], budget: fb ? fb.lines : [] }, '../../organization/page-data.js', csvs) + insights + '</article>';
  return shell(name, f.description ? cleanText(f.description) : `A fund of the County of Marin.`, [['Marin Docs', '../../index.html'], ['Budget', '../index.html'], ['Funds', '../funds.html'], [name, null]], body, '../');
}
for (const f of funds) fs.writeFileSync(path.join(FUNDS, `${bd.fundSlug(f)}.html`), fundPage(f));

fs.writeFileSync(path.join(OUT, 'index.html'), index);
fs.writeFileSync(path.join(OUT, 'funds.html'), fundsPage);
for (const [f, html] of [['service-areas.html', areasPage], ['departments.html', deptsPage]]) {
  if (html) fs.writeFileSync(path.join(OUT, f), html);
  else if (fs.existsSync(path.join(OUT, f))) fs.unlinkSync(path.join(OUT, f));
}
console.log(`Wrote budget/index.html, budget/funds.html and ${funds.length} fund pages.`);

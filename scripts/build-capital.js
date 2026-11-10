#!/usr/bin/env node
// Builds the Capital Improvement Plan collection from schemaGov JSON-LD.
//
//   node scripts/build-capital.js [source-dir]
//
// With a source-dir (marin-data/output/cip), the data files are copied into capital/data/ first. Then
// capital/index.html, capital/projects.html and a page for each project are written.
// Edit the data, never the generated pages.

const fs = require('fs');
const path = require('path');
const bd = require('./budget-data');
const { testBanner } = require('./test-banner');
const { actions, chartActions, jsonBlock } = require('./page-actions');
const { ICON_CAPITAL } = require('./icons');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'capital');
const DATA = path.join(OUT, 'data');
const FILES = ['cip-projects.jsonld', 'cip-budget-lines.jsonld', 'cip-budgets.jsonld'];

const src = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (src) {
  fs.mkdirSync(DATA, { recursive: true });
  for (const f of FILES) fs.copyFileSync(path.join(src, f), path.join(DATA, f));
  fs.copyFileSync(path.join(src, 'source', 'cip-display.json'), path.join(DATA, 'cip-display.json'));
}
const graph = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'))['@graph'];
const projects = graph('cip-projects.jsonld');
const lines = graph('cip-budget-lines.jsonld');
const display = JSON.parse(fs.readFileSync(path.join(DATA, 'cip-display.json'), 'utf8'));
const sourceInfo = JSON.parse(fs.readFileSync(path.join(DATA, 'sources.json'), 'utf8'));
const { money, num, table, chart, charts, kpi, esc, millions, signed } = bd;

const YEARS = display.years; // '2026-27' ...
const COLS = YEARS.map((y, i) => ({ key: y, short: 'FY' + y.slice(-2), head: `${i === 0 ? 'Proposed' : 'Programmed'} FY${y.slice(-2)}` }));
const BOOK = sourceInfo.cipBook.title;
const BOOK_URL = sourceInfo.cipBook.url;
const bookLink = () => (BOOK_URL ? `<a href="${esc(BOOK_URL)}">${esc(BOOK)}</a>` : esc(BOOK));
const slugOf = (id) => id.split('/').pop();
const byId = new Map(display.projects.map((p) => [p['@id'], p]));
const linesOf = new Map();
for (const l of lines) if (l.project) (linesOf.get(l.project['@id']) || linesOf.set(l.project['@id'], []).get(l.project['@id'])).push(l);

// A script's address changes when the script does, so a page never runs a script older or newer than itself.
const stamp = (file) => require('crypto').createHash('sha1').update(fs.readFileSync(path.join(ROOT, file))).digest('hex').slice(0, 8);
const ICON = ICON_CAPITAL;
const FAVICON = "<link rel=\"icon\" type=\"image/svg+xml\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' rx='10' fill='%23000'/%3E%3Cg fill='none' stroke='%23e5b53b' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round' transform='translate(9,9) scale(1.25)'%3E" + ICON.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'") + "%3C/g%3E%3C/svg%3E\">";

function shell(title, description, crumbs, body, up = '') {
  const trail = crumbs.map(([label, href]) => (href ? `<a href="${href}">${esc(label)}</a>` : esc(label))).join(' <span aria-hidden="true">/</span> ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | Marin Docs</title>${FAVICON}<meta name="description" content="${esc(description)}"><link rel="stylesheet" href="styles.css"></head><body><a class="skip-link" href="#main">Skip to main content</a><marin-os-banner></marin-os-banner><header class="site-header"><div class="header-inner"><span class="docs-brand-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${ICON}</svg></span><nav class="breadcrumb-nav" aria-label="Breadcrumb">${trail}</nav></div></header>${testBanner('capital/')}<main id="main" class="page" tabindex="-1">${body}</main><footer class="site-footer" role="contentinfo"><div class="footer-inner"><a href="https://marincountygov.github.io/marin-os/">MarinOS</a></div></footer><a class="app-feedback" href="https://form.asana.com/?k=qVUT83d5DBmlDiIyi-WAyQ&amp;d=23133298259496" target="_blank" rel="noreferrer">Feedback</a><script src="${up}../vendor/marinos/marinos.js" defer></script></body></html>\n`;
}

// Where in the book a figure is printed. The book's own page numbers: "PROPOSED CIP | n".
const bookItem = (pages) => { const list = [...pages].sort((a, b) => a - b); return `${bookLink()}, ${list.length === 1 ? 'page ' : 'pages '}${list.join(', ')}`; };
const FILES_LIST = (up) => [['Projects (JSON-LD)', `${up}data/cip-projects.jsonld`], ['Budget lines (JSON-LD)', `${up}data/cip-budget-lines.jsonld`], ['Budgets (JSON-LD)', `${up}data/cip-budgets.jsonld`]];
const sourceList = (pages, up) => `<ul><li>${bookItem(pages)}</li>` + FILES_LIST(up).map(([l, h]) => `<li><a href="${h}">${esc(l)}</a></li>`).join('') + '</ul>';
const sourceSection = (pages, up, note) => `<section class="section" aria-labelledby="source"><h2 id="source">Source</h2>${sourceList(pages, up)}${note ? `<p class="app-help-text">${note}</p>` : ''}</section>`;
// Notes about the figures come from sources.json, not from this file.
const NOTES = sourceInfo.cipBook.notes || [];
const NOTE = NOTES.join(' ');

// ---- The book's totals --------------------------------------------------------------------------------------------
const cat = (label) => display.categoryTotals.find((c) => c.label === label);
const ALL = cat('All Project Categories Total');
const GROUPS = ['Facilities', 'Public Safety', 'Special Projects', 'Transportation', 'Water Resources'];
const groupTotal = (g) => cat(g === 'Special Projects' ? 'Special Projects Total' : g + ' Total');
const subTotal = (g, sub) => (sub ? cat(sub + ' Total') || cat(sub === 'Special Projects - Miscellaneous' ? 'Special Projects - Misc.' : sub) : groupTotal(g));
// The book's TOTAL row is not a fund source.
const expenses = display.fundSources.expenditure.filter((r) => r.label !== 'TOTAL');
const revenues = display.fundSources.revenue.filter((r) => r.label !== 'TOTAL');

// ---- A page for each project --------------------------------------------------------------------------------------
const PROJ = path.join(OUT, 'projects');
fs.rmSync(PROJ, { recursive: true, force: true });
fs.mkdirSync(PROJ, { recursive: true });
fs.writeFileSync(path.join(PROJ, 'styles.css'), '@import url("../../organization/styles.css");\n');
const row = (label, html) => `<dt>${esc(label)}</dt><dd>${html}</dd>`;
const fundingRows = (p) => [...COLS.map((c) => [c.head, p.byYear[c.key]]), ['Prior approvals', p.priorApprovals]];

function projectPage(node) {
  const p = byId.get(node['@id']);
  const csv = [['Item', 'Amount'], ['Total project cost estimate', p.costEstimate], ['Prior approvals', p.priorApprovals], ...COLS.map((c) => [c.head, p.byYear[c.key]]), ['Total funding', p.totalFunding], ['Additional funds needed', p.additionalFundsNeeded]];
  const funding = table(`Funding for ${p.name}`, ['', 'Amount'], [
    ['Prior approvals', p.priorApprovals], ...COLS.map((c) => [c.head, p.byYear[c.key]]), ['Total funding in the plan', p.totalFunding], ['Additional funds needed', p.additionalFundsNeeded],
  ].map(([l, v]) => `<tr><th scope="row">${esc(l)}</th>${num(v, money(v))}</tr>`));
  const facts = [row('Category', `<a href="../projects.html?${p.subcategory ? 'subcategory=' + encodeURIComponent(p.subcategory) : 'category=' + encodeURIComponent(p.category)}">${esc([p.category, p.subcategory].filter(Boolean).join(': '))}</a>`),
    row('Status in the plan', esc(p.cipStatus)), row('Total project cost estimate', money(p.costEstimate))];
  const body = `<article class="content"><h1 class="doc-title">${esc(p.name)}</h1>${actions('capital-' + slugOf(p['@id']), 'article.content', true, [{ id: 'table', label: 'funding' }])}` +
    `<section class="section" aria-labelledby="about-heading"><h2 id="about-heading">About</h2><dl class="org-facts">${facts.join('')}</dl></section>` +
    `<section class="section" aria-labelledby="funding-heading"><h2 id="funding-heading">Funding</h2>${funding}</section>` +
    sourceSection([p.page], '../', NOTE) +
    jsonBlock([node, ...(linesOf.get(node['@id']) || [])], '../../organization/page-data.js', [{ id: 'table', rows: csv }]) + '</article>';
  return shell(p.name, `${p.name}, a project in the County of Marin FY 2027-31 Capital Improvement Plan.`, [['Marin Docs', '../../index.html'], ['Capital plan', '../index.html'], ['Projects', '../projects.html'], [p.name, null]], body, '../');
}
for (const n of projects) fs.writeFileSync(path.join(PROJ, `${slugOf(n['@id'])}.html`), projectPage(n));

// ---- Projects: a tool with filters, live stats, and cards or a table --------------------------------------------
const HEAD = ['Project', 'Category', 'Status', 'Cost estimate', 'Prior approvals', ...COLS.map((c) => c.head), 'Additional funds needed'];
const catLabel = (p) => [p.category, p.subcategory].filter(Boolean).join(': ');
const sizeOf = (c) => (c < 1e6 ? 'under-1m' : c < 1e7 ? '1m-10m' : '10m-plus');
const SIZES = [['under-1m', 'Under $1 million'], ['1m-10m', '$1 million to $10 million'], ['10m-plus', 'Over $10 million']];
const yearsOf = (p) => COLS.filter((c) => p.byYear[c.key] > 0).map((c) => 'fy' + c.key);
const attrs = (p, i) => `data-project="${slugOf(p['@id'])}" data-order="${i}" data-name="${esc(p.name.toLowerCase())}" data-search-text="${esc((p.name + ' ' + catLabel(p) + ' ' + p.cipStatus).toLowerCase())}" ` +
  `data-facet-category="${esc(p.category)}" data-facet-subcategory="${esc(p.subcategory || '')}" data-facet-status="${esc(p.cipStatus)}" data-facet-year="${yearsOf(p).join('|')}" ` +
  `data-facet-size="${sizeOf(p.costEstimate)}" data-facet-gap="${p.additionalFundsNeeded > 0 ? 'gap' : ''}" data-cost="${p.costEstimate}" data-prior="${p.priorApprovals}" data-total="${p.totalFunding}" data-needed="${p.additionalFundsNeeded}" data-programmed="${COLS.reduce((n, c) => n + p.byYear[c.key], 0)}" ` +
  `data-category="${esc(p.category)}" data-subcategory="${esc(p.subcategory || '')}" data-page="${p.page}" ` + COLS.map((c) => `data-y${c.key}="${p.byYear[c.key]}"`).join(' ');
const fig = (label, v) => `<div><dt>${esc(label)}</dt><dd>${money(v)}</dd></div>`;
const pick = (p) => `<span class="mm-card__select"><label class="visually-hidden" for="pick-${slugOf(p['@id'])}">Select: ${esc(p.name)}</label><input type="checkbox" id="pick-${slugOf(p['@id'])}" data-select="${slugOf(p['@id'])}"></span>`;
const pill = (facet, value, label) => `<span class="mm-term">${esc(label)}</span>`;
const projCard = (p, i) => `<li class="app-card mm-card" ${attrs(p, i)}>${pick(p)}<div class="mm-card__body">` +
  `<h3 class="mm-card__title"><a href="./projects/${slugOf(p['@id'])}.html">${esc(p.name)}</a></h3>` +
  `<dl class="capital-figures">${fig('Cost estimate', p.costEstimate)}${fig(COLS[0].head, p.byYear[COLS[0].key])}${fig('Funding in the plan', p.totalFunding)}${p.additionalFundsNeeded ? fig('Additional funds needed', p.additionalFundsNeeded) : ''}</dl>` +
  `<div class="mm-terms">${pill('category', p.category, p.category)}${p.subcategory ? pill('subcategory', p.subcategory, p.subcategory) : ''}${pill('status', p.cipStatus, p.cipStatus)}</div></div></li>`;
const projRow = (p, i) => `<tr ${attrs(p, i)}><td class="mm-card__select"><label class="visually-hidden" for="pick-row-${slugOf(p['@id'])}">Select: ${esc(p.name)}</label><input type="checkbox" id="pick-row-${slugOf(p['@id'])}" data-select="${slugOf(p['@id'])}"></td><th scope="row"><a href="./projects/${slugOf(p['@id'])}.html">${esc(p.name)}</a></th><td>${esc(catLabel(p))}</td><td>${esc(p.cipStatus)}</td>` +
  `${num(p.costEstimate, money(p.costEstimate))}${num(p.priorApprovals, money(p.priorApprovals))}${COLS.map((c) => num(p.byYear[c.key], money(p.byYear[c.key]))).join('')}${num(p.additionalFundsNeeded, money(p.additionalFundsNeeded))}</tr>`;
const projectsCsv = [['Category', 'Subcategory', 'Project', 'Status', 'Cost estimate', 'Prior approvals', ...COLS.map((c) => c.head), 'Total funding', 'Additional funds needed', 'Book page'],
  ...display.projects.map((p) => [p.category, p.subcategory || '', p.name, p.cipStatus, p.costEstimate, p.priorApprovals, ...COLS.map((c) => p.byYear[c.key]), p.totalFunding, p.additionalFundsNeeded, p.page])];
const pagesUsed = new Set(display.projects.map((p) => p.page));

// Facets: [name, legend, "all" words, [[value, label]]]. A count is the number of projects with the value.
const count = (name, value) => display.projects.filter((p) => ({ category: [p.category], subcategory: [p.subcategory || ''], status: [p.cipStatus], year: yearsOf(p), size: [sizeOf(p.costEstimate)], gap: [p.additionalFundsNeeded > 0 ? 'gap' : ''] }[name]).includes(value)).length;
const uniq = (f) => [...new Set(display.projects.map(f).filter(Boolean))];
const FACETS = [
  ['category', 'Categories', 'All categories', uniq((p) => p.category).map((v) => [v, v])],
  ['subcategory', 'Subcategories', 'All subcategories', uniq((p) => p.subcategory).map((v) => [v, v])],
  ['status', 'Statuses', 'All statuses', [['New', 'New'], ['Ongoing', 'Ongoing']]],
  ['year', 'Funded years', 'All years', COLS.map((c) => ['fy' + c.key, c.head])],
  ['size', 'Cost estimates', 'All cost estimates', SIZES],
  ['gap', 'Funding gaps', 'All projects', [['gap', 'Needs additional funds']]],
];
const facetHtml = ([name, legend, all, values]) => `<fieldset class="search-facet-group" id="facet-${name}" data-all="${esc(all)}"><legend>${legend}</legend><details class="mm-facet-group"><summary>${esc(all)}</summary><ul class="search-facet-list">` +
  values.map(([v, l]) => `<li><label><input type="checkbox" data-facet-filter="${name}" value="${esc(v)}"> ${esc(l)} <span class="search-facet-count">(${count(name, v)})</span></label></li>`).join('') + '</ul></details></fieldset>';

// The selection's numbers. The page's script recomputes these from the projects still showing.
const programmedOf = (p) => COLS.reduce((n, c) => n + p.byYear[c.key], 0);
const totalsOf = (list) => ({ programmed: list.reduce((s, p) => s + programmedOf(p), 0), n: list.length, cost: list.reduce((s, p) => s + p.costEstimate, 0), prior: list.reduce((s, p) => s + p.priorApprovals, 0), total: list.reduce((s, p) => s + p.totalFunding, 0), needed: list.reduce((s, p) => s + p.additionalFundsNeeded, 0) });
const T = totalsOf(display.projects);
const withStat = (html, name) => html.replace('class="mm-stats-kpi__value"', `class="mm-stats-kpi__value" data-stat="${name}"`);
const statsKpis = `<div class="mm-stats-kpis" id="selection-kpis">${withStat(kpi(`Programmed, FY ${YEARS[0]} to ${YEARS[YEARS.length - 1]}`, millions(T.programmed)), 'programmed')}${withStat(kpi('Projects', String(T.n)), 'n')}` +
  `${withStat(kpi('Cost estimate', millions(T.cost)), 'cost')}${withStat(kpi('Additional funds needed', millions(T.needed)), 'needed')}</div>`;
const chartCard = (id, title) => `<div class="chart-block">${chartActions('capital-' + id)}<section class="app-card" data-chart-card="${id}"><h3>${esc(title)}</h3><div class="capital-chart"><canvas role="img" aria-label="${esc(title)}" hidden></canvas></div></section></div>`;
const statsCharts = `<div class="mm-stats-grid" id="selection-charts" data-chart-lib="../vendor/chart.min.js">${chartCard('years', 'Funding by year')}${chartCard('categories', 'Cost estimate by category')}${chartCard('status', 'Projects by status')}</div>`;
const yearRows = COLS.map((c) => `<tr data-year="${c.key}"><th scope="row">${esc(c.head)}</th>${num(display.projects.reduce((s, p) => s + p.byYear[c.key], 0), money(display.projects.reduce((s, p) => s + p.byYear[c.key], 0)))}</tr>`).join('');
const catList = uniq((p) => p.category);
const catRows = catList.map((c) => { const t = totalsOf(display.projects.filter((p) => p.category === c)); return `<tr data-category="${esc(c)}"><th scope="row">${esc(c)}</th><td class="budget-table__num">${t.n}</td>${num(t.cost, money(t.cost))}${num(t.programmed, money(t.programmed))}</tr>`; }).join('');
const statsMismatches = (() => {
  const g = [];
  for (const p of display.projects) { let x = g.find((y) => y.category === p.category && y.sub === p.subcategory); if (!x) g.push((x = { category: p.category, sub: p.subcategory, items: [] })); x.items.push(p); }
  return g.filter((x) => { const t = subTotal(x.category, x.sub); return t && COLS.some((c) => x.items.reduce((n, p) => n + p.byYear[c.key], 0) !== t.byYear[c.key]); }).map((x) => x.sub || x.category);
})();
const mismatchNote = '';
const stats = `<section class="section capital-stats" id="project-stats" aria-label="Stats" hidden>${statsKpis}${mismatchNote}${statsCharts}` +
  `<div class="capital-stats__tables"><div class="table-scroll" role="region" tabindex="0" aria-label="Funding by year for the selection"><table class="budget-table"><caption>Funding by year, for the selection</caption><thead><tr><th scope="col">Year</th><th scope="col" class="budget-table__num">Funding</th></tr></thead><tbody id="selection-years">${yearRows}</tbody></table></div>` +
  `<div class="table-scroll" role="region" tabindex="0" aria-label="Categories in the selection"><table class="budget-table"><caption>Categories, for the selection</caption><thead><tr><th scope="col">Category</th><th scope="col" class="budget-table__num">Projects</th><th scope="col" class="budget-table__num">Cost estimate</th><th scope="col" class="budget-table__num">Programmed</th></tr></thead><tbody id="selection-categories">${catRows}</tbody></table></div></div></section>`;

// Where the listed projects and the book's printed subtotals differ, in plain view.
const groups = [];
for (const p of display.projects) {
  let g = groups.find((x) => x.category === p.category && x.sub === p.subcategory);
  if (!g) groups.push((g = { category: p.category, sub: p.subcategory, items: [] }));
  g.items.push(p);
}
const checkRows = groups.map((g) => {
  const printed = subTotal(g.category, g.sub);
  if (!printed) return '';
  const listed = g.items.reduce((n, p) => n + p.totalFunding - p.priorApprovals, 0);
  const diff = listed - printed.total;
  return `<tr><th scope="row">${esc(g.sub || g.category)}</th><td class="budget-table__num">${g.items.length}</td>${num(listed, money(listed))}${num(printed.total, money(printed.total))}${num(diff, diff ? signed(diff) : money(0))}</tr>`;
}).join('');
const mismatches = groups.filter((g) => { const t = subTotal(g.category, g.sub); return t && COLS.some((c) => g.items.reduce((n, p) => n + p.byYear[c.key], 0) !== t.byYear[c.key]); }).map((g) => g.sub || g.category);
// Where the projects add up differently from the totals the book prints, said with the figures.
const listedYears = COLS.map((c) => display.projects.reduce((n, p) => n + p.byYear[c.key], 0));
const listedTotal = listedYears.reduce((n, v) => n + v, 0);
const yearDiffs = COLS.map((c, i) => [c.short, listedYears[i] - ALL.byYear[c.key]]).filter(([, v]) => v);
const totalsNote = yearDiffs.length
  ? `The Stats and Projects tabs add up the projects listed; the Capital plan page shows the totals the book prints. Over the five years the projects add up to ${money(listedTotal)} and the book prints ${money(ALL.total)}. By year the projects differ from the book by ${yearDiffs.map(([y, v]) => `${signed(v)} in ${y}`).join(', ')}.`
  : '';
const notesTab = (NOTES.length ? `<ul>${NOTES.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '') +
  `<p>${mismatches.length ? `The projects listed under ${esc(mismatches.join(' and '))} do not add up to the totals the book prints for the same years. The projects are shown as the book lists them.` : 'The projects listed add up to the totals the book prints.'}</p>` +
  (totalsNote ? `<p>${esc(totalsNote)}</p>` : '') +
  table('Projects listed against the book, FY27 to FY31', ['Subcategory', 'Projects', 'Listed', 'Printed in the book', 'Difference'], [checkRows]);

const ico = (d) => `<svg class="copy-icon" aria-hidden="true" viewBox="0 0 24 24">${d}</svg>`;
const ICONS = {
  book: ico('<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>'),
  cost: ico('<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M11 4h10"/><path d="M11 8h7"/><path d="M11 12h4"/>'),
  name: ico('<path d="m3 16 4 4 4-4"/><path d="M7 4v16"/><path d="M15 4h5l-5 6h5"/><path d="M15 20v-3.5a2.5 2.5 0 0 1 5 0V20"/><path d="M20 18h-5"/>'),
  table: ico('<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>'),
  cards: ico('<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>'),
  reset: ico('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
};
const tbtn = (attr, value, label, icon, pressed) => `<button type="button" class="action-button" ${attr}="${value}" aria-pressed="${pressed}" aria-label="${label}" title="${label}">${icon}</button>`;
const toolbar = `<div class="action-toolbar"><div class="action-group" role="group" aria-label="Sort" id="sort-group">${tbtn('data-sort', 'book', 'Book order', ICONS.book, 'true')}${tbtn('data-sort', 'cost', 'Cost estimate, high to low', ICONS.cost, 'false')}${tbtn('data-sort', 'name', 'Name, A to Z', ICONS.name, 'false')}</div>` +
  `<div class="action-group" role="group" aria-label="View" id="view-group">${tbtn('data-view', 'cards', 'Cards', ICONS.cards, 'true')}${tbtn('data-view', 'table', 'Table', ICONS.table, 'false')}</div>` +
  `<div class="action-group" role="group" aria-label="Chart actions" id="chart-actions" hidden><button type="button" class="action-button" id="copy-charts-button" data-icon="copy" aria-label="Copy charts" title="Copy charts"></button><button type="button" class="action-button" id="download-all-png-button" data-icon="download" aria-label="Download all charts as PNG" title="Download all charts as PNG"></button></div>` +
  `${actions('capital-projects', '#project-cards', true, [{ id: 'table', label: 'projects' }], null, true)}</div>`;
const filterPanel = `<div class="search-side"><button type="button" id="filter-toggle" class="filter-toggle" data-filter-toggle="capital" aria-controls="filter-panel"></button>` +
  `<aside id="filter-panel" class="search-sidebar" aria-labelledby="filter-panel-title" data-open="false"><div class="search-panel-header"><h2 class="search-panel-title" id="filter-panel-title">Filter</h2>` +
  `<button type="button" class="action-button" id="reset-filters-button" aria-label="Reset filters" title="Reset filters">${ICONS.reset}</button></div>` +
  `<div class="search-input-field"><label for="project-search">Search</label><input type="search" id="project-search" placeholder="Search projects&hellip;" autocomplete="off"></div>${FACETS.map(facetHtml).join('')}</aside></div>`;
const tabRow = `<div id="content-tab-row" class="tab-list"><div role="tablist" aria-label="Projects" id="content-tabs"><button type="button" role="tab" aria-selected="true" id="projects-tab" aria-controls="project-list" class="tab-button">Projects</button></div>` +
  `<!-- Not inside the tablist: Stats is a view toggle, as in Marin Mentions. --><button type="button" id="stats-toggle" class="tab-button" aria-pressed="false" aria-controls="project-stats">Stats</button><button type="button" id="data-toggle" class="tab-button" aria-pressed="false" aria-controls="project-data">Data</button><button type="button" id="notes-toggle" class="tab-button" aria-pressed="false" aria-controls="project-notes">Notes</button></div>`;
const results = `<div class="search-results">${tabRow}<div class="mm-results-summary"><p class="app-help-text" id="active-filters" aria-live="polite">Showing: ${display.projects.length} projects</p></div>${toolbar}` +
  `<div id="project-list"><p class="app-empty" id="project-empty" hidden>No projects match.</p><div class="mm-select-all" id="select-all-field"><label><input type="checkbox" id="select-all-checkbox"> Select all</label><span class="app-help-text" id="selection-count" role="status" aria-live="polite"></span></div>` +
  `<ul class="search-results-list" id="project-cards" aria-label="Projects">${display.projects.map(projCard).join('')}</ul>` +
  `<div id="project-table-wrap" hidden><div class="table-scroll" role="region" tabindex="0" aria-label="Projects"><table class="budget-table" id="project-table"><caption>Projects</caption><thead><tr><th scope="col"><span class="visually-hidden">Select</span></th>${HEAD.map((h, i) => `<th scope="col"${i > 2 ? ' class="budget-table__num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${display.projects.map(projRow).join('')}</tbody></table></div></div></div>${stats}<div id="project-export" class="visually-hidden" aria-hidden="true"></div><div id="project-data" aria-label="Data" hidden>${sourceList(pagesUsed, './')}</div><div id="project-notes" aria-label="Notes" hidden>${notesTab}</div></div>`;
const projectsPage = shell('Capital projects', 'Every project in the County of Marin FY 2027-31 Capital Improvement Plan, with filters and totals for what is selected.', [['Marin Docs', '../index.html'], ['Capital plan', './index.html'], ['Projects', null]],
  `<h1 class="doc-title">Projects</h1><div class="search-layout" id="projects-tool">${filterPanel}${results}</div>` +
  jsonBlock(projects, '../organization/page-data.js', [{ id: 'table', rows: projectsCsv }]) + `<script src="../search/shared/search-layout.js?v=${stamp('search/shared/search-layout.js')}"></script><script src="projects.js?v=${stamp('capital/projects.js')}"></script>`);

// ---- The Capital page ---------------------------------------------------------------------------------------------
const years = COLS.map((c) => c.key);
const groupRows = GROUPS.map((g) => ({ g, t: groupTotal(g) })).filter((x) => x.t).sort((a, b) => b.t.total - a.t.total);
const fundRows = expenses.filter((e) => e.total).sort((a, b) => b.total - a.total);
const revByLabel = new Map(revenues.map((r) => [r.label, r]));
const csvCats = [['Category', ...COLS.map((c) => c.head), 'Total', 'Additional funds needed'], ...groupRows.map(({ g, t }) => [g, ...years.map((y) => t.byYear[y]), t.total, t.additionalFundsNeeded])];
const csvFunds = [['Fund source', ...COLS.map((c) => `Expenses ${c.short}`), 'Expenses total', 'Revenues total'], ...fundRows.map((s) => [s.label, ...years.map((y) => s.byYear[y]), s.total, (revByLabel.get(s.label) || {}).total ?? ''])];
const top = groupRows[0];
const card = (href, title, text) => `<article class="app-card"><span class="app-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24">${ICON}</svg></span><h3><a href="${href}">${title}</a></h3><p>${text}</p></article>`;
const projectsCard = `<section class="docs-grid" aria-label="Capital plan">${card('./projects.html', 'Projects', `${display.projects.length} projects`)}</section>`;
const overview = `<div class="mm-stats-kpis">${kpi('Programmed, FY 2026-27 to 2030-31', millions(ALL.total))}${kpi('Projects', String(display.projects.length))}${kpi('Estimated available funding', millions(revenues.reduce((n, r) => n + r.total, 0)))}${kpi('Additional funds needed', millions(ALL.additionalFundsNeeded))}</div>${projectsCard}` +
  `<section class="section" aria-labelledby="categories"><h2 id="categories">Categories</h2>` +
  charts(chart('chart-categories', 'Planned spending by category and year', 'bars', { labels: COLS.map((c) => c.short), series: groupRows.map(({ g, t }) => ({ name: g, values: years.map((y) => t.byYear[y]) })),
    summary: `${top.g} is the largest category at ${bd.millions(top.t.total)} of ${bd.millions(ALL.total)} over five years.` }, true)) +
  table('Planned spending by category', ['Category', ...COLS.map((c) => c.head), 'Total', 'Additional funds needed'], [
    ...groupRows.map(({ g, t }) => `<tr><th scope="row"><a href="./projects.html?category=${encodeURIComponent(g)}">${esc(g)}</a></th>${years.map((y) => num(t.byYear[y], money(t.byYear[y]))).join('')}${num(t.total, money(t.total))}${num(t.additionalFundsNeeded, money(t.additionalFundsNeeded))}</tr>`)],
  `<tfoot><tr><th scope="row">All categories</th>${years.map((y) => num(ALL.byYear[y], money(ALL.byYear[y]))).join('')}${num(ALL.total, money(ALL.total))}${num(ALL.additionalFundsNeeded, money(ALL.additionalFundsNeeded))}</tr></tfoot>`) +
  `<p><a href="./projects.html">All ${display.projects.length} projects</a></p></section>` +
  `<section class="section" aria-labelledby="fund-sources"><h2 id="fund-sources">Fund sources</h2>` +
  charts(chart('chart-sources', 'Planned spending by fund source, five years', 'bars', { labels: fundRows.map((s) => s.label), series: [{ name: 'Five-year total', values: fundRows.map((s) => s.total) }],
    summary: `${fundRows[0].label} is the largest source at ${bd.millions(fundRows[0].total)}.` })) +
  table('Revenues and expenses by fund source, five years', ['Fund source', 'Revenues', 'Expenses'], fundRows.map((s) => `<tr><th scope="row">${esc(s.label)}</th>${num((revByLabel.get(s.label) || {}).total, money((revByLabel.get(s.label) || {}).total))}${num(s.total, money(s.total))}</tr>`),
    `<tfoot><tr><th scope="row">Total</th>${num(revenues.reduce((n, r) => n + r.total, 0), money(revenues.reduce((n, r) => n + r.total, 0)))}${num(expenses.reduce((n, r) => n + r.total, 0), money(expenses.reduce((n, r) => n + r.total, 0)))}</tr></tfoot>`) + '</section>';
const indexPage = shell('Capital plan', 'The County of Marin Capital Improvement Plan: projects, categories and fund sources.', [['Marin Docs', '../index.html'], ['Capital plan', null]],
  `<section class="hero"><h1>Capital plan</h1><p class="lede">The County of Marin Capital Improvement Plan for FY ${YEARS[0]} to ${YEARS[YEARS.length - 1]}.</p>${actions('capital', '#main', true, [{ id: 'categories', label: 'categories', rows: csvCats }, { id: 'funds', label: 'fund sources', rows: csvFunds }])}</section>` +
  overview + sourceSection([19, 21], './', `${NOTE}${sourceInfo.cipBook.statedProjectCount && sourceInfo.cipBook.statedProjectCount !== display.projects.length ? ` The book's text says ${sourceInfo.cipBook.statedProjectCount} projects; its tables list ${display.projects.length}.` : ''}`) +
  jsonBlock(projects, '../organization/page-data.js', [{ id: 'categories', rows: csvCats }, { id: 'funds', rows: csvFunds }]));

fs.writeFileSync(path.join(OUT, 'index.html'), indexPage);
fs.writeFileSync(path.join(OUT, 'projects.html'), projectsPage);
console.log(`Wrote capital/index.html, capital/projects.html and ${projects.length} project pages.`);

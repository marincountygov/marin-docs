// Reads the budget lines (schemaGov JSON-LD) and builds the tables shown on the Budget pages and on
// a department's Budget tab. Used by build-organization.js. The Budget pages are in marin-budget.
//
// The figures are whole dollars exactly as the budget book prints them. Revenues are positive.
// Net County cost, change columns and FTE are the book's own printed values (source/budget-display.json),
// because schemaGov has no property for them.

const fs = require('fs');
const { actions, chartActions } = require('./page-actions');
const path = require('path');

// The budget data is read from marin-data (next to this repository). The Budget pages themselves are in Marin Budget.
let DIR = process.env.MARIN_DATA_OUTPUT || path.join(__dirname, '..', '..', 'marin-data', 'output');
const FILES = ['budgets.jsonld', 'budget-lines.jsonld', path.join('source', 'budget-display.json')];
const BUDGET_SITE = 'https://marincountygov.github.io/marin-budget/';
const BUDGET_LINES_URL = BUDGET_SITE + 'budget/data/budget-lines.jsonld';

const bd_fte = (v) => v.toFixed(2);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Read from another folder of marin-data output instead of the default.
const useData = (dir) => { DIR = path.resolve(dir); };
const dataDir = () => DIR;

// The column headings are the book's own. The final edition still prints FY 2026-27 as "Proposed".
const YEARS = [
  { key: 'fy2024-25-executed', label: 'FY 2024-25 Actuals' },
  { key: 'fy2025-26-approved', label: 'FY 2025-26 Approved' },
  { key: 'fy2026-27-approved', label: 'FY 2026-27 Proposed' },
];
const LATEST = YEARS[2].key;
const PREVIOUS = YEARS[1].key;

function load() {
  if (!FILES.every((f) => fs.existsSync(path.join(DIR, f)))) return null;
  const graph = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))['@graph'];
  const lines = graph('budget-lines.jsonld');
  const display = JSON.parse(fs.readFileSync(path.join(DIR, 'source', 'budget-display.json'), 'utf8'));
  // The book's own "Description of budget changes" for each department (marin-data extract_budget_changes.py), when it has been read.
  const changesFile = path.join(DIR, 'source', 'budget-changes.json');
  const changes = fs.existsSync(changesFile) ? JSON.parse(fs.readFileSync(changesFile, 'utf8')) : {};
  const byId = new Map(lines.map((l) => [l['@id'], l]));
  // budget key -> organization id -> tail of the line id -> line
  const idx = new Map();
  for (const l of lines) {
    const m = l['@id'].match(/budget-line\/([^/]+)\/([^/]+)\/(.+)$/);
    const org = l.administrativeClassification && l.administrativeClassification['@id'];
    if (!org) continue;
    const b = idx.get(m[1]) || idx.set(m[1], new Map()).get(m[1]);
    const o = b.get(org) || b.set(org, new Map()).get(org);
    o.set(m[3], l);
  }
  // program id -> its lines (the Program Overview rows that are that program)
  const byProgram = new Map();
  for (const l of lines) if (l.program) (byProgram.get(l.program['@id']) || byProgram.set(l.program['@id'], []).get(l.program['@id'])).push(l);
  const fundFile = path.join(DIR, 'funds.jsonld');
  const funds = fs.existsSync(fundFile) ? graph('funds.jsonld') : [];
  return { lines, byId, idx, byProgram, funds, fundById: new Map(funds.map((f) => [f['@id'], f])), display, changes, book: display.url, bookTitle: display.book };
}

// The lines an organization has, with the lines they are made of, for the JSON on its page.
function linesFor(data, orgId) {
  if (!data) return [];
  const out = new Map();
  for (const l of data.lines) {
    if (!l.administrativeClassification || l.administrativeClassification['@id'] !== orgId) continue;
    out.set(l['@id'], l);
    for (const p of l.hasPart || []) out.set(p['@id'], data.byId.get(p['@id']));
  }
  return [...out.values()];
}

const money = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US');
const inMillions = (n) => '$' + (n / 1e6).toFixed(1) + ' million';
const millions = (n) => '$' + (n / 1e6).toFixed(1) + 'M';
const change = (a, b) => (a == null || b == null ? null : b - a);
const signed = (n) => (n == null ? '' : n > 0 ? '+' + money(n) : money(n));
const num = (v, text) => `<td class="budget-table__num">${v == null ? '<span aria-label="No figure">–</span>' : text}</td>`;
const fteText = (v) => (v == null ? '' : v.toFixed(2));
const pagesText = (data, list) => (list.length === 1 ? 'page ' : 'pages ') + list.map((p) => pageLink(data, p, true)).join(', ');
const pageLink = (data, page, bare) => (data.book ? `<a href="${esc(data.book)}#page=${page + 2}">${bare ? '' : 'page '}${page}</a>` : `${bare ? '' : 'page '}${page}`);

// The text of one table cell, as a figure where it is one: "$1,234" is 1234, "−$5" is -5, "No figure" is empty.
const cellText = (html) => {
  if (/aria-label="No figure"/.test(html)) return '';
  const t = html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(−)?\$([\d,]+(?:\.\d+)?)$/);
  return m ? (m[1] ? -1 : 1) * Number(m[2].replace(/,/g, '')) : t;
};
const tableRows = (head, bodyRows, foot) => [head, ...[...bodyRows, ...(foot ? [foot] : [])].flatMap((h) => [...h.matchAll(/<tr\b[^>]*>(.*?)<\/tr>/gs)].map((r) => [...r[1].matchAll(/<t[hd]\b([^>]*)>(.*?)<\/t[hd]>/gs)].flatMap((c) => [cellText(c[2]), ...Array(Number((c[1].match(/colspan="(\d+)"/) || [0, 1])[1]) - 1).fill('')])))];
const tableId = (caption, body) => {
  let h = 5381;
  for (const c of body) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return caption.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) + '-' + h.toString(36).slice(0, 4);
};
// Every table has its own Copy and Download buttons, scoped to the table: Copy as text, HTML or Markdown; Download as the same, or a CSV.
// The CSV is read from the table, so it always matches what is on the page.
const table = (caption, head, bodyRows, foot = '') => {
  const markup = `<table class="budget-table"><caption>${esc(caption)}</caption>` +
    `<thead><tr>${head.map((h, i) => `<th scope="col"${i ? ' class="budget-table__num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${bodyRows.join('')}</tbody>${foot}</table>`;
  const id = tableId(caption, markup);
  return `<div class="table-block" id="${id}">${actions(id, `#${id} .table-scroll`, false, [{ id, file: id.replace(/-[a-z0-9]{1,4}$/, '') }], null, false)}` +
    `<div class="table-scroll" role="region" tabindex="0" aria-label="${esc(caption)}">${markup}</div>` +
    `<script type="application/json" id="csv-${id}">${JSON.stringify(tableRows(head, bodyRows, foot)).replace(/</g, '\\u003c')}</script></div>`;
};

// A chart of amounts the page holds: the figures sit in the page, so the chart and the table beside it agree.
// The shell draws it (data-chart, data-inline; marin-ui docs/components.md, "Charts").
// `spec.summary` is the sentence a screen reader hears after the title, written from the same figures.
// A single series of bars is drawn largest first.
// Service areas, departments and other bodies run A to Z, so their charts keep the order they are given (`keepOrder`).
const byName = (a, b) => String(a).localeCompare(String(b), 'en', { sensitivity: 'base', numeric: true });
const sortedBars = (kind, spec) => {
  if (kind !== 'bars' || spec.series.length !== 1 || spec.keepOrder) return spec;
  const order = spec.labels.map((_, i) => i).sort((a, b) => (spec.series[0].values[b] || 0) - (spec.series[0].values[a] || 0));
  return { ...spec, labels: order.map((i) => spec.labels[i]), series: [{ ...spec.series[0], values: order.map((i) => spec.series[0].values[i]) }] };
};
const chart = (id, title, kind, rawSpec, stacked = false, lib = '../vendor/chart.min.js') => { const { keepOrder, ...spec } = sortedBars(kind, rawSpec); return (
  `<div class="chart-block">${chartActions(id)}` +
  `<script type="application/json" id="${id}-data">${JSON.stringify({ format: 'currency', ...spec }).replace(/</g, '\\u003c')}</script>` +
  `<div data-chart data-inline="${id}-data" data-chart-lib="${lib}" data-chart-title="${esc(title)}" data-kind="${kind}"${stacked ? ' data-stacked' : ''}></div></div>`); };
const charts = (...items) => `<div class="mm-stats-grid">${items.join('')}</div>`;

const kpi = (label, value) => `<div class="mm-stats-kpi"><p class="app-help-text">${esc(label)}</p><p class="mm-stats-kpi__value">${esc(value)}</p></div>`;

// The lines for one organization in one budget, by kind.
function figures(data, orgId, bkey) {
  const o = (data.idx.get(bkey) || new Map()).get(orgId);
  if (!o) return null;
  const parts = (tail) => {
    const total = o.get(tail);
    return total ? (total.hasPart || []).map((p) => data.byId.get(p['@id'])).filter(Boolean) : [];
  };
  const expTotal = o.get('expenditure-total-department-page') || o.get('expenditure-total');
  const revTotal = o.get('revenue-total');
  return {
    expTotal, revTotal,
    row: o.get('expenditure-total'), // the service-area table row, when there is one
    expTypes: expTotal ? (expTotal.hasPart || []).map((p) => data.byId.get(p['@id'])).filter(Boolean) : [],
    revTypes: revTotal ? parts('revenue-total') : [],
  };
}
// FTE as the book prints it for this body. A department with no row of its own (Health and Human Services,
// whose rows are its divisions) takes its service area's figure when the two spend the same amount.
function fteFor(data, org, parent) {
  const disp = (data.display.organizations || {});
  if (disp[org['@id']] && disp[org['@id']].sa) return disp[org['@id']].sa.fte_fy2026_27;
  const mine = figures(data, org['@id'], LATEST);
  const theirs = parent && figures(data, parent['@id'], LATEST);
  const area = parent && disp[parent['@id']] && disp[parent['@id']].sa;
  return mine && theirs && area && val(mine.expTotal) === val(theirs.expTotal) ? area.fte_fy2026_27 : null;
}
const label = (line) => line.name.split(': ')[0];
const val = (line) => (line ? line.amount.value : null);

// Where a department's money goes by type, FY 2026-27: the first chart on its Dashboard.
function organizationTypeChart(data, org) {
  if (!data) return '';
  const now = figures(data, org['@id'], LATEST);
  if (!now || !now.expTypes.length) return '';
  const names = now.expTypes.map(label);
  const values = now.expTypes.map((l) => val(l) || 0);
  const top = values.indexOf(Math.max(...values));
  return charts(chart('dash-chart-types', 'Expenditures by type, FY 2026-27', 'bars', { labels: names, series: [{ name: 'FY 2026-27 Proposed', values }],
    summary: `${names[top]} is the largest type at ${inMillions(values[top])} in FY 2026-27.` }));
}

// The four key numbers, on their own, for a department's Dashboard.
function organizationKpis(data, org, parent) {
  if (!data) return '';
  const now = figures(data, org['@id'], LATEST);
  if (!now || !now.expTotal) return '';
  const disp = (data.display.organizations || {})[org['@id']] || {};
  const ncc = (disp.department || {})['Net County Cost'];
  const fte = fteFor(data, org, parent);
  const k = [kpi('Expenditures, FY 2026-27', millions(val(now.expTotal)))];
  if (now.revTotal) k.push(kpi('Revenues, FY 2026-27', millions(val(now.revTotal))));
  if (ncc) k.push(kpi('Net County cost, FY 2026-27', millions(ncc.fy2026_27)));
  if (fte != null) k.push(kpi('Full-time equivalent staff', bd_fte(fte)));
  return `<div class="mm-stats-kpis">${k.join('')}</div>`;
}

// The rows of a department's budget tables, for its CSV: by type, and by division when it has them.
function organizationCsvs(data, org, children) {
  if (!data) return [];
  const out = [];
  const now = figures(data, org['@id'], LATEST);
  const before = figures(data, org['@id'], PREVIOUS);
  const disp = (data.display.organizations || {})[org['@id']] || {};
  const ncc = (disp.department || {})['Net County Cost'];
  if (now && now.expTypes.length) {
    const rows = [['Section', 'Line', YEARS[1].label, YEARS[2].label, 'Change']];
    const add = (section, name, a, b) => rows.push([section, name, a, b, b - a]);
    const lines = (f, kind) => (f ? f[kind] : []);
    for (const [section, kind, total, totalLabel] of [['Revenues', 'revTypes', 'revTotal', 'Total revenues'], ['Expenditures', 'expTypes', 'expTotal', 'Total expenditures']]) {
      if (!now[total]) continue;
      for (const n of [...new Set([...lines(before, kind), ...lines(now, kind)].map(label))]) {
        const find = (f) => val(lines(f, kind).find((l) => label(l) === n)) || 0;
        add(section, n, find(before), find(now));
      }
      add(section, totalLabel, val(before && before[total]) || 0, val(now[total]));
    }
    if (ncc) add('Net County cost', 'Net County cost', ncc.fy2025_26, ncc.fy2026_27);
    out.push({ id: 'budget', label: 'budget by type', rows });
  }
  const childRows = children.map((c) => ({ c, f: figures(data, c['@id'], LATEST) })).filter((x) => x.f && x.f.row);
  if (childRows.length) {
    out.push({ id: 'divisions', label: 'budget by division', rows: [['Division', ...YEARS.map((y) => y.label)], ...childRows.map(({ c }) => [c.name, ...YEARS.map((y) => val((figures(data, c['@id'], y.key) || {}).row))])] });
  } else if (now && now.row && figures(data, org['@id'], YEARS[0].key)) {
    out.push({ id: 'years', label: 'expenditures over three years', rows: [['', ...YEARS.map((y) => y.label)], ['Expenditures', ...YEARS.map((y) => val((figures(data, org['@id'], y.key) || {}).row))]] });
  }
  return out;
}


// ---- Programs: the Program Overview rows that are one program --------------------------------------
// A row is a book program label in one fund group. Amounts are by year: expenditures and revenues from the lines,
// net County cost from the book's own printed column (source/budget-display.json).
const KEYS = { fy2025_26: 'fy2025-26-approved', fy2026_27: 'fy2026-27-approved' };
function programRows(data, programId) {
  if (!data) return [];
  const rows = new Map();
  for (const l of data.byProgram.get(programId) || []) {
    const key = `${l.programClassification}|${l.fundSource}`;
    const r = rows.get(key) || { label: l.programClassification, group: l.fundSource, fund: l.fund && l.fund['@id'], page: null, exp: {}, rev: {}, ncc: {} };
    const bkey = l.budget['@id'].split('/').pop();
    (l.direction === 'expenditure' ? r.exp : r.rev)[bkey] = l.amount.value;
    r.page = data.display.linePages[l['@id']];
    rows.set(key, r);
  }
  // Rows that have no line at all (both years zero) are not shown. Net County cost comes from the book's column.
  for (const d of data.display.programRows || []) {
    if (d.program !== programId) continue;
    const r = rows.get(`${d.label}|${d.fundGroup}`);
    if (r) r.ncc = { [KEYS.fy2025_26]: d.ncc_fy2025_26, [KEYS.fy2026_27]: d.ncc_fy2026_27 };
  }
  return [...rows.values()];
}
const sumBy = (rows, kind, bkey) => rows.reduce((n, r) => n + (r[kind][bkey] || 0), 0);

// A Source list: the book (with its pages) and each data file as an item, then any note under it.
function sourceList(data, pageNums, files, note, level = 3, id = 'budget-source') {
  const pages = [...pageNums].filter((p) => p != null).sort((a, b) => a - b);
  const items = [];
  if (pages.length) items.push(`${esc(data.bookTitle)}, ${pagesText(data, pages)}`);
  items.push(...files.map(([label, href]) => `<a href="${esc(href)}">${esc(label)}</a>`));
  const h = level === 2 ? 'h2' : 'h3';
  return `<${h} id="${id}">Source</${h}><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>${note ? `<p class="app-help-text">${note}</p>` : ''}`;
}

// A program's key numbers, for its Dashboard.
function programKpis(data, program) {
  const rows = programRows(data, program['@id']);
  if (!rows.length) return '';
  const b = KEYS.fy2026_27;
  const k = [kpi('Expenditures, FY 2026-27', money(sumBy(rows, 'exp', b)))];
  if (sumBy(rows, 'rev', b)) k.push(kpi('Revenues, FY 2026-27', money(sumBy(rows, 'rev', b))));
  k.push(kpi('Net County cost, FY 2026-27', money(sumBy(rows, 'ncc', b))));
  return `<div class="mm-stats-kpis">${k.join('')}</div>`;
}

// The rows of a program's fund-group table, for its CSV.
function programCsv(data, program) {
  const rows = programRows(data, program['@id']);
  if (!rows.length) return null;
  const [a, b] = [KEYS.fy2025_26, KEYS.fy2026_27];
  const get = (r, kind, y) => (r[kind][y] === undefined ? 0 : r[kind][y]);
  return [['Fund group', 'Expenditures FY 2025-26', 'Expenditures FY 2026-27', 'Revenues FY 2025-26', 'Revenues FY 2026-27', 'Net County cost FY 2025-26', 'Net County cost FY 2026-27'],
    ...rows.map((r) => [r.group, get(r, 'exp', a), get(r, 'exp', b), get(r, 'rev', a), get(r, 'rev', b), get(r, 'ncc', a), get(r, 'ncc', b)])];
}

// A program's Budget tab: totals, expenditures by fund group, and one row for each fund group.
function programBudget(data, program, name, fundHref) {
  const rows = programRows(data, program['@id']);
  if (!rows.length) return '';
  const [a, b] = [KEYS.fy2025_26, KEYS.fy2026_27];
  const pages = new Set(rows.map((r) => r.page).filter((p) => p != null));
  const k = [kpi('Expenditures, FY 2026-27', money(sumBy(rows, 'exp', b)))];
  if (sumBy(rows, 'rev', b)) k.push(kpi('Revenues, FY 2026-27', money(sumBy(rows, 'rev', b))));
  k.push(kpi('Net County cost, FY 2026-27', money(sumBy(rows, 'ncc', b))));
  const fmt = (v) => num(v === undefined ? 0 : v, money(v === undefined ? 0 : v));
  const body = rows.map((r) => `<tr><th scope="row">${r.fund && fundHref && fundHref(r.fund) ? `<a href="${fundHref(r.fund)}">${esc(r.group)}</a>` : esc(r.group)}</th>${fmt(r.exp[a])}${fmt(r.exp[b])}${fmt(r.rev[a])}${fmt(r.rev[b])}${fmt(r.ncc[a])}${fmt(r.ncc[b])}</tr>`);
  const total = `<tfoot><tr class="budget-table__total"><th scope="row">All fund groups</th>${['exp', 'rev', 'ncc'].flatMap((kind) => [a, b].map((y) => num(sumBy(rows, kind, y), money(sumBy(rows, kind, y))))).join('')}</tr></tfoot>`;
  const labels = [...new Set(rows.map((r) => r.label))].filter((l) => l.toLowerCase() !== name.toLowerCase());
  const chartHtml = chart('program-chart-groups', 'Expenditures by fund group', 'columns', {
    labels: rows.map((r) => r.group), series: [{ name: 'FY 2025-26 Approved', values: rows.map((r) => r.exp[a] || 0) }, { name: 'FY 2026-27 Proposed', values: rows.map((r) => r.exp[b] || 0) }],
    summary: `${rows.length === 1 ? rows[0].group : [...rows].sort((x, y) => (y.exp[b] || 0) - (x.exp[b] || 0))[0].group + ' is the largest fund group'} at ${inMillions(Math.max(...rows.map((r) => r.exp[b] || 0)))} in FY 2026-27.`,
  });
  return `<section class="section" id="budget" data-tab-section="budget" aria-labelledby="budget-heading" hidden><h2 id="budget-heading">Budget</h2><div class="mm-stats-kpis">${k.join('')}</div>` +
    `<h3 id="budget-by-fund">Fund groups</h3>${charts(chartHtml)}` +
    table('Budget by fund group', ['Fund group', 'Expenditures FY 2025-26', 'Expenditures FY 2026-27', 'Revenues FY 2025-26', 'Revenues FY 2026-27', 'Net County cost FY 2025-26', 'Net County cost FY 2026-27'], body, total) +
    sourceList(data, pages, [['Budget lines (JSON-LD)', BUDGET_LINES_URL]],
      `The budget book groups funds as General Fund, HHS Operations Fund and Other Funds; it does not list the funds inside Other Funds. ${labels.length ? `The book lists this program as ${labels.map((l) => `“${esc(l.toLowerCase().replace(/(^|[\\s(-])([a-z])/g, (m, a, b) => a + b.toUpperCase()))}”`).join(', ')}. ` : ''}Figures are whole dollars as printed; revenues are positive and net County cost is the book's own figure.`) +
    `</section>`;
}

// ---- A service area: its departments over three years -----------------------------------------------
function areaBudget(data, area, { orgById, orgHref }) {
  const totals = YEARS.map((y) => (data.idx.get(y.key).get(area['@id']) || new Map()).get('expenditure-total'));
  if (!totals[2]) return null;
  const pages = new Set(totals.map((t) => data.display.linePages[t['@id']]).filter((p) => p != null));
  const kids = (totals[2].hasPart || []).map((p) => data.byId.get(p['@id'])).sort((x, y) => byName(x.name, y.name));
  const series = [];
  const csvRows = [];
  const rows = kids.map((k) => {
    const o = k.administrativeClassification && orgById.get(k.administrativeClassification['@id']);
    const v = YEARS.map((y) => {
      const line = o ? (data.idx.get(y.key).get(o['@id']) || new Map()).get('expenditure-total') : data.lines.find((l) => l['@id'].endsWith(`/${y.key}/${k['@id'].split('/').slice(-2)[0]}/expenditure-total`));
      return val(line);
    });
    const d = (data.display.organizations || {})[o ? o['@id'] : k.name];
    csvRows.push([area.name, k.name, ...v, d ? d.sa.change_fy2026_27 : '', d ? d.sa.fte_fy2026_27 : '']);
    if (v.some((x) => x)) series.push({ name: o ? o.name : k.name, values: v.map((x) => x || 0) });
    const name = o ? `<a href="${orgHref(o)}">${esc(k.name)}</a>` : esc(k.name);
    return `<tr><th scope="row">${name}</th>${v.map((x) => num(x, money(x))).join('')}${num(d && d.sa.change_fy2026_27, d ? signed(d.sa.change_fy2026_27) : '')}${num(d && d.sa.fte_fy2026_27, d ? fteText(d.sa.fte_fy2026_27) : '')}</tr>`;
  });
  const ad = (data.display.organizations || {})[area['@id']];
  csvRows.push([area.name, 'Service area total', ...totals.map(val), ad ? ad.sa.change_fy2026_27 : '', ad ? ad.sa.fte_fy2026_27 : '']);
  const foot = `<tfoot><tr class="budget-table__total"><th scope="row">Service area total</th>${totals.map((t) => num(val(t), money(val(t)))).join('')}${num(ad && ad.sa.change_fy2026_27, ad ? signed(ad.sa.change_fy2026_27) : '')}${num(ad && ad.sa.fte_fy2026_27, ad ? fteText(ad.sa.fte_fy2026_27) : '')}</tr></tfoot>`;
  const top = [...series].sort((x, y) => y.values[2] - x.values[2])[0];
  return {
    totals, pages, csvRows, ad,
    chart: charts(chart(`chart-${slugOfId(area['@id'])}`, `Expenditures by department, FY 2026-27`, 'bars', { keepOrder: true, labels: series.map((one) => one.name), series: [{ name: 'FY 2026-27 Proposed', values: series.map((one) => one.values[2]) }],
      summary: `${top.name} is the largest share, ${Math.round((top.values[2] / val(totals[2])) * 100)}% of ${inMillions(val(totals[2]))} in FY 2026-27.` })),
    table: table(`Expenditures, ${area.name}`, ['', ...YEARS.map((y) => y.label), 'Change', 'FTE'], rows, foot),
  };
}
const slugOfId = (id) => id.split(/[/:]/).pop().replace(/^service-area-/, '');


// ---- The County as a whole: the Budget page's overview ---------------------------------------------
function countywideOverview(data, county) {
  const now = figures(data, county['@id'], LATEST);
  const before = figures(data, county['@id'], PREVIOUS);
  const cw = data.display.countywide;
  if (!now || !now.expTotal || !now.revTotal || !cw) return null;
  const e25 = val(before.expTotal), e26 = val(now.expTotal), r26 = val(now.revTotal);
  const gen = cw.generalAndHhsFunds['Total General/HHS Fund Uses'];
  const balance = cw.transfers['Use of Fund Balance'];
  const pct = (((e26 - e25) / e25) * 100).toFixed(1);
  const k = [kpi('Expenditures, FY 2026-27', millions(e26)), kpi('Revenues, FY 2026-27', millions(r26)),
    kpi('Change in expenditures', `${signed(e26 - e25).replace(/\$([\d,]+)/, (m, n) => '$' + (Number(n.replace(/,/g, '')) / 1e6).toFixed(1) + 'M')} (${pct}%)`),
    kpi('General Fund and HHS Operating Fund', millions(gen.fy2026_27)), kpi('Use of fund balance', millions(balance.fy2026_27))];
  const find = (f, kind, n) => val(f[kind].find((l) => label(l) === n)) || 0;
  const typeNames = (kind) => [...new Set([...before[kind], ...now[kind]].map(label))];
  const rows = [];
  const csv = [['Section', 'Line', YEARS[1].label, YEARS[2].label, 'Change']];
  const add = (section, name, a, b, total = false) => {
    rows.push(`<tr${total ? ' class="budget-table__total"' : ''}><th scope="row">${esc(name)}</th>${num(a, money(a))}${num(b, money(b))}${num(b - a, signed(b - a))}</tr>`);
    csv.push([section, name, a, b, b - a]);
  };
  for (const [section, kind, total, totalLabel] of [['Revenues', 'revTypes', 'revTotal', 'Total revenues'], ['Expenditures', 'expTypes', 'expTotal', 'Total expenditures']]) {
    rows.push(`<tr class="budget-table__group"><th scope="rowgroup" colspan="4">${section}</th></tr>`);
    for (const n of typeNames(kind)) add(section, n, find(before, kind, n), find(now, kind, n));
    add(section, totalLabel, val(before[total]), val(now[total]), true);
  }
  add('Fund balance', 'Use of fund balance', cw.transfers['Use of Fund Balance'].fy2025_26, balance.fy2026_27, true);
  // The two main operating funds together, as the book prints them.
  const gRows = ['Revenues', 'Prior Year Fund Balance', 'Net Transfers', 'Total General/HHS Fund Sources', 'Ongoing', 'One Time', 'Total General/HHS Fund Uses'];
  const gLabel = { 'Total General/HHS Fund Sources': 'Total sources', 'Total General/HHS Fund Uses': 'Total uses', 'Prior Year Fund Balance': 'Prior year fund balance', 'Net Transfers': 'Net transfers', 'One Time': 'One-time' };
  const gTable = table('General Fund and HHS Operating Fund', ['', YEARS[1].label, YEARS[2].label, 'Change'], gRows.map((r) => {
    const v = cw.generalAndHhsFunds[r];
    return `<tr${r.startsWith('Total') ? ' class="budget-table__total"' : ''}><th scope="row">${esc(gLabel[r] || r)}</th>${num(v.fy2025_26, money(v.fy2025_26))}${num(v.fy2026_27, money(v.fy2026_27))}${num(v.fy2026_27 - v.fy2025_26, signed(v.fy2026_27 - v.fy2025_26))}</tr>`;
  }));
  const pie = (id, title, kind, whole) => {
    const names = typeNames(kind);
    const values = names.map((n) => find(now, kind, n));
    const top = names[values.indexOf(Math.max(...values))];
    return chart(id, title, 'bars', { labels: names, series: [{ name: 'FY 2026-27 Proposed', values }], summary: `${top} is the largest share, ${Math.round((Math.max(...values) / val(whole)) * 100)}% of ${inMillions(val(whole))} in FY 2026-27.` });
  };
  const pages = new Set([20, 21]);
  const html = `<section class="section" aria-labelledby="overview"><h2 id="overview">Overview</h2><div class="mm-stats-kpis">${k.join('')}</div>` +
    `<h3 id="overview-types">Revenues and expenditures</h3>${charts(pie('chart-county-revenues', 'Revenues by type, FY 2026-27', 'revTypes', now.revTotal), pie('chart-county-expenditures', 'Expenditures by type, FY 2026-27', 'expTypes', now.expTotal))}` +
    table('Revenues and expenditures', ['', YEARS[1].label, YEARS[2].label, 'Change'], rows) +
    `<h3 id="overview-funds">General Fund and HHS Operating Fund</h3>${gTable}` +
    `<p class="app-help-text">The General Fund and the Health and Human Services Operating Fund together are the County's main operating funds. Revenues are shown as positive amounts.</p></section>`;
  return { html, csv, pages };
}

// Budget tables as lists of objects, for the Insights prompt: the rows of the CSVs, with their headings as keys.
const objects = (rows) => rows.slice(1).map((r) => Object.fromEntries(rows[0].map((h, i) => [h || 'Line', r[i]])));
// The book's description of a department's budget changes, without the sentences about FY 2027-28 (planned years are not shown).
function writtenChanges(data, org) {
  const raw = (data.changes || {})[org['@id']];
  if (!raw) return null;
  const paragraphs = raw.paragraphs.map((p) => p.split(/(?<=[.!?])\s+/).filter((sentence) => !/2027[–-]28/.test(sentence)).join(' ')).filter(Boolean);
  return paragraphs.length ? { pages: raw.pages, paragraphs } : null;
}
function organizationInsights(data, org, kids, parent) {
  const out = {};
  const written = writtenChanges(data, org);
  if (written) out['description of budget changes, as printed in the book'] = written.paragraphs;
  for (const c of organizationCsvs(data, org, kids)) out[c.label] = objects(c.rows);
  const fte = fteFor(data, org, parent);
  if (fte != null) out['full-time equivalent staff, FY 2026-27'] = fte;
  return out;
}
function programInsights(data, program) {
  const rows = programCsv(data, program);
  return rows ? { 'by fund group': objects(rows) } : null;
}
function areaInsights(data, csvRows) {
  return { 'expenditures by department or division': objects([['Service area', 'Department or division', ...YEARS.map((y) => y.label), 'Change', 'FTE'], ...csvRows]) };
}


// ---- Funds: a page for each ------------------------------------------------------------------------------
// The names in the data are title-cased by a program ("Hhs", "Mcera"); a name is shown the way the County writes it.
const fundName = (f) => f.name.replace(/\bHhs\b/g, 'HHS').replace(/\bMcera\b/g, 'MCERA').replace(/\bCdbg\b/g, 'CDBG').replace(/(?<=\w) (And|Or|Of|For|The) /g, (m, w) => ` ${w.toLowerCase()} `);
const fundCode = (f) => ((f.identifier || []).find((i) => i.propertyID === 'local:fund-code') || {}).value || '';
const fundSlug = (f) => `${fundCode(f)}-${fundName(f).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
const BUDGET_NOTE = 'The budget figures come from the County of Marin Proposed Budget FY 2026-28 (the final edition). Its FY 2026-27 column is headed Proposed. Revenues are positive amounts. Net County cost and staff counts are the book\'s own figures.';

// What the Program Overview says about a fund: the fund groups the lines name it for (the General Fund), by department.
function fundBudget(data, fund, { orgById, orgHref, programName, lib }) {
  if (!data) return null;
  const groups = new Set(data.lines.filter((l) => l.fund && l.fund['@id'] === fund['@id']).map((l) => l.fundSource));
  const rows = (data.display.programRows || []).filter((r) => groups.has(r.fundGroup));
  if (!rows.length) return null;
  const sum = (list, k) => list.reduce((n, r) => n + (r[k] || 0), 0);
  const byDept = new Map();
  rows.forEach((r) => (byDept.get(r.department) || byDept.set(r.department, []).get(r.department)).push(r));
  const depts = [...byDept].map(([id, list]) => ({ org: orgById.get(id), list, exp25: sum(list, 'exp_fy2025_26'), exp26: sum(list, 'exp_fy2026_27'), rev25: sum(list, 'rev_fy2025_26'), rev26: sum(list, 'rev_fy2026_27'), ncc25: sum(list, 'ncc_fy2025_26'), ncc26: sum(list, 'ncc_fy2026_27') }))
  const nameOf = (d) => (d.org && d.org.organizationClassification !== 'government' ? d.org.name : 'Non Departmental');
  depts.sort((a, b) => byName(nameOf(a), nameOf(b)));
  const total = (k) => depts.reduce((n, d) => n + d[k], 0);
  const pages = new Set(rows.map((r) => r.page));
  const body = depts.map((d) => `<tr><th scope="row">${d.org && d.org.organizationClassification !== 'government' ? `<a href="${orgHref(d.org)}">${esc(nameOf(d))}</a>` : esc(nameOf(d))}</th>${['exp25', 'exp26', 'rev25', 'rev26', 'ncc25', 'ncc26'].map((k) => num(d[k], money(d[k]))).join('')}</tr>`);
  const foot = `<tfoot><tr class="budget-table__total"><th scope="row">All departments</th>${['exp25', 'exp26', 'rev25', 'rev26', 'ncc25', 'ncc26'].map((k) => num(total(k), money(total(k)))).join('')}</tr></tfoot>`;
  const top = depts.filter((d) => d.exp26 > 0)[0];
  const kpis = `<div class="mm-stats-kpis">${kpi('Expenditures, FY 2026-27', millions(total('exp26')))}${kpi('Revenues, FY 2026-27', millions(total('rev26')))}${kpi('Net County cost, FY 2026-27', millions(total('ncc26')))}</div>`;
  const pie = chart('fund-chart-departments', 'Expenditures by department, FY 2026-27', 'bars', { keepOrder: true, labels: depts.filter((d) => d.exp26 > 0).map(nameOf), series: [{ name: 'FY 2026-27 Proposed', values: depts.filter((d) => d.exp26 > 0).map((d) => d.exp26) }],
    summary: `${nameOf(top)} is the largest share, ${Math.round((top.exp26 / total('exp26')) * 100)}% of ${inMillions(total('exp26'))} in FY 2026-27.` }, false, lib);
  const head = ['Department', 'Expenditures FY 2025-26', 'Expenditures FY 2026-27', 'Revenues FY 2025-26', 'Revenues FY 2026-27', 'Net County cost FY 2025-26', 'Net County cost FY 2026-27'];
  const csvDepartments = [head, ...depts.map((d) => [nameOf(d), d.exp25, d.exp26, d.rev25, d.rev26, d.ncc25, d.ncc26])];
  const csvPrograms = [['Department', 'Program', 'Book label', ...head.slice(1)], ...rows.map((r) => {
    const d = orgById.get(r.department);
    const p = r.program && programName ? programName(r.program) : null;
    return [d && d.organizationClassification !== 'government' ? d.name : 'Non Departmental', p || r.label, r.label, r.exp_fy2025_26, r.exp_fy2026_27, r.rev_fy2025_26, r.rev_fy2026_27, r.ncc_fy2025_26, r.ncc_fy2026_27];
  })];
  return { kpis, pages, pie, body, foot, head, depts, csvDepartments, csvPrograms, nameOf,
    lines: data.lines.filter((l) => l.fund && l.fund['@id'] === fund['@id']),
    insights: { 'by department': objects(csvDepartments) } };
}

// A department's (or division's) Budget tab. Returns '' when the book has nothing for it.
function organizationBudget(data, org, children, orgUrl, parent) {
  if (!data) return '';
  const now = figures(data, org['@id'], LATEST);
  const before = figures(data, org['@id'], PREVIOUS);
  const actual = figures(data, org['@id'], YEARS[0].key);
  const childRows = children.map((c) => ({ c, f: figures(data, c['@id'], LATEST) })).filter((x) => x.f && x.f.row).sort((x, y) => byName(x.c.name, y.c.name));
  // The FY 2025-26 Final Budget's rows for this department's budget unit, when the book has them.
  const finalBook = require('./budget-2025-org').departmentSection(org, '../');
  if (!now && !childRows.length && !finalBook) return '';
  const disp = (data.display.organizations || {})[org['@id']] || {};
  const ncc = (disp.department || {})['Net County Cost'];
  const fte = fteFor(data, org, parent);
  const pages = new Set();
  const note = (line) => { if (line) pages.add(data.display.linePages[line['@id']]); };

  const parts = [];
  if (now && now.expTotal) {
    const k = [kpi('Expenditures, FY 2026-27', millions(val(now.expTotal)))];
    if (now.revTotal) k.push(kpi('Revenues, FY 2026-27', millions(val(now.revTotal))));
    if (ncc) k.push(kpi('Net County cost, FY 2026-27', millions(ncc.fy2026_27)));
    if (fte != null) k.push(kpi('Full-time equivalent staff', bd_fte(fte)));
    parts.push(`<div class="mm-stats-kpis">${k.join('')}</div>`);
  }

  // Over three years, from the service-area table.
  const mismatch = now && now.row && now.expTotal && now.row.amount.value !== now.expTotal.amount.value;
  if (now && now.row && actual && actual.row) {
    const vals = YEARS.map((y) => val((figures(data, org['@id'], y.key) || {}).row));
    [YEARS.map((y) => (figures(data, org['@id'], y.key) || {}).row)].flat().forEach(note);
    parts.push(`<h3 id="budget-over-time">Expenditures</h3>` + charts(chart('budget-chart-years', 'Total expenditures', 'columns', { labels: YEARS.map((y) => y.label), series: [{ name: 'Expenditures', values: vals }], summary: `Expenditures ${vals[2] >= vals[0] ? 'rise' : 'fall'} from ${inMillions(vals[0])} in ${YEARS[0].label.replace(' Actuals', '')} to ${inMillions(vals[2])} in ${YEARS[2].label.replace(' Proposed', '')}.` })) + table('Expenditures over three years', ['', ...YEARS.map((y) => y.label), 'Change', 'FTE'],
      [`<tr><th scope="row">Expenditures</th>${vals.map((v) => num(v, money(v))).join('')}${num(change(vals[1], vals[2]), signed(change(vals[1], vals[2])))}${num(fte, fteText(fte))}</tr>`]));
    if (mismatch) parts.push(`<p class="app-help-text">The service-area table in the budget book prints ${money(now.row.amount.value)} for this department in FY 2026-27. The department's own page prints ${money(now.expTotal.amount.value)}, which matches the types below. Both are as printed.</p>`);
  }

  // Divisions that have their own row in the service-area table.
  if (childRows.length) {
    const rows = childRows.map(({ c }) => {
      const v = YEARS.map((y) => val((figures(data, c['@id'], y.key) || {}).row));
      const d = (data.display.organizations || {})[c['@id']];
      note(figures(data, c['@id'], LATEST).row);
      return `<tr><th scope="row"><a href="${orgUrl(c)}">${esc(c.name)}</a></th>${v.map((x) => num(x, money(x))).join('')}${num(d && d.sa.change_fy2026_27, d ? signed(d.sa.change_fy2026_27) : '')}${num(d && d.sa.fte_fy2026_27, d ? fteText(d.sa.fte_fy2026_27) : '')}</tr>`;
    });
    const divSeries = childRows.map(({ c }) => ({ name: c.name, values: YEARS.map((y) => val((figures(data, c['@id'], y.key) || {}).row) || 0) })).filter((one) => one.values.some((v) => v));
    const divLatest = [...divSeries].sort((x, y) => y.values[2] - x.values[2]);
    const divWhole = divSeries.reduce((n, one) => n + one.values[2], 0);
    parts.push(`<h3 id="budget-divisions">Divisions</h3>` + charts(chart('budget-chart-divisions', 'Expenditures by division, FY 2026-27', 'bars', { keepOrder: true, labels: divSeries.map((one) => one.name), series: [{ name: 'FY 2026-27 Proposed', values: divSeries.map((one) => one.values[2]) }],
      summary: `${divLatest[0].name} is the largest share, ${Math.round((divLatest[0].values[2] / divWhole) * 100)}% of ${inMillions(divWhole)} in FY 2026-27.` })) + table('Expenditures by division', ['Division', ...YEARS.map((y) => y.label), 'Change', 'FTE'], rows));
  }

  // Revenues and expenditures by type (the department page of the book).
  if (now && now.expTypes.length) {
    const cols = [PREVIOUS, LATEST];
    const get = (f, kind) => (f ? f[kind] : []);
    const find = (list, name) => list.find((l) => label(l) === name);
    const section = (title, kind, totalKey, sign) => {
      const names = [...new Set([...get(before, kind), ...get(now, kind)].map(label))];
      if (!names.length) return [];
      const r = names.map((n) => {
        const a = val(find(get(before, kind), n)) ?? 0;
        const b = val(find(get(now, kind), n)) ?? 0;
        note(find(get(now, kind), n));
        return `<tr><th scope="row">${esc(n)}</th>${num(a, money(a))}${num(b, money(b))}${num(b - a, signed(b - a))}</tr>`;
      });
      const a = val(before && before[totalKey]);
      const b = val(now[totalKey]);
      note(now[totalKey]);
      r.push(`<tr class="budget-table__total"><th scope="row">${esc(title)}</th>${num(a, money(a))}${num(b, money(b))}${num(change(a, b), signed(change(a, b)))}</tr>`);
      return r;
    };
    const rows = [];
    if (now.revTotal) rows.push(`<tr class="budget-table__group"><th scope="rowgroup" colspan="4">Revenues</th></tr>`, ...section('Total revenues', 'revTypes', 'revTotal'));
    rows.push(`<tr class="budget-table__group"><th scope="rowgroup" colspan="4">Expenditures</th></tr>`, ...section('Total expenditures', 'expTypes', 'expTotal'));
    if (ncc) rows.push(`<tr class="budget-table__total"><th scope="row">Net County cost</th>${num(ncc.fy2025_26, money(ncc.fy2025_26))}${num(ncc.fy2026_27, money(ncc.fy2026_27))}${num(change(ncc.fy2025_26, ncc.fy2026_27), signed(change(ncc.fy2025_26, ncc.fy2026_27)))}</tr>`);
    // Revenues, expenditures and net County cost by year, and where the money goes by type.
    const yearTotals = [PREVIOUS, LATEST].map((key) => figures(data, org['@id'], key));
    const totalSeries = [];
    if (now.revTotal) totalSeries.push({ name: 'Revenues', values: yearTotals.map((f) => val(f && f.revTotal) || 0) });
    totalSeries.push({ name: 'Expenditures', values: yearTotals.map((f) => val(f && f.expTotal) || 0) });
    if (ncc) totalSeries.push({ name: 'Net County cost', values: [ncc.fy2025_26, ncc.fy2026_27] });
    const typeNames = [...new Set([...get(before, 'expTypes'), ...get(now, 'expTypes')].map(label))];
    const typeSeries = [PREVIOUS, LATEST].map((key, i) => ({ name: YEARS[i + 1].label, values: typeNames.map((n) => val(find(get(i ? now : before, 'expTypes'), n)) || 0) }));
    parts.push(`<h3 id="budget-by-type">Revenues and expenditures</h3>` + charts(
      chart('budget-chart-totals', 'Revenues, expenditures and net County cost', 'columns', { labels: [YEARS[1].label, YEARS[2].label], series: totalSeries, summary: `In FY 2026-27: ${totalSeries.map((one) => `${one.name === 'Net County cost' ? one.name : one.name.toLowerCase()} ${inMillions(one.values[1])}`).join(', ')}.` }),
      chart('budget-chart-types', 'Expenditures by type', 'bars', { labels: typeNames, series: typeSeries, summary: `${typeNames[typeSeries[1].values.indexOf(Math.max(...typeSeries[1].values))]} is the largest type at ${inMillions(Math.max(...typeSeries[1].values))} in FY 2026-27.` })) + table('Revenues and expenditures by type', ['', YEARS[1].label, YEARS[2].label, 'Change'], rows));
  }
  // The book's written explanation of what changed, as printed.
  const written = writtenChanges(data, org);
  if (written) {
    written.pages.forEach((p) => pages.add(p));
    parts.push(`<h3 id="budget-changes">Description of budget changes</h3>${written.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}`);
  }
  if (finalBook) parts.push(finalBook);
  if (!parts.length) return '';
  const pageList = [...pages].filter((p) => p != null).sort((a, b) => a - b);
  if (now || childRows.length) parts.push(sourceList(data, pageList, [['Budget lines (JSON-LD)', BUDGET_LINES_URL]], 'Figures are whole dollars as printed. Revenues are shown as positive amounts. Net County cost and FTE are the book\'s own figures.'));
  return `<section class="section" id="budget" data-tab-section="budget" aria-labelledby="budget-heading" hidden><h2 id="budget-heading">Budget</h2>${parts.join('')}</section>`;
}

module.exports = { byName, BUDGET_SITE, useData, dataDir, fundName, fundCode, fundSlug, fundBudget, BUDGET_NOTE, organizationInsights, programInsights, areaInsights, countywideOverview, programCsv, sourceList, programKpis, programRows, programBudget, areaBudget, organizationCsvs, linesFor, chart, charts, organizationKpis, organizationTypeChart, fteFor, fteText, pagesText, load, organizationBudget, figures, label, val, money, millions, signed, change, num, table, kpi, pageLink, esc, YEARS, LATEST, PREVIOUS };

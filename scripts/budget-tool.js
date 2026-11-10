// The Budget tool shared by every budget book's home page: a year dropdown, a filter column, and the tabs
// Budget | Stats | Data | Notes. The page's script is budget/tool.js; what differs between books (columns, filters,
// lines, the overview under Stats, the Data and Notes tabs) is given to toolHtml() and to the script as JSON.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bd = require('./budget-data');
const { actions, chartActions } = require('./page-actions');
const { money, num, kpi, millions, esc } = bd;

const ROOT = path.join(__dirname, '..');
const stampOf = (file) => crypto.createHash('sha1').update(fs.readFileSync(path.join(ROOT, file))).digest('hex').slice(0, 8);
const ico = (d) => `<svg class="copy-icon" aria-hidden="true" viewBox="0 0 24 24">${d}</svg>`;
const ICONS = {
  book: ico('<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>'),
  amount: ico('<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M11 4h10"/><path d="M11 8h7"/><path d="M11 12h4"/>'),
  name: ico('<path d="m3 16 4 4 4-4"/><path d="M7 4v16"/><path d="M15 4h5l-5 6h5"/><path d="M15 20v-3.5a2.5 2.5 0 0 1 5 0V20"/><path d="M20 18h-5"/>'),
  table: ico('<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>'),
  cards: ico('<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>'),
  reset: ico('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
};
const tbtn = (attr, value, label, icon, pressed) => `<button type="button" class="action-button" ${attr}="${value}" aria-pressed="${pressed}" aria-label="${label}" title="${label}">${icon}</button>`;
const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// A choice of one in the filter column: a dropdown, so the column does not grow with the list. Radio buttons are only
// for a single option (nothing to choose), kept so the control still says what is shown. `fieldId` is the fieldset's id, `name` the control's name.
const CHOICE_RADIOS = 1;
function choiceFilter(fieldId, legend, name, options, selected) {
  const body = options.length > CHOICE_RADIOS
    ? `<label class="visually-hidden" for="${fieldId}-select">${esc(legend)}</label><select id="${fieldId}-select" name="${name}">${options.map((o) => `<option value="${esc(o.value)}"${o.value === selected ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`
    : `<ul class="search-facet-list">${options.map((o) => `<li><label><input type="radio" name="${name}" value="${esc(o.value)}"${o.value === selected ? ' checked' : ''}> ${esc(o.label)}</label></li>`).join('')}</ul>`;
  return `<fieldset class="search-facet-group" id="${fieldId}"><legend>${esc(legend)}</legend>${body}</fieldset>`;
}

// cfg: { title, titleLabel, columns: [{label}], defaultColumn, facets: [{name, label, all}], chartFacets: [name],
//        countFacet: name, countLabel, lines: [{slug, ref, title, href, values, facets, badges, page}],
//        statsExtra, dataHtml, notesHtml, id, exportCaption, noun }
function toolHtml(cfg) {
  const { columns, facets, lines } = cfg;
  const attrs = (l, i) => `data-line="${l.slug}" data-ref="${esc(l.ref || '')}" data-order="${i}" data-title="${esc(l.title)}" data-name="${esc(l.title.toLowerCase())}" ` +
    `data-search-text="${esc((l.title + ' ' + facets.map((f) => l.facets[f.name]).join(' ')).toLowerCase())}" ` +
    facets.map((f) => `data-facet-${f.name}="${esc(l.facets[f.name] || '')}"`).join(' ') + ` data-page="${l.page || ''}" ` + l.values.map((v, k) => `data-v${k}="${v == null ? '' : v}"`).join(' ');
  const shown = (l) => l.values[cfg.defaultColumn];
  // A line's title applies that line as a filter and opens Stats, so it stays in the tool. A comma in a value is written %2C.
  const toolHref = (l) => `?${cfg.countFacet}=${encodeURIComponent(l.title.replace(/,/g, '%2C'))}&tab=stats`;
  const pick = (l) => `<span class="mm-card__select"><label class="visually-hidden" for="pick-${l.slug}">Select: ${esc(l.title)}</label><input type="checkbox" id="pick-${l.slug}" data-select="${l.slug}"></span>`;
  const badge = (value) => `<span class="mm-term">${esc(value)}</span>`;
  const card = (l, i) => `<li class="app-card mm-card" ${attrs(l, i)}>${pick(l)}<div class="mm-card__body">` +
    `<h3 class="mm-card__title">${`<a href="${esc(toolHref(l))}">${esc(l.title)}</a>`}</h3>` +
    `<dl class="capital-figures"><div><dt data-column-label>${esc(columns[cfg.defaultColumn].label)}</dt><dd data-column-value>${shown(l) == null ? '–' : money(shown(l))}</dd></div></dl>` +
    `<div class="mm-terms">${(l.badges || []).map((n) => (l.facets[n] ? badge(l.facets[n]) : '')).join('')}</div></div></li>`;
  const row = (l, i) => `<tr ${attrs(l, i)}><td class="mm-card__select"><label class="visually-hidden" for="pick-row-${l.slug}">Select: ${esc(l.title)}</label><input type="checkbox" id="pick-row-${l.slug}" data-select="${l.slug}"></td>` +
    `<th scope="row">${`<a href="${esc(toolHref(l))}">${esc(l.title)}</a>`}</th>${facets.map((f) => `<td>${esc(l.facets[f.name] || '')}</td>`).join('')}${l.values.map((v) => num(v, money(v))).join('')}</tr>`;
  const count = (f, v) => lines.filter((l) => l.facets[f.name] === v).length;
  const values = (f) => [...new Set(lines.map((l) => l.facets[f.name]).filter(Boolean))];
  const facetHtml = (f) => `<fieldset class="search-facet-group" id="facet-${f.name}" data-all="${esc(f.all)}"><legend>${esc(f.label)}</legend><details class="mm-facet-group"><summary>${esc(f.all)}</summary><ul class="search-facet-list">` +
    values(f).map((v) => `<li><label><input type="checkbox" data-facet-filter="${f.name}" value="${esc(v)}"> ${esc(v)} <span class="search-facet-count">(${count(f, v)})</span></label></li>`).join('') + '</ul></details></fieldset>';
  const sumK = (k, list = lines) => list.reduce((n, l) => n + (l.values[k] || 0), 0);
  const chartCard = (id, title) => `<div class="chart-block">${chartActions('budget-' + cfg.id + '-' + id)}<section class="app-card" data-chart-card="${id}"><h3>${esc(title)}</h3><div class="capital-chart"><canvas role="img" aria-label="${esc(title)}" hidden></canvas></div></section></div>`;
  const first = facets.find((f) => f.name === cfg.chartFacets[0]);
  const withStat = (html, name) => html.replace('class="mm-stats-kpi__value"', `class="mm-stats-kpi__value" data-stat="${name}"`);
  const stats = `<div id="line-stats" aria-label="Stats" hidden><div class="mm-stats-kpis" id="selection-kpis">` +
    `${withStat(kpi(columns[cfg.defaultColumn].label, millions(sumK(cfg.defaultColumn))), 'total').replace('<p class="app-help-text">', '<p class="app-help-text" data-column-label>')}${withStat(kpi(cfg.noun.Many, String(lines.length)), 'n')}` +
    `${withStat(kpi(cfg.countLabel, String(values(facets.find((f) => f.name === cfg.countFacet)).length)), 'count')}</div>` +
    `<div class="mm-stats-grid" id="selection-charts" data-chart-lib="${cfg.lib}">${chartCard('years', 'Expenditures by year')}${cfg.chartFacets.map((n) => chartCard(n, `${facets.find((f) => f.name === n).label}`)).join('')}</div>` +
    `<div class="capital-stats__tables"><div class="table-scroll" role="region" tabindex="0" aria-label="Expenditures by year for the selection"><table class="budget-table"><caption>Expenditures by year, for the selection</caption><thead><tr><th scope="col">Year</th><th scope="col" class="budget-table__num">Expenditures</th></tr></thead><tbody id="selection-years">` +
    `${columns.map((c, k) => `<tr data-year="${k}"><th scope="row">${esc(c.label)}</th>${num(sumK(k), money(sumK(k)))}</tr>`).join('')}</tbody></table></div>` +
    `<div class="table-scroll" role="region" tabindex="0" aria-label="${esc(first.label)} in the selection"><table class="budget-table"><caption>${esc(first.label)}, for the selection</caption><thead><tr><th scope="col">${esc(first.label.replace(/s$/, ''))}</th><th scope="col" class="budget-table__num">${esc(cfg.noun.Many)}</th><th scope="col" class="budget-table__num" data-column-label>${esc(columns[cfg.defaultColumn].label)}</th></tr></thead><tbody id="selection-facet">` +
    `${values(first).map((v) => { const m = lines.filter((l) => l.facets[first.name] === v); return `<tr data-value="${esc(v)}"><th scope="row">${esc(v)}</th>${num(m.length, String(m.length))}${num(sumK(cfg.defaultColumn, m), money(sumK(cfg.defaultColumn, m)))}</tr>`; }).join('')}</tbody></table></div></div>${cfg.statsExtra || ''}</div>`;
  const toolbar = `<div class="action-toolbar"><div class="action-group" role="group" aria-label="Sort" id="sort-group">${tbtn('data-sort', 'book', 'Book order', ICONS.book, 'true')}${tbtn('data-sort', 'amount', 'Amount, high to low', ICONS.amount, 'false')}${tbtn('data-sort', 'name', 'Name, A to Z', ICONS.name, 'false')}</div>` +
    `<div class="action-group" role="group" aria-label="View" id="view-group">${tbtn('data-view', 'cards', 'Cards', ICONS.cards, 'true')}${tbtn('data-view', 'table', 'Table', ICONS.table, 'false')}</div>` +
    `<div class="action-group" role="group" aria-label="Chart actions" id="chart-actions" hidden><button type="button" class="action-button" id="copy-charts-button" data-icon="copy" aria-label="Copy charts" title="Copy charts"></button><button type="button" class="action-button" id="download-all-png-button" data-icon="download" aria-label="Download all charts as PNG" title="Download all charts as PNG"></button></div>` +
    `${actions(`budget-${cfg.id}`, '#line-cards', true, [{ id: 'table', label: cfg.noun.many }], null, true)}</div>`;
  // Which year's amount the cards, stats and charts show: a choice of one, in the filter column with the other filters.
  const columnFilter = choiceFilter('column-filter', 'Year', 'column', columns.map((c, k) => ({ value: String(k), label: c.label })), String(cfg.defaultColumn));
  // Which budget book: a choice of one, in the filter column. Each book is its own page, so choosing one goes to it.
  const bookFilter = choiceFilter('book-filter', 'Budget', 'book', cfg.books.map((o) => ({ value: o.href, label: o.label })), cfg.currentBook);
  const filterPanel = `<div class="search-side"><button type="button" id="filter-toggle" class="filter-toggle" data-filter-toggle="budget" aria-controls="filter-panel"></button>` +
    `<aside id="filter-panel" class="search-sidebar" aria-labelledby="filter-panel-title" data-open="false"><div class="search-panel-header"><h2 class="search-panel-title" id="filter-panel-title">Filter</h2>` +
    `<button type="button" class="action-button" id="reset-filters-button" aria-label="Reset filters" title="Reset filters">${ICONS.reset}</button></div>` +
    `<div class="search-input-field"><label for="line-search">Search</label><input type="search" id="line-search" placeholder="Search ${esc(cfg.noun.many)}&hellip;" autocomplete="off"></div>${bookFilter}${columnFilter}${facets.map(facetHtml).join('')}</aside></div>`;
  const tabRow = `<div id="content-tab-row" class="tab-list"><div role="tablist" aria-label="Budget" id="content-tabs"><button type="button" role="tab" aria-selected="true" id="lines-tab" aria-controls="line-list" class="tab-button">Budget</button></div>` +
    `<button type="button" id="stats-toggle" class="tab-button" aria-pressed="false" aria-controls="line-stats">Stats</button><button type="button" id="data-toggle" class="tab-button" aria-pressed="false" aria-controls="line-data">Data</button><button type="button" id="notes-toggle" class="tab-button" aria-pressed="false" aria-controls="line-notes">Notes</button></div>`;
  // The "Showing:" line as the script writes it for the whole list: each filter in order (the choice of one first, then the
  // others' "All" words), then the count in brackets with a breakdown that lists every value, zeros too (as Marin Mentions does).
  const breakdownFacet = facets.find((f) => f.name === cfg.breakdownFacet);
  const breakdown = values(breakdownFacet).map((v) => `${v} ${count(breakdownFacet, v)}`).join(', ');
  const showingText = `Showing: ${[columns[cfg.defaultColumn].label, ...facets.map((f) => f.all)].join(' · ')} (${lines.length} ${cfg.noun.many} — ${breakdown})`;
  const results = `<div class="search-results">${tabRow}<div class="mm-results-summary"><p class="app-help-text" id="active-filters" aria-live="polite">${esc(showingText)}</p></div>${toolbar}` +
    `<div id="line-list"><p class="app-empty" id="line-empty" hidden>No ${esc(cfg.noun.many)} match.</p><div class="mm-select-all" id="select-all-field"><label><input type="checkbox" id="select-all-checkbox"> Select all</label><span class="app-help-text" id="selection-count" role="status" aria-live="polite"></span></div>` +
    `<ul class="search-results-list" id="line-cards" aria-label="${esc(cfg.noun.Many)}">${lines.map(card).join('')}</ul>` +
    `<div id="line-table-wrap" hidden><div class="table-scroll" role="region" tabindex="0" aria-label="${esc(cfg.noun.Many)}"><table class="budget-table" id="line-table"><caption>${esc(cfg.noun.Many)}</caption><thead><tr><th scope="col"><span class="visually-hidden">Select</span></th><th scope="col">${esc(cfg.titleLabel)}</th>${facets.map((f) => `<th scope="col">${esc(f.label.replace(/s$/, ''))}</th>`).join('')}${columns.map((c) => `<th scope="col" class="budget-table__num">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${lines.map(row).join('')}</tbody></table></div></div></div>` +
    `${stats}<div id="line-export" class="visually-hidden" aria-hidden="true"></div><div id="line-data" aria-label="Data" hidden>${cfg.dataHtml}</div><div id="line-notes" aria-label="Notes" hidden>${cfg.notesHtml}</div></div>`;
  const config = { columns, defaultColumn: cfg.defaultColumn, facets: facets.map((f) => ({ name: f.name, label: f.label })), chartFacets: cfg.chartFacets, breakdownFacet: cfg.breakdownFacet, latestBook: cfg.books[0].href, currentBook: cfg.currentBook, countFacet: cfg.countFacet, titleLabel: cfg.titleLabel, noun: cfg.noun, exportCaption: cfg.exportCaption, statsTitle: cfg.statsTitle };
  return `<div class="search-layout" id="budget-tool">${filterPanel}${results}</div><script type="application/json" id="tool-config">${JSON.stringify(config).replace(/</g, '\\u003c')}</script>`;
}

// Script tags for a page at `up` levels below the repository root ('../../' for budget/fy2025-26/).
const toolScripts = (up) => `<script src="${up}search/shared/search-layout.js?v=${stampOf('search/shared/search-layout.js')}"></script><script src="${up}budget/tool.js?v=${stampOf('budget/tool.js')}"></script>`;

module.exports = { toolHtml, toolScripts, choiceFilter, slug };

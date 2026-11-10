// Copy, Link and Download for the content of a page. The shell wires Text, HTML and Markdown (marin-app-shell
// docs/components.md, "Copy and Download"); organization/page-data.js wires JSON and CSV, and, on a page with tabs,
// points the buttons at the tab that is open and shows only what that tab has.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CARET = '<svg class="menu-toggle__caret" aria-hidden="true" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg>';
const FORMATS = [['text', 'Text'], ['html', 'HTML'], ['markdown', 'Markdown']];

// `scope` is the selector of the content (null when the page builds its own strings and calls marinFormatMenus) the buttons copy and download; on a page with tabs it is replaced by the open tab.
// `json` is whether the page carries its data as JSON-LD; `csvs` is [{ id, label, tab }], one for each table.
// `tabs` is { content: [tabs with text to copy], json: [tabs with JSON] }. Without it every button is always shown.
const actions = (fileName, scope = 'article.content', json = false, csvs = [], tabs = null, link = true) => {
  const panel = (kind) => (link ? `${kind}-panel` : `${kind}-panel-${fileName}`);
  const only = (names) => (tabs ? ` data-for-tabs="${esc(names.join(' '))}"` : '');
  const menu = (kind, title, extra = '') => `<div class="menu"${only(tabs ? tabs.content : [])}><button type="button" class="action-button menu-toggle" data-icon="${kind}" aria-expanded="false" aria-controls="${panel(kind)}" aria-label="${title}, choose a format" title="${title}">${CARET}</button>` +
    `<div id="${panel(kind)}" class="menu-panel" hidden>${FORMATS.map(([f, label]) => `<button type="button" data-button-kind="menu-item" data-${kind}-format="${f}">${label}</button>`).join('')}` +
    `${json ? `<button type="button" data-button-kind="menu-item" data-${kind}-json${only(tabs ? tabs.json : [])}>JSON</button>` : ''}${extra}</div></div>`;
  const csvItems = csvs.map((c) => `<button type="button" data-button-kind="menu-item" data-download-csv="${esc(c.id)}"${c.file ? ` data-file-name="${esc(c.file)}"` : ''}${only([c.tab || ''])}>${csvs.length === 1 ? 'CSV' : esc('CSV, ' + c.label)}</button>`).join('');
  return `<div class="doc-actions"${tabs ? ' data-tabs' : ''} ${scope ? ` data-formats-for="${esc(scope)}"` : ''} data-file-name="${esc(fileName)}">${menu('copy', 'Copy')}` +
    `${link ? '<button type="button" class="action-button" data-action="share" data-icon="link" aria-label="Copy link" title="Copy link"></button>' : ''}${menu('download', 'Download', csvItems)}` +
    `<span class="doc-action-status" role="status" aria-live="polite"></span></div>`;
};

// A chart's own bar, shown like a table's: Copy and Download menus above it. Copy as an image or as text; Download as a PNG.
// organization/page-data.js does the copying and saving from the chart in the same .chart-block.
const chartActions = (id) => {
  const item = (attribute, label) => `<button type="button" data-button-kind="menu-item" ${attribute}>${label}</button>`;
  const menu = (kind, title, items) => `<div class="menu"><button type="button" class="action-button menu-toggle" data-icon="${kind}" aria-expanded="false" aria-controls="${kind}-panel-${esc(id)}" aria-label="${title}, choose a format" title="${title}">${CARET}</button>` +
    `<div id="${kind}-panel-${esc(id)}" class="menu-panel" hidden>${items}</div></div>`;
  return `<div class="doc-actions chart-actions">${menu('copy', 'Copy', item('data-chart-copy="image"', 'Image') + item('data-chart-copy="text"', 'Text'))}` +
    `${menu('download', 'Download', item('data-chart-png', 'PNG'))}<span class="doc-action-status" role="status" aria-live="polite"></span></div>`;
};

// The page's data for the buttons: JSON-LD (the JSON items) and its tables as rows (the CSV items).
//   graph   an array (one JSON for the page), an object { tab: array } (one for each tab), or null (tables only).
//   csvs    [{ id, label, rows }].
// `scriptPath` is how the page reaches page-data.js.
const ld = (id, graph) => `<script type="application/ld+json" id="${id}">${JSON.stringify({ '@context': 'https://schema.govfresh.com/v1/context.jsonld', '@graph': graph }).replace(/</g, '\\u003c')}</script>`;
// The script's address changes when the script does, so a page never runs an older cached copy of it.
const stamp = (scriptPath) => {
  const file = path.join(__dirname, '..', 'organization', 'page-data.js');
  return /organization\/page-data\.js$/.test(scriptPath) && fs.existsSync(file) ? `?v=${crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 8)}` : '';
};
const jsonBlock = (graph, scriptPath, csvs = []) =>
  (Array.isArray(graph) ? ld('page-data', graph) : graph ? Object.entries(graph).filter(([, g]) => g && g.length).map(([tab, g]) => ld(`page-data-${tab}`, g)).join('') : '') +
  csvs.map((c) => `<script type="application/json" id="csv-${esc(c.id)}">${JSON.stringify(c.rows).replace(/</g, '\\u003c')}</script>`).join('') +
  `<script src="${esc(scriptPath)}${stamp(scriptPath)}" defer></script>`;

module.exports = { actions, chartActions, jsonBlock };

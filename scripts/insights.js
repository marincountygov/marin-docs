// The Insights tab: a prompt a person copies into a chatbot, holding the structured data of one page.
//
// Like Marin Spec's prompts, it names no AI product and calls no AI service. The page only builds the text and copies
// it with the shell's marinCopyText. The data that does not change between builds (about, programs, budget) is written
// into the page as JSON; the data that does (Marin Mentions, Marin Reach, Marin Links) is fetched when the tab opens,
// from the same published files the other tabs read. organization/insights.js builds the prompt.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

// A table written as rows (the first row is the header) as a list of objects, for a prompt.
const rowsToObjects = (rows) => rows.slice(1).map((r) => Object.fromEntries(rows[0].map((h, i) => [h || 'Line', r[i]])));

// `sections`: [{ id, label, data }] that are written into the page. `live`: [{ id, label, kind, url, ... }] fetched when
// the tab opens.
function insightsTab({ subject, noun, sections, live = [], budgetNote = '', scriptPath }) {
  const boxes = [...sections, ...live].map((s) => `<label class="insights__option"><input type="checkbox" checked data-insights-section="${esc(s.id)}"${s.kind ? ` data-insights-live='${esc(json(s))}'` : ''}> ${esc(s.label)}</label>`).join('');
  const data = sections.map((s) => `<script type="application/json" id="insights-data-${esc(s.id)}">${json(s.data)}</script>`).join('');
  return `<section class="section insights" id="insights" data-tab-section="insights" aria-labelledby="insights-heading" hidden data-insights data-subject="${esc(subject)}" data-noun="${esc(noun)}" data-budget-note="${esc(budgetNote)}">` +
    `<h2 id="insights-heading">Insights</h2>` +
    `<p>Copy a prompt that holds the data for ${esc(subject)}. Paste it into a chatbot and ask your question. The prompt tells the chatbot to answer only from this data.</p>` +
    `<fieldset class="insights__include"><legend>Include</legend>${boxes}</fieldset>` +
    `<div class="insights__question"><label for="insights-question">Prompt</label><textarea id="insights-question" rows="3" data-insights-question placeholder="Ask about this ${esc(noun)}"></textarea></div>` +
    `<div class="insights__actions"><button type="button" class="action-button" data-icon="copy" data-insights-copy>Copy prompt</button>` +
    `<button type="button" class="action-button" data-icon="eye" aria-expanded="false" aria-controls="insights-preview" data-insights-preview-toggle>Preview</button>` +
    `<button type="button" class="action-button" data-icon="rotate-ccw" aria-label="Reset" title="Reset" data-insights-reset></button>` +
    `<span class="app-help-text" data-insights-status role="status" aria-live="polite"></span></div>` +
    `<pre class="insights__preview" id="insights-preview" data-insights-preview tabindex="0" hidden></pre>` +
    data + `<script src="${esc(scriptPath)}" defer></script></section>`;
}

module.exports = { insightsTab, rowsToObjects };

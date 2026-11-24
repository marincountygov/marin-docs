// Previous and next links at the foot of a document in a set (a guide page, a regulation, an SOP). One function, so the three kinds match.
// prev and next are { label, href } or null; with neither, nothing is drawn.
"use strict";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ARROW_LEFT = '<svg class="doc-pager__arrow" aria-hidden="true" viewBox="0 0 24 24"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>';
const ARROW_RIGHT = '<svg class="doc-pager__arrow" aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';

function renderDocPager({ label, prev, next }) {
  if (!prev && !next) return "";
  const prevHtml = prev ? `<a class="doc-pager__prev" href="${esc(prev.href)}"><span class="doc-pager__direction">${ARROW_LEFT}Previous</span>${esc(prev.label)}</a>` : "";
  const nextHtml = next ? `<a class="doc-pager__next" href="${esc(next.href)}"><span class="doc-pager__direction">Next${ARROW_RIGHT}</span>${esc(next.label)}</a>` : "";
  return `<nav class="doc-pager" aria-label="${esc(label)}">${prevHtml}${nextHtml}</nav>`;
}

module.exports = { renderDocPager };

// The details of a document: who prepared it, who approved it, when it applies. One block, built from the data the document already has,
// in the style of the Overview of a procedure (`dl.details`). A row appears only when the data has a value for it; nothing is filled in,
// worked out or reworded, and a document with none has no block. The rules are "Document details" in marin-ui/docs/components.md.
//
//   renderDocDetails({ label, rows })   rows: [[term, value], ...]; value is plain text (it is escaped here)
"use strict";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function renderDocDetails({ label, rows }) {
  const present = rows.filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "");
  if (!present.length) return "";
  return `<section class="doc-details" aria-label="${esc(label)}"><dl class="details">${present.map(([term, value]) => `<dt>${esc(term)}</dt><dd>${esc(value)}</dd>`).join("")}</dl></section>`;
}

module.exports = { renderDocDetails };

#!/usr/bin/env node
// Cleans the text of schemaGov records before it is shown on a page. The data files are not changed.
//
// The County's descriptions and missions were copied from the budget book, and pieces of its pages came along:
// the page heading ("DEPARTMENT BUDGET - CULTURAL SERVICES"), the department's address, phone and web address,
// the department head's name, words split by a line break ("court- ordered"), and labels typed in capitals.
// Fixing the data at its source is better; until then every page uses these functions.
//
//   node scripts/clean-text.js [data-dir]   Lists every change, old text beside new, for review.

const fs = require('fs');
const path = require('path');

// Words split at the end of a line in the source: "court- ordered" is "court-ordered".
const joinHyphens = (text) => text.replace(/(?<=[a-z])- (?=[A-Za-z])/g, '-');
// Doubled spaces, and a full stop left on its own after one ("statements. .").
const tidySpaces = (text) => text.replace(/[ \t\u00a0]{2,}/g, ' ').replace(/([.!?])\s+\.(?=\s|$)/g, '$1').trim();

// The budget book's page heading ends each department description, and the Public Defender's also has the
// department head's name and division headings before it.
const cleanDescription = (text) => tidySpaces(joinHyphens(text
  .replace(/(?<=[.!?])\s+(?:[A-Z][a-z.]+\s+){0,3}(?:[A-Z][A-Z&,’-]*\s+)*DEPARTMENT BUDGET\s*-.*$/, '')));

// A mission ends where the department's address, phone, web address and head's name begin, or with the name alone.
const cleanMission = (text) => tidySpaces(joinHyphens(text
  .replace(/\s+\d{3,5}\s.*?Tel:\s*[\d.\-]+\s+MarinCounty\.gov\/\S+(?:\s.*)?$/, '')
  .replace(/(?<=[.!?])\s+[A-Z][\w’'.-]*(?:\s+[A-Z][\w’'.-]*){1,3}$/, '')));

// Funds and programs: no heading or contact block, only the splits and spaces.
const cleanText = (text) => tidySpaces(joinHyphens(text));

// A classification typed in capitals ("County Executive’S Office"). When it is the name of an organization,
// the organization's own spelling is used; otherwise the usual slips are put right.
const fixLabel = (label, names = []) => {
  const known = new Map(names.map((n) => [n.toLowerCase(), n]));
  if (known.has(label.toLowerCase())) return known.get(label.toLowerCase());
  return label
    .replace(/’S\b/g, '’s')
    .replace(/(?<=\w) (Of|And|The|For|To|In) /g, (_, w) => ` ${w.toLowerCase()} `)
    .replace(/^Uc /, 'UC ');
};

module.exports = { cleanDescription, cleanMission, cleanText, fixLabel, joinHyphens };

if (require.main === module) {
  const dir = process.argv[2] || path.join(__dirname, '..', 'organization', 'data');
  const graph = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))['@graph'];
  const orgs = graph('organizations.jsonld');
  const names = orgs.flatMap((o) => [o.name, ...(o.alternateName || [])]);
  const show = (kind, name, field, before, after) => {
    if (before === after) return;
    // A cut off the end, or the first place the text differs, with a little around it.
    let i = 0;
    while (i < before.length && before[i] === after[i]) i += 1;
    const detail = before.startsWith(after) ? `cut: ${before.slice(after.length).trim().slice(0, 90)}` : `"${before.slice(Math.max(0, i - 12), i + 14)}" -> "${after.slice(Math.max(0, i - 12), i + 14)}"`;
    console.log(`${kind} | ${name} | ${field} | ${detail}`);
  };
  for (const o of orgs) {
    if (o.description) show('organization', o.name, 'description', o.description, cleanDescription(o.description));
    if (o.mission) show('organization', o.name, 'mission', o.mission, cleanMission(o.mission));
  }
  for (const p of graph('programs.jsonld')) {
    show('program', p.name, 'description', p.description, cleanText(p.description));
    if (p.programClassification) show('program', p.name, 'classification', p.programClassification, fixLabel(p.programClassification, names));
  }
  const fundsFile = path.join(__dirname, '..', 'budget', 'data', 'funds.jsonld');
  if (fs.existsSync(fundsFile)) for (const f of JSON.parse(fs.readFileSync(fundsFile, 'utf8'))['@graph']) if (f.description) show('fund', f.name, 'description', f.description, cleanText(f.description));
}

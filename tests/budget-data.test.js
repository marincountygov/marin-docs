// Checks the budget lines in budget/data against themselves, the way the budget book adds up.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'budget', 'data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))['@graph'];
const lines = read('budget-lines.jsonld');
const budgets = new Map(read('budgets.jsonld').map((b) => [b['@id'], b]));
const orgs = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'organization', 'data', 'organizations.jsonld'), 'utf8'))['@graph'].map((o) => o['@id']));
const byId = new Map(lines.map((l) => [l['@id'], l]));
const programs = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'organization', 'data', 'programs.jsonld'), 'utf8'))['@graph'].map((x) => x['@id']));
const funds = new Set(JSON.parse(fs.readFileSync(path.join(DIR, 'funds.jsonld'), 'utf8'))['@graph'].map((x) => x['@id']));

test('every line has a budget, an amount in dollars and a direction', () => {
  assert.ok(lines.length > 0);
  for (const l of lines) {
    assert.ok(budgets.has(l.budget['@id']), `${l['@id']}: budget`);
    assert.strictEqual(l.amount.currency, 'USD');
    assert.ok(['revenue', 'expenditure', 'financing'].includes(l.direction), l['@id']);
  }
});

test('every organization a line names exists', () => {
  for (const l of lines) if (l.administrativeClassification) assert.ok(orgs.has(l.administrativeClassification['@id']), l['@id']);
});

test('a parent line equals the sum of its parts, to the dollar the book rounds by', () => {
  for (const p of lines.filter((l) => l.hasPart)) {
    const sum = p.hasPart.reduce((n, c) => n + byId.get(c['@id']).amount.value, 0);
    assert.ok(Math.abs(sum - p.amount.value) <= 1, `${p['@id']}: ${p.amount.value} against ${sum}`);
    for (const c of p.hasPart) assert.strictEqual(byId.get(c['@id']).isPartOf['@id'], p['@id']);
  }
});

test('revenues are positive and no fiscal state is mixed into another budget', () => {
  for (const l of lines) {
    if (l.direction === 'revenue') assert.ok(l.amount.value > 0, l['@id']);
    assert.ok(l['@id'].includes(`/${l.budget['@id'].split('/').pop()}/`), `${l['@id']} is in another budget's id space`);
  }
  assert.ok(![...budgets.keys()].some((k) => /2027-28/.test(k)), 'planned year added');
});

test('a program or fund a line names exists, and a program line names its fund group', () => {
  const programLines = lines.filter((l) => l.program);
  assert.ok(programLines.length > 0);
  for (const l of lines) {
    if (l.program) assert.ok(programs.has(l.program['@id']), `${l['@id']}: program`);
    if (l.fund) assert.ok(funds.has(l.fund['@id']), `${l['@id']}: fund`);
    if (l.programClassification) assert.ok(l.fundSource, `${l['@id']}: a program row is in a fund group`);
  }
});

test('a choice of one is a dropdown once there is anything to choose', () => {
  const { choiceFilter } = require('../scripts/budget-tool');
  const options = (n) => Array.from({ length: n }, (_, i) => ({ value: String(i), label: `Option ${i}` }));
  assert.match(choiceFilter('f', 'Year', 'year', options(1), '0'), /type="radio"/);
  const two = choiceFilter('f', 'Year', 'year', options(2), '1');
  assert.match(two, /<select id="f-select" name="year">/);
  assert.doesNotMatch(two, /type="radio"/);
  assert.match(two, /<option value="1" selected>/);
});

// Run: node --test tests/clean-text.test.js
const test = require('node:test');
const assert = require('node:assert');
const { cleanDescription, cleanMission, cleanText, fixLabel } = require('../scripts/clean-text');

test('the budget book heading is cut from a description', () => {
  assert.strictEqual(cleanDescription('Serves the arts. DEPARTMENT BUDGET - CULTURAL SERVICES'), 'Serves the arts.');
  // the last words of the real sentence stay
  assert.strictEqual(cleanDescription('Elections in Marin County. DEPARTMENT BUDGET - ELECTIONS'), 'Elections in Marin County.');
});

test('a name and division headings before the heading are cut too', () => {
  assert.strictEqual(cleanDescription('Connect clients to services. David Joseph Sutton PUBLIC DEFENDER DEFENSE SERVICES DEPARTMENT BUDGET - PUBLIC DEFENDER'), 'Connect clients to services.');
});

test('a description with none of it is unchanged', () => {
  assert.strictEqual(cleanDescription('Runs the library.'), 'Runs the library.');
});

test('a mission loses its contact block and head of department', () => {
  assert.strictEqual(cleanMission('Build roads. 3501 Civic Center Drive, Suite 304 San Rafael, CA 94903 Tel: 415-473-6528 MarinCounty.gov/Public-Works Christopher Blunk'), 'Build roads.');
  assert.strictEqual(cleanMission('Serve residents. Jill K. Francis'), 'Serve residents.');
  assert.strictEqual(cleanMission('Defend people. 3501 Civic Center Drive, Suite 139 San Rafael, CA 94903 Tel: 415-473-6321 MarinCounty.gov/Public-Defender'), 'Defend people.');
});

test('a mission that is only sentences is unchanged', () => {
  assert.strictEqual(cleanMission('To provide excellent services. We care.'), 'To provide excellent services. We care.');
});

test('words split at a line break are joined, real hyphens kept', () => {
  assert.strictEqual(cleanText('court- ordered and Sheriff- Coroner’s and well-being'), 'court-ordered and Sheriff-Coroner’s and well-being');
  assert.strictEqual(cleanText('a – b'), 'a – b');
});

test('doubled spaces and a stray full stop are tidied', () => {
  assert.strictEqual(cleanText('one  two'), 'one two');
  assert.strictEqual(cleanText('statements. .'), 'statements.');
});

test('capital-letter classifications are put right', () => {
  const names = ['Board of Supervisors', 'Marin County Parks'];
  assert.strictEqual(fixLabel('Board Of Supervisors', names), 'Board of Supervisors');
  assert.strictEqual(fixLabel('County Executive’S Office', names), 'County Executive’s Office');
  assert.strictEqual(fixLabel('Department Of Public Works', names), 'Department of Public Works');
  assert.strictEqual(fixLabel('Uc Cooperative Extension Marin', names), 'UC Cooperative Extension Marin');
  assert.strictEqual(fixLabel('Marin County Fire', names), 'Marin County Fire');
});

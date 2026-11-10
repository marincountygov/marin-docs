// The TEST banner for a section of this app, written from marin.yml (project.test, or the section's folder in
// project.test_sections). See "Test banner" in marin-ui/docs/components.md.
const fs = require('fs');
const path = require('path');

const TEST_TEXT = 'TEST: This is a design test. Data shown has not been fully reviewed and is for test use only.';

function isTest(section) {
  const file = path.join(__dirname, '..', 'marin.yml');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (/^\s+test:\s*true\s*$/m.test(text)) return true;
  const list = text.match(/^\s+test_sections:\s*(.+?)\s*$/m);
  return !!list && list[1].split(',').map((x) => x.trim()).includes(section);
}

const testBanner = (section) => (isTest(section) ? `<div class="app-test-banner" role="note">${TEST_TEXT}</div>` : '');

module.exports = { testBanner };

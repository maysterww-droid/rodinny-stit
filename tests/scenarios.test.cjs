// RODINNÝ ŠTÍT 1.2 – synthetic Czech quality corpus for the LOCAL rule engine.
// No network, OCR, live AI or personal data. Run: node --test tests/scenarios.test.cjs
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const cases = JSON.parse(readFileSync(path.join(__dirname, 'scenarios-cs.json'), 'utf8')).cases;
const source = readFileSync(path.join(root, 'assets/app.js'), 'utf8');
const ctx = { document: { querySelectorAll: () => [] }, window: {}, console };
vm.createContext(ctx);
vm.runInContext(source, ctx, { timeout: 2000 });
function analyze(message) {
  return vm.runInContext('classify(' + JSON.stringify(message) + ')', ctx, { timeout: 1000 });
}
for (const entry of cases) {
  test('Czech QA: ' + entry.id + ' (' + entry.kind + ' => ' + entry.expected + ')', () => {
    const actual = analyze(entry.message);
    assert.equal(actual.level, entry.expected,
      entry.id + ': detected ' + actual.found.map(s => s.id).join(', '));
    assert.ok(Array.isArray(actual.found), 'signals list is an array');
    assert.ok(!actual.found.some(s => /je bezpečná|zaručeně bezpečná/i.test(s.detail)),
      'no absolute safety promise');
  });
}
test('Czech corpus has both high-risk and benign scenarios', () => {
  assert.ok(cases.filter(x => x.kind === 'fraud').length >= 8);
  assert.ok(cases.filter(x => x.kind === 'benign').length >= 10);
  assert.ok(cases.filter(x => x.kind === 'ambiguous').length >= 3);
  assert.ok(new Set(cases.map(x => x.id)).size === cases.length, 'unique scenario ids');
});

// RODINNÝ ŠTÍT 1.5 — developer-only Czech safety regression.
// This MUST NOT import sealed Holdout C, which is evaluated only once after freeze.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = readFileSync(path.join(__dirname, '..', 'assets/app.js'), 'utf8');
const cases = JSON.parse(readFileSync(path.join(__dirname, 'dev15-cs.json'), 'utf8')).cases;
const sandbox = { document: { querySelectorAll: () => [] }, window: {}, console };
vm.createContext(sandbox);
vm.runInContext(source + '\nfunction nextStepsForTest(text) { return nextSteps(classify(text)); }', sandbox, { timeout: 2000 });
const query = (functionName, message) => vm.runInContext(functionName + '(' + JSON.stringify(message) + ')', sandbox, { timeout: 1000 });
test('1.5 curated developer set includes high, ordinary and ambiguous', () => {
  assert.equal(cases.length, 45);
  assert.equal(new Set(cases.map(x => x.id)).size, cases.length);
  assert.equal(cases.filter(x => x.expected === 'high').length, 20);
  assert.equal(cases.filter(x => x.expected === 'low').length, 15);
  assert.equal(cases.filter(x => x.expected === 'moderate').length, 10);
});
for (const entry of cases) {
  test('quality 1.5: ' + entry.id + ' → ' + entry.expected, () => {
    const data = query('classify', entry.message);
    assert.equal(data.level, entry.expected, entry.id + ': signal IDs ' + data.found.map(s => s.id).join(','));
    assert.ok(data.found.every(s =>
      entry.message.toLocaleLowerCase('cs').includes(s.example.toLocaleLowerCase('cs'))),
      'excerpts MUST be verbatim substrings of the analyzed text');
    assert.ok(entry.expected !== 'high' || data.found.length > 0, 'high needs visible supporting evidence');
    const marked = vm.runInContext(
      'highlight(' + JSON.stringify(entry.message) + ', classify(' + JSON.stringify(entry.message) + ').found)', sandbox, { timeout: 1000 });
    assert.ok(!marked.includes('<script') && !marked.includes('<img'), 'only escaped text can render');
    assert.ok(data.found.length === 0 || marked.includes('<mark>'), 'warnings have visible markup');
    const actions = query('nextStepsForTest', entry.message);
    assert.ok(actions.length >= 2 && actions.length <= 5, '2–5 practical recommended actions');
    assert.ok(!actions.some(s => /zpráva je (?:zcela )?bezpečná|zaručeně bezpečn/i.test(s)), 'no safety guarantee');
  });
}
// nextStepsForTest has no runtime side effects; helper is defined after the client source.

test('1.5 targeted identity/cash advice, no overconfident language', () => {
  const id = cases.find(x => x.topic === 'identity-document');
  const cash = cases.find(x => x.topic === 'cash-handoff');
  assert.ok(query('nextStepsForTest', id.message).some(s => /fotografie dokladů/.test(s)));
  assert.ok(query('nextStepsForTest', cash.message).some(s => /hotovost/.test(s)));
});

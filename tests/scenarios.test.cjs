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
    assert.ok(actual.found.every(sig =>
      entry.message.toLocaleLowerCase('cs').includes(sig.example.toLocaleLowerCase('cs'))),
      entry.id + ': every highlighted warning must exist in original text');
    const steps = vm.runInContext('nextSteps(classify(' + JSON.stringify(entry.message) + '))', ctx, { timeout: 1000 });
    assert.ok(steps.length >= 2 && steps.length <= 5,
      entry.id + ': provide 2–5 actionable Czech next steps');
    assert.ok(!steps.some(step => /zpráva je (?:zcela )?bezpečná|zaručeně bezpečn/i.test(step)),
      entry.id + ': never claim an SMS is safe');
    if (entry.kind === 'fraud') {
      assert.equal(actual.level, 'high', entry.id + ': strong fraud fixture must not fall through to low/medium');
      assert.ok(steps.some(step => /ověř|neposílejte|nesdělujte|neotvírejte|neskenujte|uschovejte|kontaktujte|banka|bankovního/.test(step.toLocaleLowerCase('cs'))),
        entry.id + ': include specific defensive guidance');
    }
    if (entry.kind === 'benign') {
      assert.equal(actual.level, 'low', entry.id + ': avoid a false alarm for a benign fixture');
    }
    assert.ok(Array.isArray(actual.found), 'signals list is an array');
    assert.ok(!actual.found.some(s => /je bezpečná|zaručeně bezpečná/i.test(s.detail)),
      'no absolute safety promise');
  });
}
test('Czech corpus has both high-risk and benign scenarios', () => {
  assert.equal(cases.length, 100, '100 curated synthetic Czech scenarios');
  assert.equal(cases.filter(x => x.kind === 'fraud').length, 36);
  assert.equal(cases.filter(x => x.kind === 'benign').length, 34);
  assert.equal(cases.filter(x => x.kind === 'ambiguous').length, 30);
  assert.ok(cases.every(x => x.id && x.message && x.expected));
  assert.ok(cases.every(x => !/https?:\/\/(?![a-z0-9-]+\.invalid|example\.com)/.test(x.message)), 'only reserved test hosts');
  assert.ok(new Set(cases.map(x => x.id)).size === cases.length, 'unique scenario ids');
});

const guidanceChecks = [
  ['boss-changed-account', /Změnu bankovního účtu/],
  ['qr-delivery-payment', /QR kód neskenujte/],
  ['coercion-payment', /Policii ČR/],
  ['fake-it-verification', /Nesdělujte žádné kódy/],
  ['seed-phrase-scam', /Nesdělujte žádné kódy/]
];
for (const [id, expected] of guidanceChecks) {
  test('contextual safety guidance: ' + id, () => {
    const item = cases.find(x => x.id === id);
    assert.ok(item, 'fixture exists: ' + id);
    const steps = vm.runInContext('nextSteps(classify(' + JSON.stringify(item.message) + '))', ctx, { timeout: 1000 });
    assert.ok(steps.some(s => expected.test(s)), 'missing relevant guidance ' + id + ' in ' + steps.join('; '));
  });
}


// Additional development-only cases for the 1.3 hardening layer.
// The sealed independent holdouts are deliberately NOT loaded by npm test.
const devCases = JSON.parse(readFileSync(path.join(__dirname, 'hardening-dev-cs.json'), 'utf8')).cases;
assert.equal(devCases.length, 19);
for (const entry of devCases) {
  test('1.3 contextual development QA: ' + entry.id, () => {
    const actual = analyze(entry.message);
    assert.equal(actual.level, entry.expected,
      entry.id + ': signs ' + actual.found.map(s => s.id).join(', '));
    for (const signal of actual.found) {
      assert.ok(entry.message.toLocaleLowerCase('cs').includes(signal.example.toLocaleLowerCase('cs')),
        entry.id + ': warning excerpt must occur verbatim in source message');
    }
    const steps = vm.runInContext('nextSteps(classify(' + JSON.stringify(entry.message) + '))', ctx, { timeout: 1000 });
    assert.ok(steps.length >= 2 && steps.length <= 5, 'clear next steps');
    assert.ok(!steps.some(step => /zaručeně bezpečn|zpráva je bezpečná/i.test(step)));
  });
}

#!/usr/bin/env node
// Independent diagnostic holdout for RODINNÝ ŠTÍT 1.2.
// Uses only local rule code (no live LLM/API/HTTP).
// NEVER modify the holdout to improve this score; create a NEW evaluation set.
'use strict';
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');
const vm = require('node:vm');

const root = resolve(__dirname, '..');
const source = readFileSync(resolve(root, 'assets/app.js'), 'utf8');
const data = JSON.parse(readFileSync(resolve(__dirname, 'holdout-cs-a.json'), 'utf8'));
// Locks the evaluator to the original rule engine, before any held-out labels were examined.
const gitBlobSha = createHash('sha1').update('blob ' + Buffer.byteLength(source) + '\0').update(source).digest('hex');
assert.equal(gitBlobSha, '82c30b21643819923b99ce502dc7ae8d3d5af0c9',
  'Classifier changed since holdout was frozen: this is NOT an independent baseline evaluation.');
assert.equal(data.baselineRef, '7b4109e4989ca6d646d14f7245cc875562529725');
assert.equal(data.cases.length, 100);
assert.equal(new Set(data.cases.map(x => x.id)).size, 100);
const ctx = { document: { querySelectorAll: () => [] }, window: {}, console };
vm.createContext(ctx);
vm.runInContext(source, ctx, { timeout: 2500 });
const labels = ['high','moderate','low'];
const confusion = Object.fromEntries(labels.map(want => [want,
  Object.fromEntries(labels.map(got => [got, 0]))]));
const outcomes = [];
for (const e of data.cases) {
  assert.ok(labels.includes(e.expected));
  const result = vm.runInContext('classify(' + JSON.stringify(e.message) + ')', ctx, { timeout: 1000 });
  confusion[e.expected][result.level] += 1;
  outcomes.push({
    id: e.id,
    topic: e.topic,
    intent: e.intent,
    expected: e.expected,
    actual: result.level,
    match: result.level === e.expected,
    signals: result.found.map(s => s.id)
  });
}
const matrix = {
  matchCount: outcomes.filter(x => x.match).length,
  total: outcomes.length,
  confusion,
  byIntent: Object.fromEntries(['scam','benign','ambiguous'].map(type => {
    const group = outcomes.filter(x => x.intent === type);
    return [type, { total: group.length, matches: group.filter(x => x.match).length }];
  })),
  scamHighDetection: {
    flaggedHigh: confusion.high.high,
    allSyntheticScams: outcomes.filter(x => x.intent === 'scam').length
  },
  benignFalseAlerts: {
    moderate: confusion.low.moderate,
    high: confusion.low.high,
    allSyntheticBenign: outcomes.filter(x => x.intent === 'benign').length
  },
  caveat: 'Synthetic, hypothesis-labeled challenge set. NOT verified real-world detection accuracy.',
  baselineRef: data.baselineRef,
  sourceBlobSha: gitBlobSha,
  outcomes
};
if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(matrix, null, 2) + '\n');
else {
  console.log('HOLDOUT A — 100 Czech synthetic messages vs frozen Pilot 1.2');
  console.log('Matches:', matrix.matchCount + '/' + matrix.total);
  for (const type of ['scam','benign','ambiguous']) {
    const x = matrix.byIntent[type]; console.log(type + ': ' + x.matches + '/' + x.total);
  }
  console.log('Confusion: expected labels are rows; detected labels are columns.');
  console.table(matrix.confusion);
  console.log('NOT an estimate of real-world safety or accuracy.');
  console.log('Use --json for per-case outcomes.');
}

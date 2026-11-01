#!/usr/bin/env node
// Independently sealed Holdout C. Run ONCE after candidate freeze.
// From evaluation/holdout-c-1.5 with both commits fetched:
// node tests/eval-c-1.5.cjs BASELINE_SHA CANDIDATE_SHA --json
'use strict';
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cats = ['high','moderate','low'];
const [a,b] = process.argv.slice(2);
if(!a || !b || !/^[0-9a-f]{40}$/i.test(a) || !/^[0-9a-f]{40}$/i.test(b)){
  console.error('Supply two frozen 40-character Git commit hashes.');process.exit(2);
}
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'holdout-c-1.5.json'),'utf8'));
assert.equal(data.cases.length,60);
assert.equal(new Set(data.cases.map(x=>x.id)).size,60);
function evaluate(ref){
  const source=execFileSync('git',['show',ref+':assets/app.js'],{encoding:'utf8',maxBuffer:6e6});
  const ctx=vm.createContext({document:{querySelectorAll:()=>[]},window:{},console});
  vm.runInContext(source,ctx,{timeout:2500});
  const matrix=Object.fromEntries(cats.map(want=>[want,Object.fromEntries(cats.map(got=>[got,0]))]));
  const outcomes=data.cases.map(c=>{
    const ans=vm.runInContext('classify('+JSON.stringify(c.message)+')',ctx,{timeout:1000});
    assert.ok(cats.includes(ans.level),'invalid result level');
    assert.ok(ans.found.every(s=>c.message.toLocaleLowerCase('cs').includes(s.example.toLocaleLowerCase('cs'))),'fabricated evidence '+c.id);
    matrix[c.expected][ans.level]+=1;
    return {id:c.id,expected:c.expected,actual:ans.level,intent:c.intent};
  });
  return {commit:ref,matches:outcomes.filter(x=>x.expected===x.actual).length,
    scamHigh:matrix.high.high,scamLow:matrix.high.low,benignLow:matrix.low.low,
    benignHigh:matrix.low.high,ambiguousModerate:matrix.moderate.moderate,
    confusion:matrix,outcomes};
}
const baseline=evaluate(a),candidate=evaluate(b);
const report={dataset:'Sealed synthetic Czech Holdout C (60)',baseline,candidate,
  deltaMatches:candidate.matches-baseline.matches,
  deltaScamHigh:candidate.scamHigh-baseline.scamHigh,
  caveat:'Synthetic and nonrepresentative; not an estimate of real-world fraud recall or false positives.'};
if(process.argv.includes('--json')) console.log(JSON.stringify(report,null,2));
else console.log(JSON.stringify({baseline:baseline.matches,candidate:candidate.matches,
  scamHighBefore:baseline.scamHigh,scamHighAfter:candidate.scamHigh,
  benignLowBefore:baseline.benignLow,benignLowAfter:candidate.benignLow,caveat:report.caveat},null,2));

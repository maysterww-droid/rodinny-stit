// RODINNÝ ŠTÍT client-side smoke checks. Run: node tests/smoke.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'..','assets','app.js'),'utf8');
const ctx = {document:{querySelectorAll:()=>[]},window:{},console};
vm.createContext(ctx);vm.runInContext(source,ctx,{timeout:2000});
const evaluate = text => vm.runInContext('classify('+JSON.stringify(text)+')',ctx,{timeout:1000});
const examples = [
 ['new family number','Ahoj mami, mám nové číslo, urgentně pošli 8000 Kč. Nevolej.', 'high'],
 ['fake bank OTP','Bezpečnostní oddělení banky: ihned sdělte ověřovací kód SMS.', 'high'],
 ['parcel link payment','Česká pošta: dnes zaplaťte 49 Kč na https://zasilka.invalid.', 'high'],
 ['investment pressure','Garantovaný výnos! Investujte 5000 Kč hned.', 'high'],
 ['password only','Prosím změňte své heslo.', 'moderate'],
 ['new phone only','Mám nové číslo. Ahoj!', 'moderate'],
 ['ordinary conversation','Dobrý den, porada se koná zítra v deset. Hezký den.', 'low'],
 ['blank-ish non danger','Přeji krásný víkend a děkuji za pomoc.', 'low']
];
for(const [label,text,expectation] of examples){
 const output=evaluate(text);assert.equal(output.level,expectation,label);
 console.log('OK',label,output.level);
}
const sanitized = vm.runInContext("esc('<script>\"&</script>')",ctx);
assert.equal(sanitized,'&lt;script&gt;&quot;&amp;&lt;/script&gt;');
assert.ok(!source.includes("fetch('/api/analyze'"),'No absent AI backend request');
console.log('OK escaped excerpts and no external server analysis');

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
for (const name of ['relative','bank','parcel','invest','newnumber','bankmail']) {
 const lvl=vm.runInContext('classify(demoExamples['+JSON.stringify(name)+']).level',ctx);
 assert.equal(lvl,'high','demo '+name);console.log('OK demo',name,lvl);
}
const marked=vm.runInContext("highlight('<b>Pošli</b> peníze ihned', classify('<b>Pošli</b> peníze ihned').found)",ctx);
assert.ok(!marked.includes('<b>')&&marked.includes('&lt;b&gt;')&&marked.includes('<mark>'),'highlight escapes input and marks signals');
console.log('OK highlight escapes and marks');
const steps=vm.runInContext("nextSteps(classify(demoExamples.parcel))",ctx);
assert.ok(steps.length>=3&&steps.some(x=>/odkaz/.test(x))&&steps.some(x=>/banku/.test(x)),'parcel steps');
const lowSteps=vm.runInContext("nextSteps(classify('Hezký den.'))",ctx);
assert.ok(lowSteps.every(x=>!/bezpečn[áý]\b/.test(x)),'no safety claim');console.log('OK next steps');
const sanitized = vm.runInContext("esc('<script>\"&</script>')",ctx);
assert.equal(sanitized,'&lt;script&gt;&quot;&amp;&lt;/script&gt;');
assert.ok(!/XMLHttpRequest|api\.openai\.com|sk-[A-Za-z0-9]/.test(source),'No direct provider call or key in client');
assert.equal((source.match(/fetch\(/g)||[]).length,3,'only availability GET, consented AI analysis and consented follow-up');
assert.ok(/if \(!\$\('aiQuestionAgree'\)\.checked \|\| AI\.questionSnapshot !==/.test(source),'follow-up requires a fresh, content-bound separate consent');
assert.ok(source.includes('questionConsentKey(question)'), 'follow-up consent includes context snapshot');
assert.ok(/if \(!\$\('aiAgree'\)\.checked\s*\|\|\s*AI\.consentSnapshot === null\s*\|\|\s*AI\.consentSnapshot !== text\)/.test(source),'AI requires explicit consent bound to exact masked text');
const masked=vm.runInContext("maskForAI('Volej +420 777 123 456, účet 19-123456789/0100, kód 482913, jan@seznam.cz')",ctx);
assert.ok(!/777|123456789|482913|seznam/.test(masked),'PII masked before AI: '+masked);
const cfgSrc=require('fs').readFileSync(path.join(__dirname,'..','assets','ai-config.js'),'utf8');
for (const [host,exp] of [['maysterww-droid.github.io',''],['localhost',''],['rodinny-stit-git-feature-ai-analysis-1-x.vercel.app','/api/analyze']]) {
 const c={window:{},location:{hostname:host}};vm.createContext(c);vm.runInContext(cfgSrc,c);
 assert.equal(c.window.RODINNY_STIT_AI.endpoint,exp,'ai-config endpoint for '+host);
}
assert.ok(!/preview|token/i.test(source.replace(/Preview/g,'')),'no preview token handling in client');
console.log('OK escaped excerpts and no external server analysis');


const pilotMarkup=fs.readFileSync(path.join(__dirname,'..','pilot.html'),'utf8');
const stylesheet=fs.readFileSync(path.join(__dirname,'..','assets','style.css'),'utf8');
assert.ok(/id="resultSourceIcon" href="assets\/icons\.svg#i-info"/.test(pilotMarkup),'default source label uses neutral information icon');
assert.ok(/ICONS \+ \(ai \? 'i-cpu' : 'i-info'\)/.test(source),'local source icon is neutral regardless of result risk');
assert.ok(/\.src-badge \.ico\{[^}]*color:#3278bd/.test(stylesheet),'local source badge is blue, not green success');
console.log('OK neutral source icon does not imply a safety verdict');

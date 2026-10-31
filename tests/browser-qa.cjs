// RODINNÝ ŠTÍT · browser QA (Playwright). Run: node tests/browser-qa.cjs [outdir]
// Screens 360/390/430/1440 px, hamburger, demo → result, OCR UI (mocked engine + offline failure), emergency, Back, overflow, links.
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'), out=process.argv[2]||path.join(root,'qa','v09');
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});r.end(d);});}).listen(8788);
const B='http://localhost:8788/';const log=[];const ok=(c,m)=>{log.push((c?'PASS ':'FAIL ')+m);};
(async()=>{fs.mkdirSync(out,{recursive:true});const b=await chromium.launch();
const errs=[];
async function mk(w,h){const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:w>800?1:2,isMobile:w<800,hasTouch:w<800});const pg=await ctx.newPage();
 pg.on('pageerror',e=>errs.push(w+' pageerror '+e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|Failed to load resource/.test(m.text()))errs.push(w+' console '+m.text())});
 pg.on('response',r=>{if(r.status()>=400)errs.push(w+' HTTP '+r.status()+' '+r.url())});return {ctx,pg};}
const overflow=pg=>pg.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
for(const w of [360,390,430,1440]){
 const h=w>800?900:(w===360?780:(w===430?932:844));
 const {ctx,pg}=await mk(w,h);
 await pg.goto(B+'index.html');await pg.waitForLoadState('networkidle');await pg.evaluate(()=>document.fonts.ready);
 ok(await overflow(pg)<=0,`${w} index no horizontal overflow`);
 await pg.screenshot({path:`${out}/index-${w}-1-first-screen.png`});
 await pg.screenshot({path:`${out}/index-${w}-full.png`,fullPage:true});
 // hero photo: loaded, not overly cropped; overlays and all images inside viewport
 const crop=await pg.evaluate(()=>{const i=document.querySelector('.hero-photo');const r=i.getBoundingClientRect();const ir=i.naturalWidth/i.naturalHeight,br=r.width/r.height;return {src:i.complete&&i.naturalWidth>0?i.currentSrc.split('/').pop():'',lost:Math.abs(1-Math.min(ir,br)/Math.max(ir,br))};});
 ok(/^hero-family-(800|1400)\.webp$/.test(crop.src),`${w} hero photo loaded (${crop.src})`);ok(crop.lost<=0.12,`${w} hero photo crop ${(crop.lost*100).toFixed(1)}% <= 12%`);
 const cut=await pg.evaluate(()=>{const vw=document.documentElement.clientWidth,bad=[];const box=document.querySelector('.hero-visual').getBoundingClientRect();for(const el of document.querySelectorAll('.hero-shield,.hand-note,.float-card')){const r=el.getBoundingClientRect();if(r.left<0||r.right>vw+0.5||r.left<box.left-1||r.right>box.right+1||r.top<box.top-40)bad.push(el.className);}for(const el of document.querySelectorAll('main img,main .btn,main h1,main h2')){const r=el.getBoundingClientRect();if(r.width&&(r.left<-0.5||r.right>vw+0.5)&&!el.closest('.phones'))bad.push(el.tagName+'.'+el.className);}return bad;});
 ok(!cut.length,`${w} no cut-off hero overlays/images/buttons ${cut}`);
 // all images loaded
 const broken=await pg.evaluate(()=>[...document.images].filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.src));ok(!broken.length,`${w} index images ok ${broken}`);
 if(w<960){
  await pg.click('[data-menu-btn]');await pg.waitForTimeout(250);
  ok(await pg.isVisible('#mobileMenu'),`${w} hamburger opens menu`);
  ok(await pg.getAttribute('[data-menu-btn]','aria-expanded')==='true',`${w} aria-expanded true`);
  await pg.screenshot({path:`${out}/index-${w}-2-menu.png`});
  await pg.keyboard.press('Escape');ok(!(await pg.isVisible('#mobileMenu')),`${w} Escape closes menu`);
  await pg.click('[data-menu-btn]');await pg.click('#mobileMenu a[href="#pro-koho"]');await pg.waitForTimeout(700);
  ok(!(await pg.isVisible('#mobileMenu')),`${w} menu link closes menu`);
  await pg.screenshot({path:`${out}/index-${w}-3-pro-koho.png`});
  await pg.evaluate(()=>document.querySelector('#ukazka').scrollIntoView());await pg.waitForTimeout(300);
  await pg.screenshot({path:`${out}/index-${w}-4-ukazka.png`});
 } else ok(await pg.isVisible('.nav'),`${w} desktop nav visible`);
 { // spodní CTA blok s nočním domem
  const cl=pg.locator('.closing');await cl.scrollIntoViewIfNeeded();await pg.waitForFunction(()=>{const i=document.querySelector('.closing-pic img');return i.complete&&i.naturalWidth>0;},null,{timeout:10000});await pg.waitForTimeout(200);
  const info=await pg.evaluate(()=>{const i=document.querySelector('.closing-pic img');const box=document.querySelector('.closing').getBoundingClientRect();const vw=document.documentElement.clientWidth;const bad=[];for(const el of document.querySelectorAll('.closing-in > *')){const r=el.getBoundingClientRect();if(r.left<box.left-0.5||r.right>box.right+0.5||r.bottom>box.bottom+0.5||r.right>vw)bad.push(el.className||el.tagName);}return {src:i.currentSrc.split('/').pop(),bad,inVw:box.left>=0&&box.right<=vw};});
  ok(/^night-home-(800|1600)\.webp$/.test(info.src),`${w} night house photo loaded (${info.src})`);
  ok(!info.bad.length&&info.inVw,`${w} closing block content not cut ${info.bad}`);
  await cl.screenshot({path:`${out}/index-${w}-5-closing.png`});
 }
 // hero CTA
 await pg.goto(B+'index.html');await pg.click('.hero-actions .btn-primary');await pg.waitForURL(/pilot\.html/);ok(true,`${w} hero CTA opens pilot`);
 await pg.waitForLoadState('networkidle');await pg.evaluate(()=>document.fonts.ready);
 ok(await overflow(pg)<=0,`${w} pilot no horizontal overflow`);
 await pg.waitForTimeout(260);await pg.screenshot({path:`${out}/pilot-${w}-1-home.png`});
 if(w===390||w===1440) await pg.screenshot({path:`${out}/pilot-${w}-1-home-full.png`,fullPage:true});
 // empty submit
 await pg.click('text=Zkontrolovat zprávu >> nth=0');ok((await pg.textContent('#aiMode')).includes('Nejdříve'),`${w} empty input warning`);
 // demo bank
 await pg.click('button.row:has-text("Podezřelá SMS od banky")');ok((await pg.inputValue('#msg')).includes('bezpečnostní oddělení'),`${w} demo bank fills textarea`);
 ok((await pg.textContent('#msgCount')).startsWith(String((await pg.inputValue('#msg')).length)),`${w} counter updates`);
 await pg.waitForTimeout(260);await pg.screenshot({path:`${out}/pilot-${w}-2-input-demo.png`});
 await pg.click('#panel-text .btn-primary');await pg.waitForTimeout(250);
 ok(await pg.isVisible('#result'),`${w} result screen shown`);
 ok((await pg.textContent('#resultHeading'))==='Vysoké riziko podvodu',`${w} bank = high risk`);
 const nsig=await pg.locator('#signals .sig').count();ok(nsig>=3,`${w} signals listed (${nsig})`);
 ok((await pg.locator('#nextSteps li').count())>=3,`${w} next steps listed`);
 ok(!/bezpečn[áé] zpráv|je bezpečná\b/i.test(await pg.textContent('#result')),`${w} never claims message is safe`);
 await pg.waitForTimeout(260);await pg.screenshot({path:`${out}/pilot-${w}-3-result.png`});
 await pg.locator('#signals .sig summary').first().click();await pg.click('.msg-view summary');await pg.waitForTimeout(150);
 ok((await pg.locator('#msgMarked mark').count())>0,`${w} highlighted phrases`);
 await pg.waitForTimeout(260);await pg.screenshot({path:`${out}/pilot-${w}-4-result-full.png`,fullPage:true});
 // browser back returns to home and keeps text
 await pg.goBack();await pg.waitForTimeout(200);ok(await pg.isVisible('#home'),`${w} browser Back returns to input`);
 ok((await pg.inputValue('#msg')).length>0,`${w} text kept after Back`);
 await pg.goForward();await pg.waitForTimeout(200);ok(await pg.isVisible('#result'),`${w} Forward returns to result`);
 await pg.click('#verifyBtn');ok(await pg.isVisible('#verify'),`${w} verify screen`);
 await pg.click('button.row:has-text("zpráva byla podvodná")');ok(await pg.isVisible('#done'),`${w} done screen`);
 await pg.click('#done .btn-primary');ok(await pg.isVisible('#home')&&(await pg.inputValue('#msg'))==='',`${w} reset to home`);
 // low-risk text
 await pg.fill('#msg','Dobrý den, porada se koná zítra v deset. Hezký den.');await pg.click('#panel-text .btn-primary');
 ok((await pg.textContent('#resultHeading'))==='Zjevné signály nenalezeny'&&(await pg.textContent('#resultState')).includes('Neznamená to však, že je zpráva bezpečná'),`${w} low result keeps caveat`);
 await pg.waitForTimeout(260);if(w===390) await pg.screenshot({path:`${out}/pilot-${w}-5-result-low.png`});
 await pg.click('#result .text-btn');
 // moderate + XSS
 await pg.fill('#msg','<img src=x onerror=alert(1)> Prosím změňte své heslo.');await pg.click('#panel-text .btn-primary');
 ok((await pg.textContent('#resultHeading'))==='Buďte opatrní',`${w} moderate result`);
 ok((await pg.locator('#result img').count())===0,`${w} user input escaped (no injected img)`);
 await pg.waitForTimeout(260);if(w===390) await pg.screenshot({path:`${out}/pilot-${w}-6-result-moderate.png`});
 await pg.click('#result .text-btn');
 // masking
 await pg.fill('#msg','Volej +420 777 123 456 nebo piš na jan.novak@example.cz, účet 1234567890');
 await pg.click('.tools button:has-text("Telefony")');await pg.click('.tools button:has-text("E-maily")');await pg.click('.tools button:has-text("Dlouhá čísla")');
 const masked=await pg.inputValue('#msg');ok(!/777|example|1234567890/.test(masked),`${w} masking removes phone/email/number: ${masked}`);
 // tabs + keyboard
 await pg.click('#tab-image');ok(await pg.isVisible('#panel-image')&&!(await pg.isVisible('#panel-text')),`${w} image tab`);
 await pg.focus('#tab-image');await pg.keyboard.press('ArrowRight');ok(await pg.isVisible('#panel-call'),`${w} arrow key switches tab`);
 await pg.waitForTimeout(260);if(w===390) await pg.screenshot({path:`${out}/pilot-${w}-7-tab-call.png`});
 await pg.click('#tab-image');
 // OCR UI flow with mocked Tesseract (real CDN not reachable from QA container)
 await pg.setInputFiles('#shot',{name:'sms.png',mimeType:'image/png',buffer:fs.readFileSync(path.join(root,'assets','apple-touch-icon.png'))});
 ok(await pg.isVisible('#shotPreview')&&await pg.isVisible('#ocrBtn'),`${w} screenshot preview + OCR button`);
 await pg.waitForTimeout(260);if(w===390) await pg.screenshot({path:`${out}/pilot-${w}-8-ocr-ready.png`});
 // a) deterministic offline path; GitHub runner may reach public CDN.
 await pg.route('https://cdn.jsdelivr.net/**', route => route.abort());
 await pg.click('#ocrBtn');await pg.waitForFunction(()=>!document.getElementById('ocrBtn').disabled,null,{timeout:20000});
 ok((await pg.textContent('#ocrState')).includes('nezdařilo'),`${w} OCR failure handled when CDN unreachable`);
 // b) mocked engine -> text goes to textarea
 await pg.unroute('https://cdn.jsdelivr.net/**');
 await pg.evaluate(()=>{window.Tesseract={recognize:async(f,l,o)=>{o.logger({status:'recognizing text',progress:.5});if(l!=='ces+eng')throw Error('lang');return {data:{text:'Vaše zásilka je zadržena. Zaplaťte dnes 49 Kč na https://x.invalid'}};}}});
 await pg.click('#ocrBtn');await pg.waitForTimeout(300);
 ok(await pg.isVisible('#panel-text')&&(await pg.inputValue('#msg')).includes('zásilka'),`${w} OCR (ces+eng) text inserted, switched to Text tab`);
 await pg.waitForTimeout(260);if(w===390) await pg.screenshot({path:`${out}/pilot-${w}-9-ocr-done.png`});
 // emergency
 await pg.click('button.row.a:has-text("Už jsem poslal")');ok(await pg.isVisible('#after'),`${w} emergency screen`);
 ok(await pg.locator('#after a[href="tel:158"]').count()===1,`${w} 158 link`);
 await pg.waitForTimeout(260);await pg.screenshot({path:`${out}/pilot-${w}-10-emergency.png`});
 await pg.click('button.row:has-text("Poslal(a) jsem peníze")');ok(await pg.isVisible('#afterMoney'),`${w} money incident`);
 await pg.waitForTimeout(260);if(w===390) await pg.screenshot({path:`${out}/pilot-${w}-11-money.png`,fullPage:true});
 await pg.click('#afterMoney .text-btn');ok(await pg.isVisible('#after'),`${w} incident back`);
 await pg.click('#after .text-btn');ok(await pg.isVisible('#home'),`${w} emergency back -> home`);
 await pg.click('button.row:has-text("Falešný hovor od policie")');ok(await pg.isVisible('#call'),`${w} call screen`);
 await pg.waitForTimeout(260);if(w===390) await pg.screenshot({path:`${out}/pilot-${w}-12-call.png`,fullPage:true});
 await pg.click('#call .text-btn');
 await pg.click('button.row:has-text("Podezřelá reklama")');ok(await pg.isVisible('#ad'),`${w} ad screen`);await pg.click('#ad .text-btn');
 await pg.click('button.row:has-text("naučit")');ok(await pg.isVisible('#training'),`${w} training`);
 await pg.click('#trainChoices button >> nth=0');ok((await pg.textContent('#trainFeedback')).includes('Zkuste'),`${w} wrong answer feedback`);
 await pg.click('#trainChoices button >> nth=1');ok((await pg.textContent('#trainFeedback')).includes('Správně'),`${w} right answer`);
 await pg.waitForTimeout(260);if(w===390) await pg.screenshot({path:`${out}/pilot-${w}-13-training.png`});
 for(let i=0;i<2;i++){await pg.click('#trainFeedback button');await pg.click('#trainChoices button >> nth=1');}
 await pg.click('#trainFeedback button');ok(await pg.isVisible('#home'),`${w} training completes`);
 if(w<960){await pg.click('[data-menu-btn]');await pg.click('#appMenu a[data-go="after"]');ok(await pg.isVisible('#after'),`${w} pilot menu -> after`);}
 // deep link
 await pg.goto(B+'pilot.html#call');ok(await pg.isVisible('#call'),`${w} deep link #call`);
 await ctx.close();
}
// link check
const html=fs.readFileSync(root+'/index.html','utf8')+fs.readFileSync(root+'/pilot.html','utf8')+fs.readFileSync(root+'/assets/app.js','utf8');
const ids=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
const icons=fs.readFileSync(root+'/assets/icons.svg','utf8');
for(const m of new Set([...html.matchAll(/icons\.svg#([\w-]+)/g)].map(m=>m[1])))ok(icons.includes(`id="${m}"`),`icon ${m} exists`);
for(const m of new Set([...fs.readFileSync(root+'/assets/app.js','utf8').matchAll(/icon:'([\w-]+)'/g)].map(m=>m[1])))ok(icons.includes(`id="${m}"`),`rule icon ${m} exists`);
for(const m of new Set([...html.matchAll(/href="#([\w-]+)"/g)].map(m=>m[1])))ok(ids.has(m),`anchor #${m}`);
for(const m of new Set([...html.matchAll(/(?:src|href)="(assets\/[^"#]+)"/g)].map(m=>m[1])))ok(fs.existsSync(root+'/'+m),`asset ${m}`);
console.log(log.filter(l=>l.startsWith('FAIL')).join('\n')||'ALL PASS');console.log(log.length+' checks');console.log(errs.join('\n')||'no JS/HTTP errors');
fs.writeFileSync(out+'/qa-log.txt',log.join('\n')+'\n\nErrors:\n'+(errs.join('\n')||'none')+'\n');
await b.close();srv.close();})().catch(e=>{console.error(e);process.exit(1)});

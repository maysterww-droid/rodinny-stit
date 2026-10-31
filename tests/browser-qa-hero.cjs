// RODINNÝ ŠTÍT 1.1 · QA prvního dojmu pilotu (Praha + telefon + animace). Bez sítě, bez AI volání.
// Spuštění: node tests/browser-qa-hero.cjs [outdir]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const root = path.join(__dirname, '..'), out = process.argv[2] || path.join(root, 'qa', 'pilot-1.1');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8794);
const B = 'http://localhost:8794/pilot.html';
const log = []; const ok = (c, m) => log.push((c ? 'PASS ' : 'FAIL ') + m);
const rect = (pg, sel) => pg.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; }, sel);
const overlap = (a, b) => !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
// skutečné řádky textu (ne šířka bloku)
const textRects = (pg, sel) => pg.evaluate(s => { const r = document.createRange(); r.selectNodeContents(document.querySelector(s)); return [...r.getClientRects()].map(x => ({ l: x.left, r: x.right, t: x.top, b: x.bottom })); }, sel);
// obrys displeje telefonu po 3D natočení (4 rohy obrazovky)
const phoneQuad = pg => pg.evaluate(() => { const r = document.querySelector('.ph-screen').getBoundingClientRect(); return { l: r.left + 6, r: r.right, t: r.top, b: r.bottom }; });

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const errs = [];
  for (const w of [360, 390, 430, 768, 1440]) {
    const vh = w >= 1000 ? 900 : w === 768 ? 1024 : w === 360 ? 780 : w === 430 ? 932 : 844;
    const ctx = await b.newContext({ viewport: { width: w, height: vh }, deviceScaleFactor: w >= 1000 ? 1 : 2, isMobile: w < 1000, hasTouch: w < 1000 });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(w + ' ' + e.message));
    pg.on('response', r => { if (r.status() >= 400) errs.push(w + ' HTTP ' + r.status() + ' ' + r.url()); });
    pg.on('request', r => { if (/openai\.com|\/api\/analyze/.test(r.url()) && r.method() === 'POST') errs.push(w + ' unexpected AI request'); });
    await pg.goto(B);
    ok(await pg.evaluate(() => document.getElementById('pilotHero').classList.contains('play')), `${w} intro animation starts`);
    await pg.waitForTimeout(2600); await pg.evaluate(() => document.fonts.ready);
    ok(await pg.evaluate(() => { const h = document.getElementById('pilotHero'); return h.classList.contains('done') && !h.classList.contains('play'); }), `${w} animation plays once and ends (~2 s)`);
    ok(await pg.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${w} no horizontal scroll`);
    const imgs = await pg.evaluate(() => [...document.querySelectorAll('#home img[src]')].filter(i => i.getAttribute('src') && (!i.complete || i.naturalWidth === 0)).map(i => i.src));
    ok(!imgs.length, `${w} all hero images loaded ${imgs}`);
    ok(await pg.evaluate(() => /prague-(800|1600)\.webp$/.test(document.querySelector('.ph-bg img').currentSrc)), `${w} Prague photo (WebP) used`);
    const dev = await rect(pg, '.ph-device'), h1 = await rect(pg, '#home-title'), lead = await rect(pg, '.ph-lead'), hero = await rect(pg, '#pilotHero');
    ok(dev.l >= 0 && dev.r <= w, `${w} phone fully inside viewport (${Math.round(dev.l)}–${Math.round(dev.r)})`);
    const pq = await phoneQuad(pg); const lines = [...await textRects(pg, '#home-title'), ...await textRects(pg, '.ph-lead')];
    const hit = lines.filter(x => overlap(pq, x)).length;
    ok(hit === 0, `${w} phone does not cover heading or text (${hit} lines touch)`);
    ok(dev.b <= hero.b + 30, `${w} phone not cut by hero bottom`);
    const fsz = await pg.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.ph-bubble')).fontSize));
    ok(fsz >= 10, `${w} SMS on phone readable (${fsz}px)`);
    ok(await pg.evaluate(() => getComputedStyle(document.querySelector('.ph-flag')).opacity === '1'), `${w} suspicious flag visible after scan`);
    ok(/Podezřelé/.test(await pg.textContent('.ph-flag')) && !/bezpečn/i.test(await pg.textContent('.ph-stage')), `${w} scene never says the SMS is safe`);
    ok(parseFloat(await pg.evaluate(() => getComputedStyle(document.querySelector('.ph-lead')).fontSize)) >= 16, `${w} lead text ≥ 16 px`);
    const tabs = await pg.$$eval('.tabs4 .tab', ts => ts.map(t => t.getBoundingClientRect().height));
    ok(tabs.length === 4 && tabs.every(h => h >= 48), `${w} 4 tabs with large tap targets`);
    await pg.screenshot({ path: `${out}/pilot-${w}-first-screen.png` });
    if (w === 390 || w === 1440) await pg.screenshot({ path: `${out}/pilot-${w}-home-full.png`, fullPage: true });

    // vzorové scénáře: jen vloží text, nespustí kontrolu
    await pg.click('[data-demo="newnumber"]'); await pg.waitForTimeout(150);
    ok((await pg.inputValue('#msg')).startsWith('Ahoj mami, mám nové číslo') && await pg.isVisible('#home'), `${w} scenario fills text, no automatic check`);
    ok(await pg.getAttribute('[data-demo="newnumber"]', 'aria-pressed') === 'true', `${w} selected scenario highlighted`);
    await pg.click('[data-demo="bankmail"]'); await pg.waitForTimeout(150);
    ok(await pg.getAttribute('#tab-email', 'aria-selected') === 'true' && (await pg.getAttribute('#msg', 'placeholder')).includes('e-mail'), `${w} bank e-mail scenario switches to E-mail tab`);
    ok(await pg.getAttribute('[data-demo="newnumber"]', 'aria-pressed') === 'false', `${w} only one scenario pressed`);
    if (w === 390) await pg.screenshot({ path: `${out}/pilot-${w}-scenario-selected.png` });
    await pg.fill('#msg', 'x'); ok(await pg.getAttribute('[data-demo="bankmail"]', 'aria-pressed') === 'false', `${w} editing clears scenario highlight`);
    // lokální kontrola výsledku
    await pg.click('[data-demo="newnumber"]'); await pg.click('#analyzeBtn'); await pg.waitForTimeout(250);
    ok(await pg.isVisible('#result') && (await pg.textContent('#resultHeading')) === 'Vysoké riziko podvodu' && (await pg.textContent('#resultSourceText')) === 'Kontrola podle lokálních pravidel', `${w} new-number SMS → local high risk`);
    await pg.goBack(); await pg.waitForTimeout(250); ok(await pg.isVisible('#home'), `${w} Back returns to first screen`);
    // záložky klávesnicí
    await pg.focus('#tab-text'); await pg.keyboard.press('ArrowRight');
    ok(await pg.getAttribute('#tab-email', 'aria-selected') === 'true' && await pg.isVisible('#panel-text'), `${w} ArrowRight → E-mail tab`);
    await pg.keyboard.press('ArrowRight'); ok(await pg.isVisible('#panel-image') && !(await pg.isVisible('#panel-text')), `${w} → Obrázek tab (OCR panel)`);
    await pg.keyboard.press('ArrowRight'); ok(await pg.isVisible('#panel-call'), `${w} → Hovor tab`);
    await pg.click('#tab-text');
    // „Zobrazit další“
    await pg.click('#quickMore'); await pg.waitForTimeout(600);
    ok(await pg.isVisible('#home') && await pg.evaluate(() => document.activeElement.id === 'moreScenarios'), `${w} "Zobrazit další" scrolls to more scenarios`);
    // zvětšené písmo systému (simulace 130 %)
    if (w <= 430) {
      await pg.evaluate(() => { document.documentElement.style.zoom = '1.3'; window.scrollTo(0, 0); }); await pg.waitForTimeout(200);
      ok(await pg.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${w} no horizontal scroll at 130 % text zoom`);
      if (w === 390) await pg.screenshot({ path: `${out}/pilot-${w}-zoom130.png` });
    }
    await ctx.close();
  }
  // filmový pás animace (390 px)
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 520 }, deviceScaleFactor: 2, isMobile: true });
    const pg = await ctx.newPage(); await pg.goto(B, { waitUntil: 'domcontentloaded' });
    const t0 = Date.now(); const frames = [];
    for (const t of [80, 400, 800, 1100, 1400, 1700, 2300]) { const wait = t - (Date.now() - t0); if (wait > 0) await pg.waitForTimeout(wait); const f = `${out}/anim-390-${String(t).padStart(4, '0')}ms.png`; await pg.screenshot({ path: f }); frames.push(f); }
    const running = await pg.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length);
    ok(running === 0, `animation finished, no endless animations (${running} running after 2.3 s)`);
    ok(frames.length === 7, 'animation filmstrip captured');
    await ctx.close();
  }
  // reduced motion
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', isMobile: true });
    const pg = await ctx.newPage(); await pg.goto(B); await pg.waitForTimeout(150);
    ok(await pg.evaluate(() => { const h = document.getElementById('pilotHero'); return !h.classList.contains('play') && h.classList.contains('done'); }), 'reduced motion: no intro animation');
    ok(await pg.evaluate(() => document.querySelectorAll('#pilotHero *').length > 0 && [...document.querySelectorAll('#pilotHero *')].every(e => e.getAnimations().filter(a => a.playState === 'running').length === 0)), 'reduced motion: no running animations in scene');
    ok(await pg.evaluate(() => getComputedStyle(document.querySelector('.ph-flag')).opacity === '1' && getComputedStyle(document.querySelector('.ph-bubble')).opacity === '1'), 'reduced motion: final state shown immediately');
    await pg.screenshot({ path: `${out}/pilot-390-reduced-motion.png` });
    await ctx.close();
  }
  await b.close(); srv.close();
  const fails = log.filter(l => l.startsWith('FAIL'));
  console.log(fails.join('\n') || 'ALL PASS'); console.log(log.length + ' checks'); console.log(errs.join('\n') || 'no JS/HTTP errors');
  fs.writeFileSync(out + '/qa-hero-log.txt', log.join('\n') + '\n\nErrors:\n' + (errs.join('\n') || 'none') + '\n');
  process.exit(fails.length || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

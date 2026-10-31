/* RODINNÝ ŠTÍT · klientská aplikace 1.0
 * Výchozí režim: lokální vysvětlitelná pravidla (classify) – text se nikam neodesílá.
 * Volitelně: AI analýza přes vlastní server (/api/analyze), jen pokud server hlásí dostupnost a uživatel výslovně souhlasí.
 * Žádný účet, žádná analytika, žádné ukládání vložených zpráv. OCR = Tesseract.js v prohlížeči, obrázky se nikdy neodesílají.
 */
'use strict';
const $ = id => document.getElementById(id);
const HAS_DOM = typeof document.addEventListener === 'function';
const ICONS = 'assets/icons.svg#';
const icon = (name, cls = 'ico') => `<svg class="${cls}" aria-hidden="true"><use href="${ICONS}${name}"/></svg>`;
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---------- navigace mezi obrazovkami (s podporou tlačítka Zpět v prohlížeči) ---------- */
const screens = [...document.querySelectorAll('#app > section')];
function show(id, focus = true) {
  const screen = $(id);
  if (!screen) return false;
  for (const s of screens) s.classList.toggle('active', s === screen);
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (focus && screen.focus) screen.focus({ preventScroll: true });
  return true;
}
let navDepth = 0;
const cameFrom = {};
const CHILDREN = { afterMoney: 'after', afterAccess: 'after', afterSoftware: 'after', verify: 'result', done: 'verify' };
function go(id) {
  const cur = screens.find(s => s.classList.contains('active'));
  if (cur && cur.id !== id && CHILDREN[cur.id] !== id && !(id in CHILDREN)) cameFrom[id] = cur.id;
  if (!show(id)) return;
  if (HAS_DOM && location.hash !== '#' + id) { history.pushState({ screen: id, depth: ++navDepth }, '', '#' + id); }
}
function goBack() { const cur = screens.find(s => s.classList.contains('active')); go((cur && cameFrom[cur.id]) || 'home'); }
function startMessage() { go('home'); selectTab('text'); setTimeout(() => $('msg').focus(), 30); }
function startCall() { go('call'); }
function startAd() { go('ad'); }

/* ---------- záložky Text / Obrázek / Hovor ---------- */
function selectTab(name, focusTab) {
  for (const t of document.querySelectorAll('[data-tab]')) {
    const on = t.dataset.tab === name;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    $(t.getAttribute('aria-controls')).hidden = !on;
    if (on && focusTab) t.focus();
  }
}

/* ---------- ukázkové (smyšlené) zprávy ---------- */
const demoExamples = {
  relative: 'Ahoj mami, mám nové číslo, starý telefon se rozbil. Potřebuji urgentně poslat 12 500 Kč na tento účet. Teď mi prosím nevolej, jsem na schůzce. Napiš, až peníze pošleš.',
  bank: 'Dobrý den, tady bezpečnostní oddělení banky. Váš účet bude za 10 minut zablokován. Okamžitě nám sdělte ověřovací kód z SMS a nainstalujte aplikaci pro vzdálený přístup.',
  parcel: 'Česká pošta: Vaše zásilka je zadržena. Dnes zaplaťte 49 Kč za doručení na https://priklad-zasilky.invalid, jinak balík vrátíme odesílateli.',
  invest: 'Gratulujeme! Byli jste vybráni do investičního programu s garantovaným výnosem 30 % měsíčně. Zbývají poslední 2 místa – vložte 5 000 Kč ještě dnes přes www.rychly-vynos.invalid.'
};
function demo(name = 'relative') {
  $('msg').value = demoExamples[name] || demoExamples.relative;
  updateCount();
  go('home'); selectTab('text');
  setMode('', 'Vložena <b>smyšlená ukázka</b>. Stiskněte „Zkontrolovat zprávu“. Kontrola proběhne lokálně podle pravidel, bez AI serveru.');
  $('msg').focus();
  $('msg').scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function updateCount() { const m = $('msg'); $('msgCount').textContent = `${m.value.length}/${m.maxLength}`; }

/* ---------- snímek obrazovky + OCR ---------- */
let currentShot = null, shotUrl = null, tessPromise = null;
function loadShot(e) {
  const file = e.target.files?.[0]; const b = $('ocrBtn'), img = $('shotPreview');
  if (shotUrl) { URL.revokeObjectURL(shotUrl); shotUrl = null; }
  currentShot = null; img.classList.add('hidden'); b.classList.add('hidden'); $('ocrState').classList.add('hidden'); $('ocrProgress').classList.add('hidden');
  if (!file) return;
  if (!file.type.startsWith('image/')) { setOCR('danger', 'Vyberte obrazový soubor, nebo text zprávy vložte ručně.'); return; }
  if (file.size > 8 * 1024 * 1024) { setOCR('warn', 'Obrázek je příliš velký. Použijte soubor do 8 MB.'); return; }
  currentShot = file; shotUrl = URL.createObjectURL(file); img.src = shotUrl; img.classList.remove('hidden'); b.classList.remove('hidden');
  setOCR('', 'Snímek je připraven. Stiskněte „Rozpoznat text z obrázku“. Obrázek zůstává ve vašem prohlížeči.');
}
function setOCR(kind, message) { const e = $('ocrState'); e.className = 'status ' + kind; e.textContent = message; }
function setProgress(p) { const bar = $('ocrProgress'); bar.classList.remove('hidden'); bar.firstElementChild.style.width = Math.round(p * 100) + '%'; }
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tessPromise) tessPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(Error('OCR unavailable'));
    s.onerror = () => { tessPromise = null; reject(Error('OCR unavailable')); };
    document.head.appendChild(s);
  });
  return tessPromise;
}
async function runOCR() {
  if (!currentShot) return;
  const btn = $('ocrBtn'); btn.disabled = true; btn.lastChild.textContent = 'Rozpoznávám…';
  setOCR('', 'Načítám rozpoznávání textu. Při prvním použití se stahují jazyková data (čeština a angličtina).'); setProgress(0.02);
  try {
    const T = await loadTesseract();
    const result = await T.recognize(currentShot, 'ces+eng', { logger: m => {
      if (m.status === 'recognizing text' && Number.isFinite(m.progress)) { setProgress(m.progress); setOCR('', `Rozpoznávání: ${Math.round(m.progress * 100)} % · obrázek se zpracovává ve vašem prohlížeči.`); }
    } });
    const value = String(result?.data?.text || '').trim().slice(0, 5000);
    if (!value) { setOCR('warn', 'Text se nepodařilo přečíst. Zkuste ostřejší snímek, nebo zprávu přepište ručně.'); return; }
    $('msg').value = value; updateCount(); setProgress(1);
    selectTab('text');
    setMode('good', 'Text ze snímku byl rozpoznán. <b>Zkontrolujte chyby</b>, případně skryjte osobní údaje, a pak stiskněte „Zkontrolovat zprávu“.');
    $('msg').focus();
  } catch (e) {
    setOCR('warn', 'Rozpoznávání se nezdařilo (např. bez připojení k internetu). Zkuste to znovu, nebo text vložte ručně.');
  } finally { btn.disabled = false; btn.lastChild.textContent = 'Rozpoznat text znovu'; }
}

/* ---------- anonymizace ---------- */
function maskPhones() { const e = $('msg'); e.value = e.value.replace(/(?:\+?\d[\d ()-]{7,}\d)/g, '[SKRYTÉ TELEFONNÍ ČÍSLO]'); updateCount(); }
function maskEmails() { const e = $('msg'); e.value = e.value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[SKRYTÝ E-MAIL]'); updateCount(); }
function maskNumbers() { const e = $('msg'); e.value = e.value.replace(/\b\d{8,}\b/g, '[SKRYTÉ ČÍSLO]'); updateCount(); }

/* ---------- pravidla (beze změny logiky z verze 0.8) ---------- */
const SIGNS = [
 {id:'pressure',icon:'i-clock',name:'Časový nátlak',detail:'Zpráva vás nutí jednat rychle a bez přemýšlení.',pattern:/(?:ihned|okamžitě|urgentn|spěchá|spěchejte|rychle|do \d+ minut|za \d+ minut|dnes|hned|pospěš|neodkladně|nejpozději|teď hned|time limit)/i},
 {id:'money',icon:'i-cash',name:'Požadavek na peníze',detail:'Ve zprávě se žádá platba, převod nebo finanční údaje.',pattern:/(?:pošli|poslat|pošlete|převeď|převod|platbu|zaplať|zaplatit|uhrad|peníze|částku|bankovní účet|\d[\d ]{0,10}\s*(?:kč|czk|eur|€))/i},
 {id:'newContact',icon:'i-phone',name:'Nové kontaktní číslo',detail:'Odesílatel tvrdí, že změnil telefon nebo způsob kontaktu.',pattern:/(?:nové číslo|nový telefon|starý telefon|rozbil|ztratil.*telefon|jiného čísla|new number)/i},
 {id:'access',icon:'i-key',name:'Žádost o kód nebo heslo',detail:'Banka ani úřad po vás nikdy nechtějí kód z SMS ani heslo.',pattern:/(?:pin|heslo|ověřovací kód|jednorázov[ýé]|přihlašovac[íi]|sdělte.*kód|pošlete.*kód|přístupový kód|sms kód)/i},
 {id:'install',icon:'i-monitor',name:'Vzdálený přístup',detail:'Požadavek na instalaci programu nebo přístup k zařízení.',pattern:/(?:nainstaluj|instaluj|aplikaci pro|vzdálený přístup|anydesk|teamviewer|remote access|sdílení obrazovky)/i},
 {id:'secrecy',icon:'i-eyeoff',name:'Brání ověření',detail:'Zpráva odrazuje od zavolání nebo nezávislé kontroly.',pattern:/(?:nevolej|nevolat|nikomu neříkej|nikomu to neříkej|tajné|teď nemohu mluvit|neptej se|jenom mi věř)/i},
 {id:'authority',icon:'i-bank',name:'Vydávání se za autoritu',detail:'Odesílatel se odvolává na banku, policii, úřad nebo dopravce.',pattern:/(?:bezpečnostní oddělení|policie|kriminální|banka|banky|finanční úřad|česká pošta|zásilka|kurýr|podpora účtu|zablokován|zablokujeme)/i},
 {id:'link',icon:'i-link',name:'Odkaz ve zprávě',detail:'Odkaz neprokazuje, že jde o oficiální web. Adresa může být podvržená.',pattern:/(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:cz|com|eu|net|info|sk)\b)/i},
 {id:'investment',icon:'i-chart-up',name:'Nerealistický příslib',detail:'Zaručený výdělek či výhra bývají manipulační návnadou.',pattern:/(?:garantovan[ýá]|zaručen[ýá]|bez rizika|investi[čc]|výhra|vyděláte|výnos|bitcoin|kryptoměn)/i}
];
function classify(text) {
  const found = SIGNS.map(rule => { const m = text.match(rule.pattern); return m ? { ...rule, example: m[0] } : null; }).filter(Boolean);
  const ids = new Set(found.map(x => x.id)); const has = x => ids.has(x);
  const urgent = has('pressure') || has('secrecy');
  let level = 'low';
  if ((has('money') && (urgent || has('newContact') || has('authority') || has('link') || has('investment'))) ||
      ((has('access') || has('install')) && (urgent || has('authority') || has('link'))) ||
      (has('investment') && has('pressure'))) level = 'high';
  else if (found.length) level = 'moderate';
  let action = 'Zprávu berte s obvyklou opatrností. Pokud v ní někdo později požádá o platbu nebo přístupové údaje, situaci ověřte samostatně.';
  if (has('access') || has('install')) action = 'Nikomu nesdělujte kód ani heslo a neinstalujte software na žádost neznámého člověka. Otevřete oficiální službu sami nebo ji kontaktujte přes známé číslo.';
  else if (has('money')) action = 'Zatím nic neposílejte. Ověřte totožnost a samotnou žádost zavoláním na původní známé číslo nebo přes oficiální aplikaci.';
  else if (has('link')) action = 'Na odkaz zatím neklikejte. Pokud si chcete službu ověřit, její adresu zadejte sami nebo použijte již známou oficiální aplikaci.';
  else if (found.length) action = 'Nejednejte pod tlakem a ověřte odesílatele nezávisle. Nezapomeňte, že vzhled zprávy ani jméno odesílatele nejsou důkazem pravosti.';
  return { level, found, action };
}

/* Konkrétní kroky podle nalezených signálů */
function nextSteps(data) {
  const ids = new Set(data.found.map(x => x.id)); const has = x => ids.has(x); const out = [];
  if (has('link')) out.push('<b>Neotvírejte odkaz</b> a nic na něm nevyplňujte.');
  if (has('access') || has('install')) out.push('<b>Nesdělujte žádné kódy ani hesla</b> a nic neinstalujte.');
  if (has('money') || has('investment')) out.push('<b>Neposílejte peníze</b>, dokud žádost nezávisle neověříte.');
  if (has('newContact') || has('secrecy')) out.push('Zavolejte blízkému na <b>původní, dříve uložené číslo</b>.');
  if (has('authority')) out.push('Instituci kontaktujte <b>sami</b> – přes oficiální aplikaci nebo číslo z karty či webu.');
  if (has('pressure') && out.length < 4) out.push('Nenechte se uspěchat. <b>Na rozhodnutí máte čas.</b>');
  if (!out.length) out.push('Pokud zpráva později požádá o platbu, kód nebo instalaci, <b>zastavte se a ověřte ji</b>.', 'Odesílatele ověřte přes kontakt, který znáte odjinud.');
  if (data.level !== 'low') out.push('Pokud jste už zadali údaje nebo platili, <b>ihned kontaktujte svou banku</b>.');
  return out.slice(0, 5);
}

/* Zvýraznění nalezených výrazů – vše escapováno, žádný HTML vstup od uživatele */
function highlight(text, found) {
  const ranges = [];
  for (const rule of found) {
    const re = new RegExp(rule.pattern.source, 'gi'); let m, guard = 0;
    while ((m = re.exec(text)) && guard++ < 50) { if (!m[0]) { re.lastIndex++; continue; } ranges.push([m.index, m.index + m[0].length]); }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let html = '', pos = 0;
  for (const [s, e] of ranges) { if (e <= pos) continue; const st = Math.max(s, pos); html += esc(text.slice(pos, st)) + '<mark>' + esc(text.slice(st, e)) + '</mark>'; pos = e; }
  return html + esc(text.slice(pos));
}

let lastResult = null;
function analyze() {
  const text = $('msg').value.trim();
  if (!text) { $('msg').focus(); setMode('warn', 'Nejdříve vložte text zprávy, nebo vyberte jeden z ukázkových scénářů níže.'); return; }
  if (AI.available && aiSelected()) return analyzeWithAI(text);
  analyzeLocal(text);
}
function analyzeLocal(text = $('msg').value.trim()) {
  if (!text) return;
  const data = classify(text); lastResult = data; renderResult(data, text); setSource('local'); go('result');
}

/* ================= AI analýza (volitelná, pilotní) =================
 * Zobrazí se jen tehdy, když server hlásí dostupnost. Výchozí je vždy režim lokálních pravidel.
 * Odesílá se jen text (nikdy obrázek), po automatickém skrytí osobních údajů a po výslovném souhlasu. */
const AI = { endpoint: '', available: false, maxChars: 3000, ctl: null };
const AI_ERRORS = {
  consent_required: 'Pro AI analýzu je potřeba zaškrtnout souhlas s odesláním textu.',
  too_long: 'Text je pro AI analýzu příliš dlouhý (max. 3 000 znaků). Zkraťte ho, nebo použijte lokální pravidla.',
  empty_text: 'Nejdříve vložte text zprávy.',
  quota_user: 'Dosáhli jste limitu AI analýz pro tuto chvíli. Zkuste to později, nebo použijte lokální pravidla.',
  quota_global: 'Denní limit AI analýz pilotu je vyčerpán. Použijte prosím lokální pravidla.',
  quota_budget: 'Denní rozpočet pilotní AI analýzy je vyčerpán. Použijte prosím lokální pravidla.',
  ai_busy: 'Služba AI je právě přetížená. Zkuste to za chvíli, nebo použijte lokální pravidla.',
  ai_timeout: 'AI analýza trvala příliš dlouho a byla přerušena.',
  ai_unavailable: 'AI analýza je momentálně vypnutá nebo nedostupná.',
  origin_required: 'Požadavek byl odmítnut z bezpečnostních důvodů.',
  origin_not_allowed: 'Požadavek byl odmítnut z bezpečnostních důvodů.',
  offline: 'Nepodařilo se spojit se serverem (jste offline, nebo je služba nedostupná).',
  cancelled: 'AI analýzu jste zrušili. Nic dalšího se neodeslalo.'
};
function aiSelected() { const r = document.querySelector('input[name="checkMode"]:checked'); return !!r && r.value === 'ai'; }
/** Automatické skrytí osobních údajů před odesláním (uživatel vidí náhled). */
function maskForAI(t) {
  return String(t)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[SKRYTÝ E-MAIL]')
    .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/g, '[SKRYTÝ IBAN]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[SKRYTÉ ČÍSLO]')
    .replace(/\b\d{0,6}-?\d{2,10}\/\d{4}\b/g, '[SKRYTÝ ÚČET]')
    .replace(/(?:\+?\d[\d ()-]{7,}\d)/g, '[SKRYTÉ TELEFONNÍ ČÍSLO]')
    .replace(/\b(kód|kod|pin|heslo|code)(\s*[:je]*\s*)([A-Z0-9]{4,10})\b/gi, '$1$2[SKRYTÝ KÓD]')
    .replace(/\b\d{8,}\b/g, '[SKRYTÉ ČÍSLO]');
}
function updateAiPreview() {
  if (!AI.available) return;
  const masked = maskForAI($('msg').value.trim());
  $('aiPreview').textContent = masked || '(zatím prázdné)';
}
function syncAiUi() {
  const ai = aiSelected();
  $('aiConsentBox').hidden = !ai;
  if (!ai) $('aiAgree').checked = false; // přepnutím zpět se souhlas odvolá
  $('analyzeBtn').lastChild.textContent = ai ? 'Zkontrolovat pomocí AI' : 'Zkontrolovat zprávu';
  setMode('', ai ? 'Režim <b>AI analýza (pilotní)</b>: výsledek je pravděpodobnostní a může se mýlit. Kdykoli se můžete vrátit k lokálním pravidlům.'
                 : 'Kontrola proběhne <b>lokálně ve vašem prohlížeči</b> podle pravidel. Text se nikam neodesílá. Nevkládejte hesla, PIN ani kódy.');
  updateAiPreview();
}
function aiError(code) {
  const msg = AI_ERRORS[code] || 'AI analýza se nezdařila.';
  const el = $('aiMode'); el.className = 'mode warn';
  el.innerHTML = icon('i-alert') + `<span>${esc(msg)} <button type="button" class="chip" id="fallbackLocal" style="margin-top:8px">Zkontrolovat lokálními pravidly</button></span>`;
  $('fallbackLocal').addEventListener('click', () => analyzeLocal());
}
function setBusy(b) {
  const btn = $('analyzeBtn'); btn.disabled = b; btn.lastChild.textContent = b ? 'Analyzuji pomocí AI…' : (aiSelected() ? 'Zkontrolovat pomocí AI' : 'Zkontrolovat zprávu');
  $('cancelAiBtn').classList.toggle('hidden', !b);
}
function cancelAi() { if (AI.ctl) AI.ctl.abort('user'); }
async function analyzeWithAI(rawText) {
  if (!$('aiAgree').checked) { aiError('consent_required'); $('aiAgree').focus(); return; }
  const text = maskForAI(rawText);
  if (text.length > AI.maxChars) { aiError('too_long'); return; }
  AI.ctl = new AbortController(); let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; AI.ctl.abort('timeout'); }, 25000);
  setBusy(true); setMode('', 'Odesílám upravený text k AI analýze…');
  try {
    // same-origin: na chráněném Vercel Preview se posílá i přihlašovací cookie Deployment Protection
    const r = await fetch(AI.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, language: 'cs', consent: true }), signal: AI.ctl.signal, credentials: 'same-origin' });
    let data = null; try { data = await r.json(); } catch { /* ignorovat */ }
    if (!r.ok || !data || !data.ok || data.mode !== 'ai' || !data.result) return aiError((data && data.error) || 'ai_failed');
    lastResult = { kind: 'ai', ...data.result, model: String(data.model || '') };
    renderAiResult(lastResult, text); setSource('ai', lastResult.model); go('result');
    syncAiUi();
  } catch (e) {
    aiError(timedOut ? 'ai_timeout' : AI.ctl.signal.aborted ? 'cancelled' : 'offline');
  } finally { clearTimeout(timer); AI.ctl = null; setBusy(false); }
}
const AI_LEVELS = {
  high: { cls: 'high', icon: 'i-alert', title: 'Vysoké riziko podvodu', sr: 'AI odhad rizika: vysoké.' },
  moderate: { cls: 'moderate', icon: 'i-alert', title: 'Buďte opatrní', sr: 'AI odhad rizika: zvýšené.' },
  uncertain: { cls: 'low', icon: 'i-info', title: 'Nejednoznačný výsledek', sr: 'AI odhad rizika: nejistý, bez záruky bezpečnosti.' }
};
function renderAiResult(r, sentText) {
  const L = AI_LEVELS[r.risk] || AI_LEVELS.uncertain;
  $('resultRisk').className = 'risk ' + L.cls;
  $('riskIcon').setAttribute('href', ICONS + L.icon);
  $('resultHeading').textContent = L.title;
  $('resultState').textContent = r.risk === 'uncertain' ? 'AI nenašla jednoznačné znaky podvodu. To však neznamená, že je zpráva bezpečná.' : 'Odhad jazykového modelu na základě textu zprávy. Nejednejte, dokud situaci nezávisle neověříte.';
  $('riskLevelText').textContent = L.sr;
  $('aiExplain').textContent = r.explanation_cs || ''; $('aiExplain').classList.toggle('hidden', !r.explanation_cs);
  $('signalsHead').textContent = r.warning_signals.length ? 'Co v této zprávě vzbuzuje podezření?' : 'Co AI zkontrolovala';
  const tone = r.risk === 'high' ? 'red' : r.risk === 'moderate' ? 'amber' : '';
  $('signals').innerHTML = r.warning_signals.length
    ? r.warning_signals.map(x => `<details class="sig"><summary><span class="round ${tone}">${icon('i-alert')}</span><span class="row-t"><b>${esc(x.name_cs)}</b><small>${esc(x.explanation_cs)}</small></span>${icon('i-chevron')}</summary><div class="sig-body">${x.excerpt ? 'Ve zprávě:<q>' + esc(x.excerpt) + '</q>' : 'Bez konkrétní citace.'}</div></details>`).join('')
    : `<div class="sig"><div style="display:flex;gap:12px;padding:12px;align-items:center"><span class="round">${icon('i-info')}</span><span class="row-t"><b>Bez jednoznačných signálů</b><small>${esc(r.uncertainty_cs || 'Model mohl něco přehlédnout.')}</small></span></div></div>`;
  $('msgMarked').innerHTML = highlightExcerpts(sentText, r.warning_signals.map(x => x.excerpt));
  $('nextSteps').innerHTML = r.recommended_steps.map(x => `<li><span>${esc(x)}</span></li>`).join('');
  $('resultAction').textContent = r.recommended_steps.join(' ');
  $('verifyBtn').style.display = r.risk === 'uncertain' ? 'none' : '';
  $('resultNote').textContent = 'Výsledek vytvořil jazykový model v pilotním režimu. Je pravděpodobnostní, může se mýlit, neověřuje odesílatele, odkazy ani účty a není zárukou bezpečnosti. ' + (r.uncertainty_cs || '');
  $('shareState').classList.add('hidden');
}
function highlightExcerpts(text, excerpts) {
  const found = excerpts.filter(e => e && e.length >= 3).map(e => ({ pattern: new RegExp(e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }));
  return highlight(text, found);
}
function setSource(kind, model = '') {
  const ai = kind === 'ai';
  $('resultSource').className = 'src-badge' + (ai ? ' ai' : '');
  $('resultSourceIcon').setAttribute('href', ICONS + (ai ? 'i-cpu' : 'i-shield'));
  $('resultSourceText').textContent = ai ? 'AI analýza (pilotní)' + (/mock|simul/i.test(model) ? ' · TESTOVACÍ REŽIM se simulovaným modelem' : '') : 'Kontrola podle lokálních pravidel';
  if (!ai) { $('aiExplain').classList.add('hidden'); $('resultNote').textContent = 'Výsledek pochází z lokálních orientačních pravidel v prohlížeči, nikoli z AI modelu ani databáze podvodů. Neověřuje odesílatele a není zárukou bezpečnosti.'; }
}
async function initAI() {
  const cfg = window.RODINNY_STIT_AI || {};
  AI.endpoint = typeof cfg.endpoint === 'string' ? cfg.endpoint : '';
  if (!AI.endpoint) return;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(AI.endpoint, { method: 'GET', signal: ctl.signal, credentials: 'same-origin' });
    const d = await r.json();
    if (r.ok && d && d.ok && d.ai === true) {
      AI.available = true; AI.maxChars = Number(d.maxChars) || 3000;
      $('aiBox').hidden = false;
      for (const radio of document.querySelectorAll('input[name="checkMode"]')) radio.addEventListener('change', syncAiUi);
      $('msg').addEventListener('input', updateAiPreview);
      syncAiUi();
    }
  } catch { /* AI zůstane skrytá – pilot funguje lokálně */ } finally { clearTimeout(t); }
}
function setMode(kind, html) { const el = $('aiMode'); el.className = 'mode ' + kind; el.innerHTML = icon(kind === 'warn' ? 'i-alert' : 'i-info') + '<span>' + html + '</span>'; }

const LEVELS = {
  high: { cls: 'high', icon: 'i-alert', title: 'Vysoké riziko podvodu', sub: 'Tato zpráva obsahuje několik varovných signálů typických pro podvodné praktiky. Nejednejte, dokud ji nezávisle neověříte.', sr: 'Úroveň rizika: vysoká (3 ze 3).' },
  moderate: { cls: 'moderate', icon: 'i-alert', title: 'Buďte opatrní', sub: 'Našli jsme některé varovné znaky. K jistému závěru nemáme dost informací – situaci raději ověřte.', sr: 'Úroveň rizika: zvýšená (2 ze 3).' },
  low: { cls: 'low', icon: 'i-info', title: 'Zjevné signály nenalezeny', sub: 'Naše jednoduchá pravidla v textu nic nenašla. Neznamená to však, že je zpráva bezpečná.', sr: 'Úroveň rizika: bez zjevných signálů (1 ze 3), bez záruky bezpečnosti.' }
};
function renderResult(data, text = '') {
  const L = LEVELS[data.level];
  $('resultRisk').className = 'risk ' + L.cls;
  $('riskIcon').setAttribute('href', ICONS + L.icon);
  $('resultHeading').textContent = L.title; $('resultState').textContent = L.sub; $('riskLevelText').textContent = L.sr;
  $('signalsHead').textContent = data.found.length ? 'Co v této zprávě vzbuzuje podezření?' : 'Co jsme kontrolovali';
  const tone = data.level === 'high' ? 'red' : data.level === 'moderate' ? 'amber' : '';
  $('signals').innerHTML = data.found.length
    ? data.found.slice(0, 6).map(x => `<details class="sig"><summary><span class="round ${tone}">${icon(x.icon)}</span><span class="row-t"><b>${esc(x.name)}</b><small>${esc(x.detail)}</small></span>${icon('i-chevron')}</summary><div class="sig-body">Ve zprávě:<q>${esc(x.example.slice(0, 100))}</q></div></details>`).join('')
    : `<div class="sig"><div style="display:flex;gap:12px;padding:12px;align-items:center"><span class="round">${icon('i-info')}</span><span class="row-t"><b>Bez rozpoznaných signálů</b><small>Pravidla hledají spěch, peníze, kódy, odkazy, falešnou autoritu a další znaky. Nový typ útoku mohou přehlédnout.</small></span></div></div>`;
  $('msgMarked').innerHTML = highlight(text, data.found);
  $('nextSteps').innerHTML = nextSteps(data).map(s => `<li><span>${s}</span></li>`).join('');
  $('resultAction').textContent = data.action;
  $('verifyBtn').style.display = data.level === 'low' ? 'none' : '';
  $('shareState').classList.add('hidden');
}
async function shareResult() {
  if (!lastResult) return;
  let body;
  if (lastResult.kind === 'ai') {
    const L = AI_LEVELS[lastResult.risk] || AI_LEVELS.uncertain;
    body = `RODINNÝ ŠTÍT – ${L.title}\n` + (lastResult.warning_signals.length ? 'Varovné signály: ' + lastResult.warning_signals.map(x => x.name_cs).join(', ') + '\n' : '') +
      'Doporučení: ' + lastResult.recommended_steps.join(' ') + '\n(Pilotní AI analýza – pravděpodobnostní odhad, bez záruky bezpečnosti.)';
  } else {
    const L = LEVELS[lastResult.level];
    body = `RODINNÝ ŠTÍT – ${L.title}\n` + (lastResult.found.length ? 'Varovné signály: ' + lastResult.found.map(x => x.name).join(', ') + '\n' : '') +
      'Doporučení: ' + nextSteps(lastResult).map(s => s.replace(/<[^>]+>/g, '')).join(' ') + '\n(Orientační kontrola podle pravidel, bez záruky bezpečnosti.)';
  }
  const st = $('shareState');
  try {
    if (navigator.share) { await navigator.share({ title: 'RODINNÝ ŠTÍT', text: body }); return; }
    await navigator.clipboard.writeText(body);
    st.className = 'status good'; st.textContent = 'Doporučení (bez textu zprávy) bylo zkopírováno – můžete ho poslat blízkým.';
  } catch (e) { if (e && e.name === 'AbortError') return; st.className = 'status warn'; st.textContent = 'Sdílení se nepodařilo. Doporučení si můžete opsat.'; }
}
function verified(real) {
  $('doneTitle').textContent = real ? 'Žádost jste nezávisle ověřili' : 'Dobře, že jste se zastavili';
  $('doneBox').textContent = real ? 'Pokud jste totožnost i konkrétní žádost potvrdili přes dříve známý kanál, můžete se rozhodovat s větší jistotou. Nadále ale postupujte obezřetně.' : 'Zpráva nebyla pravá. Podle původní výzvy nic neposílejte a odesílatele můžete zablokovat. Pokud jste už jednali, otevřete rychlou pomoc.';
  $('doneHelp').classList.toggle('hidden', real);
  go('done');
}
function resetAll() {
  $('msg').value = ''; updateCount(); $('shot').value = ''; $('shotPreview').classList.add('hidden'); $('ocrState').classList.add('hidden'); $('ocrBtn').classList.add('hidden'); $('ocrProgress').classList.add('hidden');
  currentShot = null; if (shotUrl) { URL.revokeObjectURL(shotUrl); shotUrl = null; }
  if (AI.available) { const loc = document.querySelector('input[name="checkMode"][value="local"]'); loc.checked = true; syncAiUi(); }
  else setMode('', 'Kontrola proběhne <b>lokálně ve vašem prohlížeči</b> podle pravidel. Text se nikam neodesílá. Nevkládejte hesla, PIN ani kódy.');
  selectTab('text'); go('home');
}

/* ---------- trénink ---------- */
const trainings = [
 {story:'„Ahoj, tati. Mám nové číslo. Urgentně potřebuji 8 000 Kč. Nevolej mi, teď nemohu mluvit.“',answers:['Poslat alespoň malou částku pro jistotu.','Zavolat dítěti na původní známé číslo.','Zeptat se nového čísla na rodinné tajemství.'],correct:1,ok:'Nezávislé ověření přes dříve známý kontakt je nejbezpečnější.',bad:'To ještě nepotvrzuje totožnost odesílatele. Ověřte ho přes původní známý kontakt.'},
 {story:'„Voláme z banky. Za pět minut zablokujeme váš účet. Sdělte ověřovací SMS kód.“',answers:['Předat kód, když se volající představí jako banka.','Ukončit hovor a otevřít oficiální aplikaci banky.','Požádat volajícího o potvrzení jména.'],correct:1,ok:'Kód neprozrazujeme a banku kontaktujeme sami.',bad:'Totožnost volajícího tím ověřená není. Hovor ukončete a banku kontaktujte sami.'},
 {story:'Reklama: „Garantované výnosy 30 % měsíčně! Investujte hned, zbývají jen dvě místa.“',answers:['Kliknout a přečíst si recenze na uvedeném webu.','Ověřit nabídku mimo reklamní odkaz a neposílat peníze.','Poslat malou částku na zkoušku.'],correct:1,ok:'Nezávislá kontrola neověřené nabídky chrání před manipulací.',bad:'Odkaz i recenze mohou ovládat podvodníci. Nabídku ověřujte nezávisle.'}
];
let trainStep = 0;
function startTraining() { trainStep = 0; renderTraining(); go('training'); }
function renderTraining() {
  const t = trainings[trainStep]; $('trainStepLabel').textContent = `Trénink · ${trainStep + 1} ze ${trainings.length}`;
  $('trainStory').textContent = t.story;
  $('trainChoices').innerHTML = t.answers.map((a, i) => `<button type="button" onclick="trainAnswer(${i})">${esc(a)}</button>`).join('');
  $('trainFeedback').className = 'status hidden'; $('trainFeedback').textContent = '';
  for (let i = 0; i < 3; i++) $('trainDot' + i).className = i <= trainStep ? 'on' : '';
}
function trainAnswer(answer) {
  const data = trainings[trainStep], correct = answer === data.correct;
  const f = $('trainFeedback'); f.className = 'status ' + (correct ? 'good' : 'warn');
  const btns = [...$('trainChoices').querySelectorAll('button')];
  if (!correct) { btns[answer].classList.add('wrong'); f.textContent = 'Zkuste jinou možnost. ' + data.bad; return; }
  btns[answer].classList.add('right');
  f.innerHTML = `<strong>Správně!</strong> ${esc(data.ok)}<br><button class="btn btn-primary" type="button" style="margin-top:12px" onclick="nextTraining()">${trainStep < trainings.length - 1 ? 'Další situace' : 'Dokončit trénink'}</button>`;
  btns.forEach(x => x.disabled = true);
  f.querySelector('button').focus();
}
function nextTraining() { if (trainStep < trainings.length - 1) { trainStep++; renderTraining(); $('trainTitle').focus?.(); } else go('home'); }

/* ---------- inicializace (jen v prohlížeči) ---------- */
if (HAS_DOM) {
  const init = () => {
    $('msg').addEventListener('input', updateCount); updateCount();
    initAI();
    const tabs = [...document.querySelectorAll('[data-tab]')];
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => selectTab(t.dataset.tab));
      t.addEventListener('keydown', e => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
        e.preventDefault(); selectTab(tabs[(i + d + tabs.length) % tabs.length].dataset.tab, true);
      });
    });
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-go]'); if (!a) return;
      e.preventDefault(); const id = a.dataset.go; if (id === 'training') startTraining(); else go(id);
    });
    window.addEventListener('popstate', e => { navDepth = (e.state && e.state.depth) || 0; const id = (e.state && e.state.screen) || location.hash.slice(1) || 'home'; if (id === 'training') renderTraining(); show($(id) ? id : 'home'); });
    const initial = location.hash.slice(1);
    const allowed = ['call', 'ad', 'after', 'afterMoney', 'afterAccess', 'afterSoftware', 'training'];
    if (allowed.includes(initial)) { if (initial === 'training') renderTraining(); show(initial, false); history.replaceState({ screen: initial }, '', '#' + initial); }
    else history.replaceState({ screen: 'home' }, '', location.pathname + location.search);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}
// Záměrně bez service workeru, sledování a ukládání do prohlížeče. AI se volá jen po výslovném souhlasu uživatele.

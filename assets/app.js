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
const PLACEHOLDERS = { text: 'Sem vložte podezřelou SMS nebo zprávu…', email: 'Sem vložte text podezřelého e-mailu (bez příloh)…' };
function selectTab(name, focusTab) {
  const tabs = [...document.querySelectorAll('[data-tab]')];
  const active = tabs.find(t => t.dataset.tab === name) || tabs[0];
  for (const t of tabs) {
    const on = t === active;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (on && focusTab) t.focus();
  }
  // SMS i E-mail sdílejí textový panel
  for (const id of new Set(tabs.map(t => t.getAttribute('aria-controls')))) $(id).hidden = id !== active.getAttribute('aria-controls');
  if (PLACEHOLDERS[active.dataset.tab]) $('msg').placeholder = PLACEHOLDERS[active.dataset.tab];
}

/* ---------- ukázkové (smyšlené) zprávy ---------- */
const demoExamples = {
  relative: 'Ahoj mami, mám nové číslo, starý telefon se rozbil. Potřebuji urgentně poslat 12 500 Kč na tento účet. Teď mi prosím nevolej, jsem na schůzce. Napiš, až peníze pošleš.',
  bank: 'Dobrý den, tady bezpečnostní oddělení banky. Váš účet bude za 10 minut zablokován. Okamžitě nám sdělte ověřovací kód z SMS a nainstalujte aplikaci pro vzdálený přístup.',
  parcel: 'Česká pošta: Vaše zásilka je zadržena. Dnes zaplaťte 49 Kč za doručení na https://priklad-zasilky.invalid, jinak balík vrátíme odesílateli.',
  newnumber: 'Ahoj mami, mám nové číslo. Pošli mi prosím 5000 Kč ještě dnes, potřebuji to hned. Zatím mi nevolej, napíšu ti.',
  bankmail: 'Vážený kliente, zaznamenali jsme neobvyklé přihlášení k Vašemu účtu. Do 24 hodin ověřte své přihlašovací údaje na https://overeni-uctu.invalid, jinak bude účet zablokován. Zákaznická podpora banky',
  invest: 'Gratulujeme! Byli jste vybráni do investičního programu s garantovaným výnosem 30 % měsíčně. Zbývají poslední 2 místa – vložte 5 000 Kč ještě dnes přes www.rychly-vynos.invalid.'
};
function markQuick(name) {
  for (const q of document.querySelectorAll('[data-demo]')) {
    const on = q.dataset.demo === name; q.setAttribute('aria-pressed', String(on));
    q.classList.remove('picked'); if (on) { void q.offsetWidth; q.classList.add('picked'); }
  }
}
function demo(name = 'relative') {
  $('msg').value = demoExamples[name] || demoExamples.relative;
  updateCount(); markQuick(name);
  go('home'); selectTab(name === 'bankmail' ? 'email' : 'text');
  if (AI.available) { const local = document.querySelector('input[name="checkMode"][value="local"]'); if (local) { local.checked = true; syncAiUi(); } }
  setMode('', 'Vložena <b>smyšlená ukázka</b>. Stiskněte „Zkontrolovat zprávu“. Kontrola proběhne lokálně podle pravidel, bez AI serveru.');
  $('msg').focus();
  $('msg').scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function updateCount() { const m = $('msg'); $('msgCount').textContent = `${m.value.length}/${m.maxLength}`; if (AI.available) updateAiPreview(); }

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
 {id:'money',icon:'i-cash',name:'Požadavek na peníze',detail:'Zpráva žádá platbu, převod, finanční dar nebo peníze.',pattern:/(?:pošli|poslat|pošlete|převeď|převod|platbu|zaplať|zaplatit|uhrad|peníze|částku|bankovní účet|půjč|příspěv|finanční dar|dar pro|poplatek|zálohu|poukazy|\d[\d ]{0,10}\s*(?:kč|czk|eur|€))/i},
 {id:'newContact',icon:'i-phone',name:'Nové kontaktní číslo',detail:'Odesílatel tvrdí, že změnil telefon nebo způsob kontaktu.',pattern:/(?:nové číslo|nový telefon|starý telefon|rozbil|ztratil.*telefon|jiného čísla|new number)/i},
 {id:'access',icon:'i-key',name:'Žádost o kód nebo heslo',detail:'Neprozrazujte hesla, přihlašovací kódy, údaje z karty ani obnovovací fráze.',pattern:/(?:\bpin\b|heslo|ověřovací kód|jednorázov[ýé]|přihlašovac[íi]|sdělte.*kód|pošlete.*kód|přístupový kód|sms kód|cvv|číslo platební karty|obnovovací frázi|seed phrase)/i},
 {id:'install',icon:'i-monitor',name:'Vzdálený přístup',detail:'Před instalací nebo sdílením obrazovky nezávisle ověřte, kdo to po vás chce.',pattern:/(?:nainstaluj|nainstalova|nainstalujte|instaluj|aplikaci pro|vzdálený přístup|anydesk|teamviewer|remote access|sdílení obrazovky)/i},
 {id:'secrecy',icon:'i-eyeoff',name:'Brání ověření',detail:'Zpráva odrazuje od zavolání nebo nezávislé kontroly.',pattern:/(?:nevolej|nevolat|nikomu neříkej|nikomu to neříkej|tajné|teď nemohu mluvit|neptej se|jenom mi věř)/i},
 {id:'authority',icon:'i-bank',name:'Vydávání se za autoritu',detail:'Odesílatel se odvolává na banku, policii, úřad nebo dopravce.',pattern:/(?:bezpečnostní oddělení|policie|kriminální|banka|banky|finanční úřad|česká pošta|zásilka|kurýr|podpora účtu|zablokován|zablokujeme)/i},
 {id:'link',icon:'i-link',name:'Odkaz ve zprávě',detail:'Odkaz neprokazuje, že jde o oficiální web. Adresa může být podvržená.',pattern:/(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:cz|com|eu|net|info|sk)\b)/i},
 {id:'accountChange',icon:'i-bank',name:'Změna účtu pro platbu',detail:'Změnu bankovních údajů ověřte mimo tuto zprávu.',pattern:/(?:nov[ýé]\s+(?:bankovní\s+)?úč(?:et|tu)|změn[ayě].{0,20}(?:bankovní\s+)?úč(?:et|tu)|jin[ýé]\s+(?:bankovní\s+)?úč(?:et|tu))/i},
 {id:'threat',icon:'i-alert',name:'Vyhrožování nebo vydírání',detail:'Výhrůžka má vyvolat strach a přimět vás jednat bez ověření.',pattern:/(?:jinak.{0,50}(?:zveřej|odpoj|zruš)|zveřejníme vaše|vydír|vyhrož|budeme vás vydírat)/i},
 {id:'qr',icon:'i-scan',name:'QR kód ve zprávě',detail:'QR kód může vést na neznámý web nebo platbu.',pattern:/(?:qr\s*k[oó]d|naskenuj(?:te)?.{0,10}qr)/i},
 {id:'support',icon:'i-monitor',name:'Údajná technická podpora',detail:'Tvrzení o podpoře samo neověřuje, kdo skutečně píše.',pattern:/(?:technick(?:é|á|ou)\s+podpor(?:a|y|u)|zákaznick(?:á|é)\s+podpor(?:a|y|u)|it\s+podpor(?:a|y|u))/i},
 {id:'accountUpdate',icon:'i-key',name:'Požadavek na ověření účtu',detail:'Ověření účtu provádějte pouze ve službě otevřené vlastní cestou.',pattern:/(?:úč(?:et|tu).{0,50}(?:vyžaduje|potřebuje).{0,30}(?:ověřen|aktualizac)|ověřte.{0,30}úč(?:et|tu)|aktualizac[ií].{0,15}(?:údajů|účtu))/i},
 {id:'investment',icon:'i-chart-up',name:'Nerealistický příslib',detail:'Garance výnosu, výhry nebo výdělků mohou být manipulací.',pattern:/(?:garantovan[ýá]|zaručen[ýá]|bez rizika|investi[čc]|výhr(?:a|u|y|ou)|vyděláte|výnos|bitcoin|kryptoměn)/i}
];
function classifyLegacy(text) {
  // Kontextové filtry pro běžné české zprávy. Samotné slovo není důkaz podvodu.
  // Kombinace nátlaku, žádosti o peníze, kódů a vzdáleného přístupu zůstávají rizikové.
  const moneyContext = /(?:\d[\d ]{0,10}\s*(?:kč|czk|eur|€)|peníze|peněz|platb|částk|účet|bankovní|faktur|převod|invest|příspěv|finanční dar|poplatek|záloh|poukaz|půjč|pokut)/i.test(text);
  const paymentRequest = /(?:pošli|pošlete|poslat|převeď|zaplať|zaplatit|uhrad|investuj|uhraďte|dluž|kupte|kupovat|potřebuj|půjč|prosíme o)/i.test(text);
  const strongContext = moneyContext || /(?:heslo|ověřovací kód|jednorázový kód|nainstaluj|vzdálený přístup|https?:\/\/|www\.)/i.test(text);
  const authorityAction = /(?:zaplať|uhrad|pošli|převeď|sděl|zadej|ověř|klik|zablok|heslo|kód|nainstal|ihned|okamžitě|potřebujeme.{0,60}úč(?:et|tu)|https?:\/\/|www\.)/i.test(text);
  const found = SIGNS.map(rule => {
    const m = text.match(rule.pattern);
    if (!m) return null;
    // "Dnes v 18 přijdu" není časový nátlak.
    if (rule.id === 'pressure' && /^dnes$/i.test(m[0]) && !strongContext) return null;
    // "Pošli mi fotku" ani "převeď soubor" nejsou žádosti o peníze.
    if (rule.id === 'money' && /^(?:pošli|poslat|pošlete|převeď|převod)$/i.test(m[0]) && !moneyContext) return null;
    // Zmínka o částce v běžném vyprávění není žádost o platbu.
    if (rule.id === 'money' && /^\d[\d ]{0,10}\s*(?:kč|czk|eur|€)$/i.test(m[0]) && !paymentRequest) return null;
    // Zmínka o instituci v běžném sdělení není důkaz jejího napodobování.
    if (rule.id === 'authority' && /^(?:banka|banky|policie|finanční úřad|česká pošta|zásilka|kurýr)$/i.test(m[0]) && !authorityAction) return null;
    return { ...rule, example: m[0] };
  }).filter(Boolean);
  const ids = new Set(found.map(x => x.id)); const has = x => ids.has(x);
  const urgent = has('pressure') || has('secrecy');
  let level = 'low';
  const credentialRequest = /\b(?:sdělte|pošlete|přepošlete|nadiktujte|zadejte|vyplňte|pošli|zašlete|přečtěte)\b.{0,100}(?:kód|cvv|heslo|obnovovací|fráz|číslo platební karty|seed)/iu.test(text);
  const remoteControlRequest = has('install') && /(?:anydesk|teamviewer|vzdálený přístup|sdílení obrazovky)/i.test(text);
  if ((has('money') && (urgent || has('newContact') || has('authority') || has('link') || has('investment') || has('accountChange') || has('threat') || (has('qr') && paymentRequest))) ||
      ((has('access') || has('install')) && (urgent || has('authority') || has('link'))) ||
      (has('access') && credentialRequest) || remoteControlRequest ||
      (has('investment') && (has('pressure') || (paymentRequest && /garantovan|zaručen|bez rizika/i.test(text))))) level = 'high';
  else if (found.length) level = 'moderate';
  let action = 'Zprávu berte s obvyklou opatrností. Pokud v ní někdo později požádá o platbu nebo přístupové údaje, situaci ověřte samostatně.';
  if (has('access') || has('install')) action = 'Nikomu nesdělujte kód ani heslo a neinstalujte software na žádost neznámého člověka. Otevřete oficiální službu sami nebo ji kontaktujte přes známé číslo.';
  else if (has('money')) action = 'Zatím nic neposílejte. Ověřte totožnost a samotnou žádost zavoláním na původní známé číslo nebo přes oficiální aplikaci.';
  else if (has('link')) action = 'Na odkaz zatím neklikejte. Pokud si chcete službu ověřit, její adresu zadejte sami nebo použijte již známou oficiální aplikaci.';
  else if (found.length) action = 'Nejednejte pod tlakem a ověřte odesílatele nezávisle. Nezapomeňte, že vzhled zprávy ani jméno odesílatele nejsou důkazem pravosti.';
  return { level, found, action };
}


/* Quality 1.3: independent contextual overlay. Preserve source quotations and local-only processing. */
function classify14(text) {
  const raw = String(text || ''), base = classifyLegacy(raw);
  let fold = '', start = [], end = [], n = 0;
  for (const c of raw) {
    const f = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (let j=0;j<f.length;j++){ start.push(n); end.push(n+c.length); }
    fold += f; n += c.length;
  }
  const is = re => re.test(fold);
  const quote = re => {
    const m = re.exec(fold);
    return m && m[0].length ? raw.slice(start[m.index],end[m.index+m[0].length-1]) : '';
  };
  const money = is(/(?:\b\d[\d ]{0,8}\s*(?:kc|czk|korun|eur)\b|tisic|peniz|penez|uspor|hotovost|zaloha|kauce|poplat|platb|faktur|prevod|invest|vklad|poukaz)/);
  const paying = is(/(?:posli|poslete|preved|zaplat|uhrad|potrebuj|vyberte|predat|predejte|vloz|sloz|kupte|doplat|nejdrive)/);
  const urgent = is(/(?:dnes|hned|ihned|okamzit|rychle|do pulnoci|do vecera|nez|jinak|zablok|odpoj|nevolej|nevolejte|nemohu mluvit|nemuzu volat|telefonovat nemuzu|prijdete|propadne)/);
  const link = is(/(?:https?:\/\/|www\.)/);
  const qr = is(/(?:\bqr\b.{0,16}\bkod|naskenuj.{0,30}\bqr)/);
  const authority = is(/(?:policie|policij|banka|bankovn|financni urad|cnb|bankid|portal obcana|kuryr|posta|operator|urad|nemocnic|lekarn|technicka podpora)/);
  const bankChange = is(/(?:novy.{0,18}ucet|nove.{0,20}udaje|zmenen.{0,25}uctu|jiny ucet|zachrann.{0,12}ucet|bezpecn.{0,12}ucet|bankovni spojeni)/);
  const familyPhone = is(/(?:nove cislo|jineho cisla|nemohu mluvit|telefonovat nemuzu|mobil.{0,18}(?:nefunguje|rozbit|klekn)|nevolej)/);
  const family = is(/(?:mami|maminko|babi|tati|syn|dcera|dite)/);
  const credentials = is(/(?:sd[eě]lte|nadiktuj|preposl|poslete|posli|vypln|zadej|uvedte|fotograf|snimek|send|share).{0,100}(?:\b(?:kod|pin|cvv)\b|hesl|platebni kart|obnovovac|fr[aá]z|udaj)/);
  const remote = is(/(?:anydesk|teamviewer|vzdalen.{0,14}(?:pristup|sprav)|sdileni obrazovky)/) && is(/(?:stahn|nainstal|spust|povol|dejte|otevr)/);
  const cash = is(/(?:vyberte.{0,40}hotovost|predat.{0,30}kuryr|predejte.{0,30}kuryr|kuryr.{0,30}hotovost)/);
  const threat = is(/(?:zverejnime|rozesleme|vydira|soukrom.{0,12}video|z kamery)/) && (money || paying);
  const education = is(/(?:na skoleni|seminar|beseda|v novinach|v clanku|v ucebnici|na kurzu|nikomu neposilejte|nikomu nesdelujte|neposilejte nikomu|nesdelujte nikomu|neklikejte na podvodne)/)
    && !link && !credentials && !(money && paying && urgent);
  const reference = is(/https?:\/\/example\.com/) && is(/(?:recept|pocasi|predpoved)/) && !paying;
  const high = (credentials && !education) || remote || threat || cash && (authority || paying) ||
    money && paying && (urgent || bankChange || (familyPhone && family) || link && authority || qr && authority ||
      authority && is(/(?:dluh|pokut|urad|bezpec|ucet|dan|lecba)/)) ||
    authority && link && is(/(?:prihlas|hesl|kod|udaj|pokut|bankovni identita|potvrd)/) ||
    qr && is(/(?:signal|propojit|zabezpec|ucet)/) && is(/(?:naskenuj|aktivuj|propojt)/);
  const add = (id, icon, name, detail, re) => {
    if (base.found.some(x => x.id === id)) return;
    const example = quote(re);
    if (example) base.found.push({ id, icon, name, detail, example });
  };
  if (high && base.level !== 'high') {
    if (credentials) add('access','i-key','Žádost o údaje','Nikomu nesdělujte hesla, PIN ani přístupové kódy.',/(?:sd[eě]lte|nadiktuj|preposl|poslete|posli|vypln|zadej|fotograf|snimek).{0,45}/);
    if (remote) add('install','i-monitor','Vzdálené ovládání','Neznámým osobám nepovolujte přístup k telefonu.',/(?:anydesk|teamviewer|vzdalen.{0,14}(?:pristup|sprav)|sdileni obrazovky)/);
    if (threat) add('threat','i-eyeoff','Vydírání','Uchovejte zprávu a obraťte se na policii.',/(?:zverejnime|rozesleme|soukrom.{0,12}video|z kamery)/);
    if (money && paying) add('money','i-cash','Žádost o peníze','Peníze neposílejte bez nezávislého ověření.',/(?:posli|poslete|preved|zaplat|uhrad|potrebuj|vyberte|predat|predejte|vloz|sloz|kupte)/);
    if (familyPhone) add('newContact','i-phone','Změna kontaktu','Zavolejte na původní známé číslo.',/(?:nove cislo|jineho cisla|nemohu mluvit|nevolej|telefonovat nemuzu)/);
    if (cash) add('authority','i-bank','Požadavek na hotovost','Hotovost nepředávejte neověřenému kurýrovi.',/(?:vyberte.{0,40}hotovost|predat.{0,30}kuryr|predejte.{0,30}kuryr)/);
    if (link) add('link','i-link','Odkaz ve zprávě','Na nevyžádaný odkaz neklikejte.',/https?:\/\/\S+|www\.\S+/);
    if (qr) add('qr','i-scan','QR kód','Před naskenováním ověřte skutečný účel.',/\bqr\b.{0,16}\bkod|naskenuj.{0,30}\bqr/);
    if (!base.found.length) add('pressure','i-clock','Nátlak nebo neověřená žádost','Zastavte se a ověřte skutečného odesílatele.',/(?:dnes|ihned|nemohu mluvit|bezpecn.{0,12}ucet|zablok|predejte|potrebuj)/);
    base.level = 'high';
    base.action = 'Zpráva obsahuje více varovných znaků. Neposílejte peníze, nesdělujte kódy a ověřte žádost jiným způsobem.';
  } else if (base.level === 'moderate' && (education || reference) && !high) {
    base.level = 'low'; base.found = [];
    base.action = 'Nebyl rozpoznán konkrétní nebezpečný požadavek, totožnost odesílatele ale nelze ověřit.';
  }
  return base;
}


/* Quality 1.5: context of an instruction, affected asset, and claimed identity.
 * Explicitly separate educational and historical statements from live requests.
 * Quotes are substrings of the ORIGINAL message, never synthesized. */
function classify(text) {
  const raw = String(text || ''), result = classify14(raw);
  let norm = '', starts = [], ends = [], ix = 0;
  for (const ch of raw) {
    const v = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (let k=0;k<v.length;k++){starts.push(ix);ends.push(ix+ch.length);}
    norm+=v;ix+=ch.length;
  }
  const has = re => re.test(norm);
  const quote = re => {const m = re.exec(norm);return m && m[0].length ? raw.slice(starts[m.index],ends[m.index+m[0].length-1]) : '';};
  const add = (id,icon,name,detail,re) => {
    const ex=quote(re);if(!ex)return false;
    if(!result.found.some(x=>x.id===id)) result.found.push({id,icon,name,detail,example:ex});
    return true;
  };
  const action = /\b(?:posli|poslete|odeslete|zaslete|preposlete|sd[eě]lte|nadiktujte|zadejte|vyplnte|potvrdte|vyfotte|fotografujte|nahrajte|prevedte|preved|presunte|predejte|vyberte|zaplatte|zaplat|uhra[dď]te|uhrad|naskenujte|nainstalujte|stahnete|povolte|kliknete|prihlaste|send|share|enter|confirm)\b/;
  const explicit = has(action);
  const funds = has(/(?:\d[\d ]{0,8}\s*(?:kc|czk|korun|eur)|tisic|penez|peniz|uspor|hotovost|zalo[hz]|kauci|poplat|platb|faktur|prevod|invest|vklad|vyhr|bankovni spojeni|iban)/);
  const pay = has(/\b(?:posli|poslete|odeslete|preved|prevedte|presunte|zaplat|uhra[dď]|vloz|sloz|vyberte|predejte|kupte|doplat|potrebuji|potrebuju)\w*/);
  const urgent = has(/(?:\b(?:dnes|hned|ihned|okamzit|vecer|nevolej|nevolejte|nezavolej|jinak|zablok|propadne|hrozi)\b|do \d+ minut|do pulnoci|nevyzvanej|nemohu mluvit|telefonovat nemohu)/);
  const official = has(/(?:polic|banka|bankovn|bankid|financni|urad|obcan|posta|kuryr|zasilk|lekarn|nemocnic|operator|vedeni|reditel|support|podpor|skolni)/);
  const web = has(/(?:https?:\/\/|www\.|\b[a-z\d-]+\.(?:invalid|cz|com|eu)\b)/);
  const qr = has(/\bqr.{0,15}kod|naskenuj.{0,25}\bqr/);
  const secret = has(/(?:\b(?:pin|cvv|otp)\b|hesl|prihlasovac|autorizacn|overovac.{0,12}kod|jednorazov.{0,12}kod|sms.{0,9}kod|one.time code|pristupov.{0,12}kod)/);
  const docs = has(/(?:obcansk.{0,15}prukaz|prukaz.{0,18}totoznosti|kopii? dokladu|kopie? dokladu|obou stran.{0,15}kart|platebni kart.{0,45}zadni stran|kopii.{0,20}platebni kart)/);
  const documentDemand = docs && (explicit || has(/potrebuj|pozaduj|vyzaduje/));
  const accountMove = has(/(?:nov.{0,20}iban|nov.{0,20}bankovni spojeni|nov.{0,14}ucet|jin.{0,20}ucet|rezervn.{0,15}ucet|chranen.{0,15}ucet|zachrann.{0,15}ucet|bezpecn.{0,15}ucet)/);
  const cashHandoff = has(/(?:predejte.{0,60}(?:hotovost|penize|obalku)|(?:hotovost|penize|obalku).{0,55}(?:kuryrovi|policistovi|pracovnikovi|predejte))/);
  const remote = has(/(?:anydesk|teamviewer|vzdalen.{0,15}(?:pristup|sprav)|sdileni obrazovky|ovladani obrazovky)/);
  const extortion = has(/(?:zverejn|rozeslem|vydira|intimn.{0,15}fotograf|soukrom.{0,12}(?:video|nahrav))/);
  const changedFamily = has(/(?:nove cislo|jine cislo|nov.{0,15}kontakt|nov.{0,15}telefon|z jineho cisla|rozbit.{0,15}(?:mobil|telefon)|ukradl.{0,15}(?:mobil|telefon)|nemohu volat|nevolej)/);
  const fakePrizeFee = has(/(?:vyhr|zisk|invest|rezervac|zasilk|balik|vydelk).{0,85}(?:poplat|zalo[hz]|kauci|doplat)|(?:poplat|zalo[hz]|kauci).{0,65}(?:vyhr|zisk|invest|rezervac|zasilk|balik)/);

  // A safety warning such as "nikomu neposílejte PIN" must not be misread
  // as "pošlete PIN". Require a *positive* action to extract a secret.
  const negated = has(/(?:nikomu.{0,28}(?:neposilej|neposlete|nesdeluj|nesdelte|neprozrazuj|nedavej)|\b(?:neposilej|neposlete|nesdeluj|nesdelte|neklikej|neprozrazuj)\w*.*(?:hesl|kod|pin|udaj|doklad))/);
  const directSecret = !negated && secret && (explicit || has(/(?:potrebuj|vyzaduje|send your|share your|pro dokoncen|potvrzen.{0,25}pomoci)/));
  const positiveAction = has(action) || pay || has(/(?:potrebuji|potrebuju|potrebujeme)/);
  const contextLesson = has(/(?:seminar|prednask|skolen|besed|muzeu|vystav|kurz|ucebn|novinach|zpravach|historii|historie|lektor|gramotnost|varoval|bezpecnostn.{0,10}kurz)/);
  const pastNarrative = has(/(?:vcera|pred mesicem|zaplacena|uhrazena|potvrdila|diskutovali|schoval|utratil|koupil jsem|v nasi.{0,20}diskutovali)/);
  const storyOnly = pastNarrative && !positiveAction && !web && !accountMove;
  const clearFriendly = has(/(?:kontakty.{0,18}(?:stejn|zustal)|cislo.{0,18}stejn)/) && !pay;
  const benignLink = has(/https?:\/\/example\.com\b/) && has(/(?:recept|pocasi|predpoved|rodinn.{0,12}kalendar|narozenin)/);
  const investmentPitch = has(/(?:zajima vas.{0,22}(?:bitcoin|invest)|nabizime.{0,40}invest|prijdte.{0,40}invest|nabidka.{0,40}invest)/);
  const safeContext = (negated && !explicit && !pay && !web) ||
    (contextLesson && !positiveAction && !web && !investmentPitch) || storyOnly ||
    clearFriendly || (benignLink && !positiveAction && !secret);
  if (safeContext) {
    result.level='low';result.found=[];
    result.action='Nejsou patrné přímé požadavky typické pro podvod. Pravidla však nemohou potvrdit pravost zprávy ani odesílatele.';
    return result;
  }
  const bankingSecret = directSecret || documentDemand;
  const moneyScheme = (funds && pay && (urgent || (changedFamily && has(/(?:mami|mam|babi|tati|dcer|syn)/)) ||
    (accountMove && (official || has(/faktur/))) || (official && (web || fakePrizeFee)))) ||
    (accountMove && funds && (pay || has(/(?:musite|vyzaduje|pozadujeme)/)));
  const highSignal = bankingSecret || moneyScheme ||
    (cashHandoff && (official || has(/(?:uspory|hotovost|obalku)/))) ||
    (remote && (explicit || has(/(?:povol|nainstal|stahn|spust)/)) && (official || has(/(?:mobil|ucet|profil|telefon)/))) ||
    (extortion && funds && pay) ||
    (qr && explicit && has(/(?:signal|prihlas|zabezpec|propoj|bankovn|ucet)/)) ||
    (official && web && explicit && (secret || funds || has(/(?:pokut|danov|identit|prihlas)/))) ||
    (fakePrizeFee && funds && explicit && has(/(?:vyhr|invest|zisk|zasilk|rezervac|balik)/));

  if(highSignal) {
    if(docs) add('idDocument','i-key','Žádost o osobní doklad','Fotografie dokumentů a karet neposílejte neověřeným osobám.',/(?:obcansk.{0,15}prukaz|prukaz.{0,18}totoznosti|kopii? dokladu|obou stran.{0,15}kart|platebni kart.{0,45}zadni stran|kopii.{0,20}platebni kart)/);
    if(secret) add('access','i-key','Žádost o přístupové údaje','PIN, heslo a potvrzovací kódy nikdy nesdělujte podle pokynů ze zprávy.',/(?:\b(?:pin|cvv|otp)\b|hesl|prihlasovac|overovac.{0,12}kod|jednorazov.{0,12}kod|sms.{0,9}kod|one.time code)/);
    if(cashHandoff) add('cashHandoff','i-bank','Předání hotovosti','Hotovost nevydávejte údajné bance nebo policii.',/(?:predejte.{0,60}(?:hotovost|penize|obalku)|(?:hotovost|penize|obalku).{0,55}(?:kuryrovi|policistovi|pracovnikovi|predejte))/);
    if(accountMove) add('accountChange','i-bank','Změna platebního účtu','Změnu účtu ověřte telefonem nebo v aplikaci otevřené vlastní cestou.',/(?:nov.{0,20}iban|nov.{0,20}bankovni spojeni|nov.{0,14}ucet|jin.{0,20}ucet|rezervn.{0,15}ucet|chranen.{0,15}ucet|zachrann.{0,15}ucet|bezpecn.{0,15}ucet)/);
    if(remote) add('install','i-monitor','Vzdálený přístup','Nepovolujte neznámému volajícímu ovládat zařízení.',/(?:anydesk|teamviewer|vzdalen.{0,15}(?:pristup|sprav)|sdileni obrazovky|ovladani obrazovky)/);
    if(extortion) add('threat','i-eyeoff','Vydírání','Uchovejte zprávu a obraťte se na policii.',/(?:zverejn|rozeslem|vydira|intimn.{0,15}fotograf|soukrom.{0,12}(?:video|nahrav))/);
    if(funds && pay) add('money','i-cash','Žádost o peníze','Peníze neposílejte bez nezávislého ověření.',/\b(?:posli|poslete|odeslete|prevedte|preved|presunte|predejte|vyberte|zaplat|uhrad|potrebuji|potrebuju)\w*/);
    if(qr) add('qr','i-scan','Neověřený QR kód','QR může otevřít podvodný účet nebo platbu.',/\bqr.{0,15}kod|naskenuj.{0,25}\bqr/);
    if(web) add('link','i-link','Odkaz bez ověření','Odkaz ze zprávy sám nepotvrzuje pravost.',/https?:\/\/[^\s,]+|www\.[^\s,]+/);
    if(result.found.length) {
      result.level='high';
      result.action='Text obsahuje rizikovou žádost. Nic neposílejte a žádost si nezávisle ověřte přes známý kontakt nebo oficiální aplikaci.';
      return result;
    }
  }
  const unclear = has(/(?:nov.{0,18}kontakt|nove cislo|z nov.{0,15}cisla|z pracovnih.{0,10}mobilu|platebn.{0,25}podmink|upresnit.{0,25}pristup|overit.{0,35}(?:transakc|ucet|udaj|profil)|potvrdit.{0,35}(?:udaj|profil)|doplat|zaloh|poplat|kuryr.{0,35}udaj|dodatecn.{0,25}udaj|pristup do klientsk|upravu registrac)/);
  if(result.level==='low' && unclear) {
    if(add('unclear','i-info','Neověřený požadavek','Zpráva sama nedokládá podvod; ověřte odesílatele samostatně.',
      /(?:nov.{0,18}kontakt|nove cislo|z nov.{0,15}cisla|z pracovnih.{0,10}mobilu|platebn.{0,25}podmink|upresnit.{0,25}pristup|overit.{0,35}(?:transakc|ucet|udaj|profil)|potvrdit.{0,35}(?:udaj|profil)|doplat|zaloh|poplat|kuryr.{0,35}udaj|dodatecn.{0,25}udaj|pristup do klientsk|upravu registrac)/)) {
      result.level='moderate';
      result.action='Zpráva je nejednoznačná. Nesdělujte citlivé údaje ani neposílejte peníze bez nezávislého ověření.';
    }
  }
  return result;
}

/* Konkrétní kroky podle nalezených signálů */
function nextSteps(data) {
  const ids = new Set(data.found.map(x => x.id)); const has = x => ids.has(x); const out = [];
  if (has('idDocument')) out.push('<b>Neposílejte fotografie dokladů ani obou stran platební karty.</b> Kontakt ověřte v oficiální službě.');
  if (has('cashHandoff')) out.push('<b>Nevybírejte a nepředávejte hotovost</b> údajným kurýrům banky nebo policie.');
  if (has('unclear')) out.push('Přes <b>dříve známý kontakt</b> ověřte, kdo píše a co požaduje.');
  if (has('accountChange')) out.push('Změnu bankovního účtu si <b>ověřte přes dříve známý kontakt</b>, nikoliv z čísla ve zprávě.');
  if (has('qr')) out.push('Neznámý <b>QR kód neskenujte</b> a neposílejte přes něj platbu bez nezávislého ověření.');
  if (has('threat')) out.push('Uschovejte zprávu a další důkazy. Při vyhrožování se <b>obraťte na Policii ČR</b>.');
  if (has('accountUpdate')) out.push('Účet ověřujte jen v <b>oficiální aplikaci</b> nebo na webu otevřeném vlastní cestou.');
  if (has('link')) out.push('<b>Neotvírejte odkaz</b> a nic na něm nevyplňujte.');
  if (has('access') || has('install')) out.push('<b>Nesdělujte žádné kódy ani hesla</b> a nic neinstalujte.');
  if (has('money') || has('investment')) out.push('<b>Neposílejte peníze</b>, dokud žádost nezávisle neověříte.');
  if (has('newContact') || has('secrecy')) out.push('Pokud se zpráva vydává za blízkého, zavolejte mu na <b>původní, dříve uložené číslo</b>.');
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
    // Kontextové signály mohou mít doslovnou citaci místo regexu.
    const regexSource = rule.pattern instanceof RegExp ? rule.pattern.source :
      rule.example ? [...rule.example].map(c => '\\^$.*+?()[]{}|'.includes(c) ? '\\' + c : c).join('') : '';
    if (!regexSource) continue;
    const re = new RegExp(regexSource, 'gi'); let m, guard = 0;
    while ((m = re.exec(text)) && guard++ < 50) { if (!m[0]) { re.lastIndex++; continue; } ranges.push([m.index, m.index + m[0].length]); }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let html = '', pos = 0;
  for (const [s, e] of ranges) { if (e <= pos) continue; const st = Math.max(s, pos); html += esc(text.slice(pos, st)) + '<mark>' + esc(text.slice(st, e)) + '</mark>'; pos = e; }
  return html + esc(text.slice(pos));
}

let lastResult = null;
let lastLocalText = '';
function analyze() {
  const text = $('msg').value.trim();
  if (!text) { $('msg').focus(); setMode('warn', 'Nejdříve vložte text zprávy, nebo vyberte jeden z ukázkových scénářů níže.'); return; }
  if (AI.available && aiSelected()) return analyzeWithAI(text);
  analyzeLocal(text);
}
function analyzeLocal(text = $('msg').value.trim()) {
  if (!text) return;
  const data = classify(text);
  lastResult = data; lastLocalText = text;
  renderResult(data, text); setSource('local');
  updateAiReviewOffer('local');
  go('result');
}

/* ================= AI analýza (volitelná, pilotní) =================
 * Zobrazí se jen tehdy, když server hlásí dostupnost. Výchozí je vždy režim lokálních pravidel.
 * Odesílá se jen text (nikdy obrázek), po automatickém skrytí osobních údajů a po výslovném souhlasu. */
const AI = { endpoint: '', available: false, maxChars: 3000, ctl: null, consentSnapshot: null };
const AI_ERRORS = {
  consent_required: 'Pro AI analýzu je potřeba zaškrtnout souhlas s odesláním textu.',
  too_long: 'Text je pro AI analýzu příliš dlouhý (max. 3 000 znaků nebo 6 000 bajtů). Zkraťte ho, nebo použijte lokální pravidla.',
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
  cancelled: 'AI analýzu jste přerušili. Požadavek už ale mohl být odeslán; další analýza se automaticky nespustí.',
  text_changed: 'Text se během analýzy změnil, proto starý výsledek nezobrazujeme. Předchozí požadavek už mohl být odeslán. Pro novou kontrolu je nutný nový souhlas.'
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
function resetAiConsent() {
  AI.consentSnapshot = null;
  $('aiAgree').checked = false;
}
function updateAiPreview() {
  if (!AI.available) return;
  const masked = maskForAI($('msg').value.trim());
  if (AI.consentSnapshot !== null && AI.consentSnapshot !== masked) resetAiConsent();
  $('aiPreview').textContent = masked || '(zatím prázdné)';
}
function recordAiConsent() {
  AI.consentSnapshot = $('aiAgree').checked ? maskForAI($('msg').value.trim()) : null;
}
function syncAiUi() {
  const ai = aiSelected();
  $('aiConsentBox').hidden = !ai;
  if (!ai) resetAiConsent(); // souhlas platí jen pro konkrétní obsah
  $('analyzeBtn').lastChild.textContent = ai ? 'Zkontrolovat pomocí AI' : 'Zkontrolovat zprávu';
  setMode('', ai ? 'Režim <b>AI analýza (pilotní)</b>: výsledek je pravděpodobnostní a může se mýlit. Kdykoli se můžete vrátit k lokálním pravidlům.'
                 : 'Kontrola proběhne <b>lokálně ve vašem prohlížeči</b> podle pravidel. Text se nikam neodesílá. Nevkládejte hesla, PIN ani kódy.');
  updateAiPreview();
}
function aiError(code) {
  const msg = AI_ERRORS[code] || 'AI analýza se nezdařila.';
  const b = $('analyzeBtn'); b.classList.remove('is-error'); void b.offsetWidth; b.classList.add('is-error');
  const el = $('aiMode'); el.className = 'mode warn';
  el.innerHTML = icon('i-alert') + `<span>${esc(msg)} <button type="button" class="chip" id="fallbackLocal" style="margin-top:8px">Zkontrolovat lokálními pravidly</button></span>`;
  $('fallbackLocal').addEventListener('click', () => analyzeLocal());
}
function setBusy(b) {
  const btn = $('analyzeBtn'); btn.disabled = b; btn.classList.toggle('is-busy', b); btn.setAttribute('aria-busy', String(b)); btn.lastChild.textContent = b ? 'Analyzuji pomocí AI…' : (aiSelected() ? 'Zkontrolovat pomocí AI' : 'Zkontrolovat zprávu');
  $('cancelAiBtn').classList.toggle('hidden', !b);
}
function cancelAi() { if (AI.ctl) AI.ctl.abort('user'); }
async function analyzeWithAI(rawText) {
  const text = maskForAI(rawText);
  // Validate feasibility BEFORE requesting consent: an overlong message cannot be sent.
  const utf8Bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : text.length;
  if (text.length > AI.maxChars || utf8Bytes > 6000) { resetAiConsent(); aiError('too_long'); return; }
  if (!$('aiAgree').checked || AI.consentSnapshot === null || AI.consentSnapshot !== text) {
    resetAiConsent(); aiError('consent_required'); $('aiAgree').focus(); return;
  }
  AI.ctl = new AbortController(); let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; AI.ctl.abort('timeout'); }, 25000);
  setBusy(true); setMode('', 'Odesílám upravený text k AI analýze…');
  try {
    // same-origin: na chráněném Vercel Preview se posílá i přihlašovací cookie Deployment Protection
    const r = await fetch(AI.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, language: 'cs', consent: true }), signal: AI.ctl.signal, credentials: 'same-origin' });
    let data = null; try { data = await r.json(); } catch { /* ignorovat */ }
    if (!r.ok || !data || !data.ok || data.mode !== 'ai' || !data.result) return aiError((data && data.error) || 'ai_failed');
    if (maskForAI($('msg').value.trim()) !== text) return aiError('text_changed');
    lastResult = { kind: 'ai', ...data.result, model: String(data.model || '') };
    renderAiResult(lastResult, text); setSource('ai', lastResult.model); go('result');
    syncAiUi();
  } catch (e) {
    aiError(timedOut ? 'ai_timeout' : AI.ctl.signal.aborted ? 'cancelled' : 'offline');
  } finally { clearTimeout(timer); AI.ctl = null; resetAiConsent(); setBusy(false); }
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
  updateAiReviewOffer('ai');
}
function highlightExcerpts(text, excerpts) {
  const found = excerpts.filter(e => e && e.length >= 3).map(e => ({ pattern: new RegExp(e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }));
  return highlight(text, found);
}
function setSource(kind, model = '') {
  const ai = kind === 'ai';
  $('resultSource').className = 'src-badge' + (ai ? ' ai' : '');
  $('resultSourceIcon').setAttribute('href', ICONS + (ai ? 'i-cpu' : 'i-info'));
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
      updateAiReviewOffer(lastResult?.kind === 'ai' ? 'ai' : 'local');
      for (const radio of document.querySelectorAll('input[name="checkMode"]')) radio.addEventListener('change', syncAiUi);
      $('msg').addEventListener('input', updateAiPreview);
      $('aiAgree').addEventListener('change', recordAiConsent);
      syncAiUi();
    }
  } catch { /* AI zůstane skrytá – pilot funguje lokálně */ } finally { clearTimeout(t); }
}

// Volitelná druhá kontrola: nikdy se nespouští sama ani po výsledku LOW.
// U vysokého rizika nepředkládáme AI jako způsob zpochybnění varování.
function canOfferAiReview(result, available = AI.available) {
  return !!(available && result && result.kind !== 'ai' &&
      (result.level === 'moderate' || result.level === 'low'));
}
function updateAiReviewOffer(source) {
  const box = $('aiReviewOffer');
  if (!box) return;
  const showOffer = source === 'local' && !!lastLocalText && canOfferAiReview(lastResult);
  box.hidden = !showOffer;
  if (!showOffer) return;
  $('aiReviewTitle').textContent = lastResult.level === 'low'
    ? 'Nenašli jsme zjevné signály. Chcete druhý názor?'
    : 'Výsledek není jednoznačný. Chcete druhý názor?';
  $('aiReviewText').textContent = 'Lokální pravidla mohou některé podvody přehlédnout. Volitelná AI kontrola může doplnit vysvětlení, ale neověří odesílatele a nezaručí bezpečnost.';
}
function prepareAiReview() {
  if (!canOfferAiReview(lastResult) || !lastLocalText) return false;
  const radio = document.querySelector('input[name="checkMode"][value="ai"]');
  if (!radio) return false;
  $('msg').value = lastLocalText;
  updateCount();
  go('home');
  selectTab('text');
  resetAiConsent();
  radio.checked = true;
  syncAiUi();
  $('aiConsentBox').scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  $('aiPreview').setAttribute('tabindex', '-1');
  $('aiPreview').focus?.({ preventScroll: true });
  return true;
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
  lastResult = null; lastLocalText = '';
  resetAiConsent(); updateAiReviewOffer('local');
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

/* ---------- úvodní animace scény (jednou, cca 1,8 s; respektuje prefers-reduced-motion) ---------- */
function playHeroIntro() {
  const hero = $('pilotHero'); if (!hero) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { hero.classList.add('done'); return; }
  hero.classList.add('play');
  setTimeout(() => { hero.classList.remove('play'); hero.classList.add('done'); }, 2500);
}

/* ---------- inicializace (jen v prohlížeči) ---------- */
if (HAS_DOM) {
  const init = () => {
    $('msg').addEventListener('input', () => { updateCount(); markQuick(''); }); updateCount();
    for (const q of document.querySelectorAll('[data-demo]')) q.addEventListener('click', () => demo(q.dataset.demo));
    const more = $('quickMore');
    if (more) more.addEventListener('click', e => { e.preventDefault(); const t = $('moreScenarios'); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); t.focus({ preventScroll: true }); });
    playHeroIntro();
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
    window.addEventListener('popstate', e => { navDepth = (e.state && e.state.depth) || 0; const id = (e.state && e.state.screen) || location.hash.slice(1) || 'home'; if (id === 'training') renderTraining(); show(screens.includes($(id)) ? id : 'home'); });
    const initial = location.hash.slice(1);
    const allowed = ['call', 'ad', 'after', 'afterMoney', 'afterAccess', 'afterSoftware', 'training'];
    if (allowed.includes(initial)) { if (initial === 'training') renderTraining(); show(initial, false); history.replaceState({ screen: initial }, '', '#' + initial); }
    else history.replaceState({ screen: 'home' }, '', location.pathname + location.search);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}
// Záměrně bez service workeru, sledování a ukládání do prohlížeče. AI se volá jen po výslovném souhlasu uživatele.

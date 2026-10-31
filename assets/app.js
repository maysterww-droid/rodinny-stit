/* RODINNÝ ŠTÍT · transparentní klientský demonstrátor 0.8
 * No external AI API, no account, no analytics, no storage of submitted messages.
 */
'use strict';
const $ = id => document.getElementById(id);
const screens = [...document.querySelectorAll('#app > section')];
function go(id) {
  const screen = $(id);
  if (!screen) return;
  for (const s of screens) { s.classList.toggle('active', s===screen); }
  window.scrollTo({top:0,behavior:'instant'});
}
function startMessage() { go('input'); }
function startCall() { go('call'); }
function startAd() { go('ad'); }
function esc(s) { return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const demoExamples = {
  relative:'Ahoj mami, mám nové číslo, starý telefon se rozbil. Potřebuji urgentně poslat 12 500 Kč na tento účet. Teď mi prosím nevolej, jsem na schůzce. Napiš, až peníze pošleš.',
  bank:'Dobrý den, tady bezpečnostní oddělení banky. Váš účet bude za 10 minut zablokován. Okamžitě nám sdělte ověřovací kód z SMS a nainstalujte aplikaci pro vzdálený přístup.',
  parcel:'Česká pošta: Vaše zásilka je zadržena. Dnes zaplaťte 49 Kč za doručení na https://priklad-zasilky.invalid, jinak balík vrátíme odesílateli.'
};
function demo(name='relative') { $('msg').value=demoExamples[name]||demoExamples.relative;go('input');$('msg').focus(); }
let currentShot=null, shotUrl=null;
function loadShot(e){
 const file=e.target.files?.[0]; const st=$('ocrState'), b=$('ocrBtn'), img=$('shotPreview');
 if(shotUrl){URL.revokeObjectURL(shotUrl);shotUrl=null;}
 currentShot=null;img.classList.add('hidden');b.classList.add('hidden');st.classList.add('hidden');
 if(!file)return;
 if(!file.type.startsWith('image/')){setOCR('danger','Vyberte obrazový soubor nebo text zprávy vložte ručně.');return;}
 if(file.size>8*1024*1024){setOCR('warn','Obrázek je příliš velký. Použijte soubor do 8 MB.');return;}
 currentShot=file;shotUrl=URL.createObjectURL(file);img.src=shotUrl;img.classList.remove('hidden');b.classList.remove('hidden');setOCR('','Snímek je připraven. Stiskněte „Rozpoznat text z obrázku“. Obrázek zůstává v prohlížeči.');
}
function setOCR(kind,message){const e=$('ocrState');e.className='status '+kind;e.textContent=message;}
async function runOCR(){
 if(!currentShot)return;
 const btn=$('ocrBtn'); btn.disabled=true;btn.textContent='Rozpoznávám…';setOCR('','Načítání OCR. První použití potřebuje stáhnout jazykové podklady.');
 try{
  if(!window.Tesseract)throw Error('OCR unavailable');
  const result=await window.Tesseract.recognize(currentShot,'ces+eng',{logger:m=>{if(m.status==='recognizing text'&&Number.isFinite(m.progress))setOCR('',`Rozpoznávání: ${Math.round(m.progress*100)} % · obrázek se zpracovává ve vašem prohlížeči.`);}});
  const value=String(result?.data?.text||'').trim().slice(0,5000);
  if(!value){setOCR('warn','Text se nepodařilo přečíst. Zkuste ostřejší snímek nebo zprávu přepište.');return;}
  $('msg').value=value;setOCR('good','Text byl rozpoznán. Než pokračujete, zkontrolujte chyby a případně odstraňte citlivé údaje.');
 }catch(e){setOCR('warn','Rozpoznávání se nezdařilo. Zkuste to znovu nebo vložte text ručně.');}
 finally{btn.disabled=false;btn.textContent='Rozpoznat text znovu';}
}
function maskPhones(){const e=$('msg');e.value=e.value.replace(/(?:\+?\d[\d ()-]{7,}\d)/g,'[SKRYTÉ TELEFONNÍ ČÍSLO]');}
function maskEmails(){const e=$('msg');e.value=e.value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[SKRYTÝ E-MAIL]');}
function maskNumbers(){const e=$('msg');e.value=e.value.replace(/\b\d{8,}\b/g,'[SKRYTÉ ČÍSLO]');}

const SIGNS=[
 {id:'pressure',name:'Časový nátlak',detail:'Zpráva vás nutí jednat rychle a bez přemýšlení.',pattern:/(?:ihned|okamžitě|urgentn|spěchá|spěchejte|rychle|do \d+ minut|za \d+ minut|dnes|hned|pospěš|neodkladně|nejpozději|teď hned|time limit)/i},
 {id:'money',name:'Požadavek na peníze',detail:'Ve zprávě se žádá platba, převod nebo finanční údaje.',pattern:/(?:pošli|poslat|pošlete|převeď|převod|platbu|zaplať|zaplatit|uhrad|peníze|částku|bankovní účet|\d[\d ]{0,10}\s*(?:kč|czk|eur|€))/i},
 {id:'newContact',name:'Nové kontaktní číslo',detail:'Odesílatel tvrdí, že změnil telefon nebo způsob kontaktu.',pattern:/(?:nové číslo|nový telefon|starý telefon|rozbil|ztratil.*telefon|jiného čísla|new number)/i},
 {id:'access',name:'Kód nebo heslo',detail:'Někdo chce přístupové údaje nebo ověřovací kód.',pattern:/(?:pin|heslo|ověřovací kód|jednorázov[ýé]|přihlašovac[íi]|sdělte.*kód|pošlete.*kód|přístupový kód|sms kód)/i},
 {id:'install',name:'Vzdálený přístup',detail:'Požadavek na instalaci programu nebo přístup k zařízení.',pattern:/(?:nainstaluj|instaluj|aplikaci pro|vzdálený přístup|anydesk|teamviewer|remote access|sdílení obrazovky)/i},
 {id:'secrecy',name:'Brání ověření',detail:'Zpráva odrazuje od volání nebo nezávislé kontroly.',pattern:/(?:nevolej|nevolat|nikomu neříkej|nikomu to neříkej|tajné|teď nemohu mluvit|neptej se|jenom mi věř)/i},
 {id:'authority',name:'Vydávání se za autoritu',detail:'Odesílatel se dovolává banky, policie nebo úřadu.',pattern:/(?:bezpečnostní oddělení|policie|kriminální|banka|banky|finanční úřad|česká pošta|zásilka|kurýr|podpora účtu|zablokován|zablokujeme)/i},
 {id:'link',name:'Odkaz ve zprávě',detail:'Odkaz neprokazuje, že jde o oficiální web.',pattern:/(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:cz|com|eu|net|info|sk)\b)/i},
 {id:'investment',name:'Nerealistický příslib',detail:'Zaručený výdělek či výhra mohou být manipulační návnadou.',pattern:/(?:garantovan[ýá]|zaručen[ýá]|bez rizika|investi[čc]|výhra|vyděláte|výnos|bitcoin|kryptoměn)/i}
];
function classify(text){
 const found=SIGNS.map(rule=>{const m=text.match(rule.pattern);return m?{...rule,example:m[0]}:null;}).filter(Boolean);
 const ids=new Set(found.map(x=>x.id)); const has=x=>ids.has(x);
 const urgent=has('pressure')||has('secrecy');
 let level='low';
 if ((has('money')&&(urgent||has('newContact')||has('authority')||has('link')||has('investment'))) ||
     ((has('access')||has('install'))&&(urgent||has('authority')||has('link'))) ||
     (has('investment')&&has('pressure'))) level='high';
 else if(found.length) level='moderate';
 let action='Zprávu berte s obvyklou opatrností. Pokud v ní někdo později požádá o platbu nebo přístupové údaje, situaci ověřte samostatně.';
 if(has('access')||has('install')) action='Nikomu nesdělujte kód ani heslo a neinstalujte software na žádost neznámého člověka. Otevřete oficiální službu sami nebo ji kontaktujte přes známé číslo.';
 else if(has('money')) action='Zatím nic neposílejte. Ověřte totožnost a samotnou žádost zavoláním na původní známé číslo nebo přes oficiální aplikaci.';
 else if(has('link')) action='Na odkaz zatím neklikejte. Pokud si chcete službu ověřit, její adresu zadejte sami nebo použijte již známou oficiální aplikaci.';
 else if(found.length) action='Nejednejte pod tlakem a ověřte odesílatele nezávisle. Nezapomeňte, že vzhled zprávy ani jméno odesílatele nejsou důkazem pravosti.';
 return {level, found,action};
}
function analyze(){
 const text=$('msg').value.trim();if(!text){$('msg').focus();setMode('warn','Nejdříve vložte nebo vyberte ukázkovou zprávu.');return;}
 const data=classify(text);renderResult(data);go('result');
}
function setMode(kind,value){$('aiMode').className='status '+kind;$('aiMode').textContent=value;}
function renderResult(data){
 const titles={high:'Výrazné varovné signály',moderate:'Situaci raději ověřte',low:'Zjevné signály nenalezeny'};
 const sub={high:'Zpráva obsahuje kombinaci znaků typických pro podvodné scénáře. Nejednejte, dokud ji nezávisle neověříte.',moderate:'Nalezli jsme některé varovné znaky, ale nemáme dost informací k závěru.',low:'V tomto textu naše jednoduchá pravidla nic nenašla. To však neznamená, že je zpráva bezpečná.'};
 $('resultTitle').textContent=titles[data.level];$('resultState').textContent=sub[data.level];
 $('resultRisk').className='risk-box '+({high:'',moderate:'is-moderate',low:'is-low'}[data.level]);
 $('riskSymbol').textContent={high:'!',moderate:'?',low:'✓'}[data.level];
 const holder=$('signals');
 if(data.found.length){holder.innerHTML=data.found.slice(0,6).map((x,i)=>`<div class="signal"><div class="bubble" aria-hidden="true">${['⚠','◈','!','↗','✓','?'][i%6]}</div><div><b>${esc(x.name)}</b><small>${esc(x.detail)}<br><em>„${esc(x.example.slice(0,100))}“</em></small></div></div>`).join('');}
 else holder.innerHTML='<div class="signal"><div class="bubble">ℹ</div><div><b>Bez rozpoznaných signálů</b><small>Pravidla nejsou úplná. Mohou přehlédnout nový typ útoku.</small></div></div>';
 $('resultAction').textContent=data.action;
 $('resultNote').textContent='Výsledek pochází pouze z lokálních orientačních pravidel, nikoli z AI modelu nebo databáze podvodů. Nikdy negarantuje bezpečnost a neověřuje odesílatele.';
 $('verifyBtn').style.display=data.level==='low'?'none':'inline-flex';
}
function verified(real){
 $('doneTitle').textContent=real?'Žádost jste nezávisle ověřili':'Dobře, že jste se zastavili';
 $('doneBox').textContent=real?'Pokud jste sami ověřili totožnost a konkrétní žádost přes dříve známý kanál, můžete se rozhodovat s větší jistotou. Nadále ale postupujte obezřetně.':'Zjistili jste, že zpráva nebyla pravá. Nic podle původní výzvy neposílejte. Pokud jste již jednali, projděte si část „Už se něco stalo?“';
 go('done');
}
function resetAll(){ $('msg').value='';$('shot').value='';$('shotPreview').classList.add('hidden');$('ocrState').classList.add('hidden');$('ocrBtn').classList.add('hidden');currentShot=null;if(shotUrl){URL.revokeObjectURL(shotUrl);shotUrl=null;}setMode('','Režim pilotu: orientační lokální analýza bez živého AI modelu.');go('home'); }
const trainings=[
 {story:'„Ahoj, tati. Mám nové číslo. Urgentně potřebuji 8 000 Kč. Nevolej mi, teď nemohu mluvit.“',answers:['Poslat alespoň malou částku pro jistotu.','Zavolat dítěti na původní známé číslo.','Zeptat se nového čísla na rodinné tajemství.'],correct:1,ok:'Ano. Nezávislé ověření přes dříve známý kontakt je nejbezpečnější.',bad:'To ještě nepotvrzuje totožnost odesílatele. Ověřte jej přes původní známý kontakt.'},
 {story:'„Voláme z banky. Za pět minut zablokujeme váš účet. Sdělte ověřovací SMS kód.“',answers:['Předat kód, když se volající představí jako banka.','Ukončit hovor a otevřít oficiální aplikaci banky.','Požádat volajícího o potvrzení jména.'],correct:1,ok:'Správně. Kód neprozrazujeme a banku kontaktujeme sami.',bad:'Samotná identita volajícího ověřená není. Hovor ukončete a banku otevřete sami.'},
 {story:'Reklama: „Garantované výnosy 30 % měsíčně! Investujte hned, zbývají jen dvě místa.“',answers:['Kliknout a přečíst si recenze na uvedeném webu.','Ověřit nabídku mimo reklamní odkaz a neposílat peníze.','Poslat malou částku pro test.'],correct:1,ok:'Ano. Nezávislá kontrola neověřené nabídky chrání před manipulací.',bad:'Odkaz i recenze mohou ovládat podvodníci. Nabídku ověřujte nezávisle.'}
];
let trainStep=0;
function startTraining(){trainStep=0;renderTraining();go('training');}
function renderTraining(){
 const t=trainings[trainStep];$('trainStepLabel').textContent=`Trénink · ${trainStep+1} ze ${trainings.length}`;
 $('trainStory').textContent=t.story;
 $('trainChoices').innerHTML=t.answers.map((a,i)=>`<button type="button" onclick="trainAnswer(${i})">${esc(a)}</button>`).join('');
 $('trainFeedback').className='status hidden';$('trainFeedback').textContent='';
 for(let i=0;i<3;i++)$('trainDot'+i).className=i<=trainStep?'active':'';
}
function trainAnswer(answer){
 const data=trainings[trainStep], correct=answer===data.correct;
 const f=$('trainFeedback'); f.className='status '+(correct?'good':'warn');
 if(!correct){f.textContent='Zkuste jinou možnost. '+data.bad;return;}
 f.innerHTML=`<strong>Správně!</strong> ${esc(data.ok)}<br><button class="btn btn-primary" type="button" style="margin-top:14px" onclick="nextTraining()">${trainStep<trainings.length-1?'Další situace →':'Dokončit trénink ✓'}</button>`;
 [...$('trainChoices').querySelectorAll('button')].forEach(x=>x.disabled=true);
}
function nextTraining(){if(trainStep<trainings.length-1){trainStep++;renderTraining();}else go('home');}
// Intentionally no service worker, tracking, client persistence, or automatic external AI request.

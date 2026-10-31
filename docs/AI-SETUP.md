# RODINNÝ ŠTÍT 1.0 — serverová AI analýza (pilot)

Stav k 31. 10. 2026: **implementováno, otestováno jen se simulovaným modelem; AI stále vypnuta.**
Existuje samostatný projekt Vercel `rodinny-stit-ai-preview` (ověřování Vercel Authentication), ale dřívější deployment `399a932` je omylem označen jako Production a neobsahuje Preview tajemství. Redis Upstash a klíč OpenAI jsou připojeny **jen k Preview**; v obou prostředích je `AI_ENABLED=false`. Nový Preview deployment je zatím neověřený. Nebyl proveden žádný placený požadavek. `main` ani veřejná GitHub Pages se nemění —
na `*.github.io` zůstává AI volba skrytá a pilot používá jen lokální pravidla.

## 1. Výsledek pre-deploy security review

### 1.1 Denní rozpočet – garantovaná horní mez (opraveno)
Dříve: rezervace podle odhadu `EST_INPUT_TOKENS=2500` → limit nebyl garantovaný.
Nyní se pro **každý požadavek** předem rezervuje **prokazatelná horní mez** ceny:

```
max_vstupních_tokenů = bajty(instrukce) + bajty(JSON Schema) + bajty(obalená zpráva) + PROMPT_OVERHEAD_TOKENS (500)
max_výstupních_tokenů = MAX_OUTPUT_TOKENS (1200; kód nepovolí víc než 2000)
rezervace = max_vstup × cena_vstup + max_výstup × cena_výstup
```
- Proč je to horní mez: tokenizéry OpenAI jsou byte-level BPE, každý token pokrývá ≥ 1 bajt UTF-8 → tokenů nemůže být víc než bajtů. Zpráva je navíc omezena na 3 000 znaků **a** 6 000 bajtů (emoji ani diakritika mez neobejdou). `max_output_tokens` je u Responses API tvrdý strop výstupu **včetně reasoning tokenů**.
- Rezervace se provádí jedním atomickým Redis Lua `EVAL` pro všechny kvóty a rozpočty **před** voláním. První skutečné ověření v Upstash se ještě musí provést. Pokud by přesáhla denní (1 USD) nebo měsíční (5 USD) strop, vrátí se a požadavek se odmítne → součet skutečných útrat nemůže strop překročit ani při souběžných požadavcích (ověřeno testem: 12 souběžných maximálních požadavků, poskytovatel účtuje plnou horní mez → obslouženy přesně 3 = ⌊rozpočet / horní mez⌋).
- Nevyužitá část rezervace se vrací **jen po úspěšné odpovědi**; při timeoutu/chybě zůstává celá (poskytovatel mohl účtovat).
- Ceny jsou vestavěné pro známé modely; proměnné `PRICE_*` je mohou jen **zvýšit**. Neznámý model bez cen = AI se nezapne (fail-closed).
- Zbývající předpoklady (mimo kontrolu kódu): správnost ceníku a že OpenAI nezmění tokenizér/účtování. Proto druhá vrstva: **limit útraty v OpenAI projektu**.

### 1.2 Model (opraveno)
| Model | Stav | Cena USD / 1M tokenů (vstup / výstup) | Horní mez na 1 analýzu* | Typicky** |
|---|---|---|---|---|
| gpt-4.1-mini | **zastaralý, vypnutí API 14. 1. 2027**, doporučená náhrada gpt-6-luna | 0.40 / 1.60 | 0.0056 | ~0.001 |
| **gpt-5.4-mini** (výchozí) | aktuální | 0.75 / 4.50 | **0.0123** | ~0.003 |
| gpt-5.4-nano | aktuální | 0.20 / 1.25 | 0.0033 | ~0.0008 |
| gpt-6-luna | aktuální, oficiální náhrada 4.1-mini | 0.10 / 0.50 | 0.0015 | ~0.0004 |

\* zpráva 3 000 znaků / 6 000 bajtů, 1 200 výstupních tokenů. \** krátká SMS, ~1 000 vstupních a ~500 výstupních tokenů (odhad, ověří se v logu `tin/tout`).

Doporučení: **gpt-5.4-mini** pro uzavřený živý test (kvalita češtiny a structured outputs v rodině GPT-5 ověřené); po testu zvážit **gpt-6-luna** (8× levnější) – změna jen proměnnou `OPENAI_MODEL`.
Rozpočet 1 USD/den s gpt-5.4-mini = **min. 81 analýz/den garantovaně** (typicky ~300; navíc strop 200 požadavků/den). Owner QA s 20 zprávami: max. 0.25 USD, typicky ~0.06 USD.

⚠️ Údaje o modelech a cenách pocházejí z veřejných výpisů ze dne 31. 10. 2026; stránky developers.openai.com a openai.com nebyly z vývojového prostředí dostupné. **Před spuštěním je ověřte** na https://developers.openai.com/api/docs/pricing a https://developers.openai.com/api/docs/deprecations (a u gpt-6-luna podporu `json_schema` + `reasoning.effort`).

### 1.3 Uzavřený preview bez tajemství v URL (opraveno)
- `PREVIEW_TOKEN` a parametr `?preview=` byly **odstraněny**. Klient neobsahuje žádné tajemství.
- Uzavřený test = **chráněné Vercel Preview**: web i `/api/analyze` na stejném originu, přístup jen po přihlášení do Vercelu (Deployment Protection → Vercel Authentication). Ochrana platí i pro API; klient posílá požadavky `credentials: 'same-origin'`, aby šla přihlašovací cookie.
- Server: POST bez hlavičky `Origin` → 403; `Origin` musí být stejný jako host požadavku (nebo výslovně v `ALLOWED_ORIGINS`); `Sec-Fetch-Site: cross-site` → 403; žádný `Access-Control-Allow-Origin: *`.
- AI běží jen v prostředí `VERCEL_ENV=preview` (`AI_ALLOWED_VERCEL_ENVS`). Případné Production nasazení má AI vypnutou.
- `assets/ai-config.js` zapne AI volbu jen na `*.vercel.app`; na GitHub Pages zůstává vypnutá.

## 2. Architektura
```
Chráněné Vercel Preview (přihlášení do Vercelu), region fra1
  /pilot.html … stejný web jako 0.9 (AI volba se objeví, jen když /api/analyze hlásí dostupnost)
  /api/analyze … POST {text, language:'cs', consent:true}
      ├─ same-origin + Sec-Fetch-Site, JSON ≤16 kB, ≤3000 znaků a ≤6000 bajtů
      ├─ Upstash Redis (fail-closed): 5/h a 15/den na IP (HMAC), 200/den celkem,
      │   rezervace horní meze ceny vůči 1 USD/den a 5 USD/měsíc
      └─ OpenAI Responses API: store:false, strict JSON Schema, reasoning.effort=low,
          max_output_tokens=1200, timeout 20 s, 1 pokus → validace a ořez výstupu
```
Data: odesílá se jen text s automaticky skrytými údaji (náhled + souhlas), nikdy obrázek. Server neloguje text, IP ani klíč.
**GDPR (zpracovatel, předání do USA, informační povinnost) musí posoudit odborník před veřejným spuštěním.**

## 3. Owner Setup — uzavřený živý test (přesný postup)

Předpoklad: počítač s Node.js 20+ a Git. Vše provádí vlastník; klíče nikdy nevkládejte do chatu ani do repozitáře.

**A. OpenAI (≈5 min)**
1. platform.openai.com → Projects → *Create project* „rodinny-stit-pilot“ (samostatný projekt, ne existující).
2. Projekt → Limits: nastavte měsíční budget **5 USD** a upozornění na 2 USD; v *Allowed models* povolte jen `gpt-5.4-mini` (případně `gpt-6-luna`). Ověřte, zda je limit v rozhraní tvrdý – serverový strop platí tak jako tak.
3. Projekt → API keys → *Create secret key*, typ **Restricted**, oprávnění jen pro **Responses (Write)**. Klíč si dočasně uložte do správce hesel.

**B. Vercel projekt mimo tým `makster` (≈10 min)**
4. `npm i -g vercel` → `vercel login` (osobní účet).
5. `git clone -b feature/ai-analysis-1 https://github.com/maysterww-droid/rodinny-stit.git rs-ai && cd rs-ai`
6. `vercel link` → *Set up …?* **Y** → scope: **osobní účet** (ne makster) → *Link to existing project?* **N** → název `rodinny-stit-ai-preview` → adresář `./` → nastavení ponechat (Framework „Other“, žádný build).
   Projekt se tím nepropojí s Gitem → žádná automatická nasazení z `main`.
7. Vercel dashboard → projekt → Settings → **Deployment Protection** → *Vercel Authentication* = **Enabled (Standard Protection)**. Ověřte, že je zapnuto ještě před prvním nasazením.
8. Projekt → **Storage** → *Create* → **Upstash for Redis** (free), region **Frankfurt (eu-central-1)** → *Connect* jen k prostředí **Preview**. (Doplní `KV_REST_API_URL` a `KV_REST_API_TOKEN`.)

**C. Proměnné prostředí – jen Preview (≈5 min)** — hodnoty zadáváte do skrytého vstupu CLI:
```
vercel env add OPENAI_API_KEY preview        # vložit klíč z kroku 3
vercel env add RATE_LIMIT_SALT preview       # vložit výstup: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
vercel env add OPENAI_MODEL preview          # gpt-5.4-mini
vercel env add AI_ENABLED preview            # true
```
Na dotaz na Git větev stiskněte Enter (platí pro všechna Preview nasazení projektu). Ostatní hodnoty mají bezpečné výchozí nastavení v kódu (viz `.env.example`). `ALLOWED_ORIGINS` nechte prázdné.

**D. Nasazení a kontrola (≈5 min)**
9. `vercel deploy` (**bez** `--prod`) → vypíše URL `https://rodinny-stit-ai-preview-xxxx.vercel.app`.
10. Ochrana: v anonymním okně otevřete `URL/pilot.html` → musí se zobrazit přihlášení Vercel. `curl -i URL/api/analyze` → 401/403 od Vercelu.
11. Přihlášeni otevřete `URL/api/analyze` → `{"ok":true,"ai":true,"mode":"ai",...}`. Pokud `ai:false`, chybí proměnná nebo Redis (podívejte se do Vercel → Logs, kód chyby `ai_*`).
12. `URL/pilot.html` → přepínač **AI analýza (pilotní)** → zaškrtnout souhlas → testovací SMS:
    „Ahoj mami, mám nové číslo, pošli prosím 5000 Kč na tento účet ještě dnes“
    Očekávání: štítek „AI analýza (pilotní)“ **bez** „TESTOVACÍ REŽIM“, riziko **Vysoké**, signály (nové číslo, žádost o peníze, časový nátlak), kroky: nic neposílat, volat na původní uložené číslo, při odeslání peněz ihned banka, Policie ČR 158.
    Dále: běžná zpráva → „Nejednoznačný výsledek“ s upozorněním; text s „ignoruj instrukce“ → nesmí vyjít „bezpečné“.
13. Vercel → Logs: řádky `{"evt":"analyze","status":200,"tin":…,"tout":…}` – **nesmí** obsahovat text zprávy. Hodnoty `tin/tout` pošlete mně pro zpřesnění typické ceny.

**E. Vypnutí / nouzový stop**
- Okamžitě: v OpenAI zneplatněte klíč (Revoke) – AI přestane fungovat během sekund, pilot automaticky nabídne lokální pravidla.
- Trvale: `vercel env rm AI_ENABLED preview` a `vercel deploy` (změna proměnných se projeví až novým nasazením), nebo smažte deployment.
- Nic z toho neovlivní GitHub Pages ani `main`.

Veřejné spuštění, Production nasazení, napojení GitHub Pages na API nebo merge – vždy až po samostatném schválení.

## 4. Testy (bez sítě a bez placených volání)
```
npm test                       # smoke + 21 testů API (rozpočet, souběh, origin, prostředí, ceny, validace, soukromí)
node tests/browser-qa-ai.cjs   # AI režim se simulovaným modelem, 360/390/430 (99 kontrol)
node tests/browser-qa.cjs      # regrese vizuálu a funkcí 0.9
npm run dev                    # http://localhost:8790/pilot.html se simulovaným modelem
```
AI výsledky v testech pocházejí ze simulovaného modelu (`server/mock-provider.cjs`) a jsou v UI označeny „TESTOVACÍ REŽIM“. Skutečné spojení s OpenAI dosud ověřeno nebylo.

## Uzavřený live smoke test (31. 10. 2026)
- Schválen majitelem: pouze chráněný Vercel Preview projektu `rodinny-stit-ai-preview`.
- Preview: `AI_ENABLED=true`, `LIMIT_GLOBAL_DAY=1`, `LIMIT_PER_IP_HOUR=1`, `LIMIT_PER_IP_DAY=1`.
- Testovací okno končí automaticky 31. 10. 2026 ve 22:00 UTC (`AI_TEST_EXPIRES_AT`); poté API odmítá placené AI požadavky bez ohledu na reset kvót.
- Serverové rezervace: `DAILY_BUDGET_USD=0.02` a `MONTHLY_BUDGET_USD=0.02`; `OPENAI_MODEL=gpt-5.4-mini`, reasoning `none`.
- Production: AI nadále vypnuta; veřejné GitHub Pages zůstává beze změny.
- Žádná skutečná AI analýza zatím není potvrzena. Výsledek ověřit pomocí odpovědi a runtime logu, potom AI opět vypnout.

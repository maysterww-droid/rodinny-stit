# RODINNÝ ŠTÍT 1.0 — serverová AI analýza (pilot)

Stav: **implementováno a otestováno se simulovaným modelem. Server není nasazen, AI není zapnutá, nebyl proveden žádný placený požadavek.**
Veřejný web (GitHub Pages, `main`) se nemění: dokud `assets/ai-config.js` obsahuje prázdný `endpoint`, pilot funguje jen s lokálními pravidly.

## Architektura

```
Prohlížeč (GitHub Pages, statický pilot)
  │  výchozí: lokální pravidla – nic se neodesílá
  │  volitelně: „AI analýza (pilotní)“ → jen po souhlasu, text s automaticky skrytými údaji
  ▼
POST https://<projekt>.vercel.app/api/analyze   (samostatný Vercel projekt, jen tato funkce)
  │  CORS jen pro https://maysterww-droid.github.io (+ volitelně QA origin), žádný „*“
  │  validace: JSON, ≤16 kB tělo, ≤3000 znaků, consent:true, language:'cs'
  │  limity v Upstash Redis (trvalé, serverless-safe): 5/h a 15/den na IP (HMAC hash),
  │  300 požadavků/den celkem, denní rozpočet v USD s rezervací nejhorší ceny předem
  │  AI_ENABLED vypínač, volitelný PREVIEW_TOKEN pro uzavřené testování
  ▼
OpenAI Responses API (server-to-server): store:false, strict JSON Schema, max_output_tokens 700,
timeout 15 s, žádné opakování. Výstup se znovu validuje a ořezává; klient vše vykresluje jako text.
```

Fail-closed: bez klíče, bez úložiště limitů, bez soli nebo bez povolených originů vrací server `503 ai_unavailable` a klient AI volbu vůbec nezobrazí.

Soubory: `api/analyze.js` (Vercel funkce), `server/core.cjs` (validace, limity, rozpočet, CORS), `server/openai.cjs` (volání modelu), `server/prompt.cjs` (instrukce + JSON Schema), `server/store.cjs` (Upstash REST), `server/mock-provider.cjs` + `server/dev-server.cjs` (simulace pro testy), `assets/ai-config.js` (adresa API pro klienta).

## Ochrana dat
- Odesílá se jen text, nikdy obrázek (OCR zůstává v zařízení). Před odesláním se automaticky skryjí telefony, e-maily, čísla účtů, IBAN, čísla karet a kódy; uživatel vidí přesný odesílaný text.
- Server neukládá ani neloguje text, IP ani klíč. Logy obsahují jen stavový kód, dobu a počty tokenů. Čítače limitů obsahují jen HMAC hash IP a expirují do 25 h.
- `store:false` u poskytovatele. **Soulad s GDPR (zpracovatelská smlouva, předávání mimo EU, informační povinnost) musí posoudit odborník před veřejným spuštěním.**

## Model a náklady (ověřit před spuštěním)
- Výchozí `OPENAI_MODEL=gpt-4.1-mini` (dobrá čeština, structured outputs, nízká cena). Z vývojového prostředí nebyla dostupná aktuální dokumentace ani ceník OpenAI → **dostupnost modelu a cenu ověřte** a případně změňte jen proměnnou `OPENAI_MODEL` a ceny `PRICE_*`.
- Odhad při orientačních cenách 0,40 USD / 1M vstupních a 1,60 USD / 1M výstupních tokenů: ~2 500 vstupních + ≤700 výstupních tokenů ≈ **max. 0,002 USD za analýzu**.
  - Owner QA (20 testovacích zpráv): ≈ 0,04 USD.
  - Pevný denní strop serveru: `DAILY_BUDGET_USD=1` (≈ 450–1 000 analýz) a zároveň `LIMIT_GLOBAL_DAY=300`.
- Doporučeno navíc: samostatný OpenAI projekt jen pro RODINNÝ ŠTÍT s **měsíčním limitem útraty** (např. 5 USD) a klíčem omezeným na Responses API.

## Co je potřeba pro spuštění skutečné AI (kroky vlastníka)
1. **Schválit** hosting (samostatný Vercel projekt `rodinny-stit-api`, ne existující VYTA/Makster/SOLA), model, denní rozpočet a režim (uzavřený preview s tokenem, nebo veřejně).
2. Vytvořit Vercel projekt z větve `feature/ai-analysis-1` (Framework: Other, bez build příkazu). V týmu `makster` dříve vracelo vytvoření projektu 403 → použít osobní účet/tým, kde máte práva.
3. Přidat Upstash Redis (Vercel → Storage/Marketplace → Upstash Redis, free tier) – proměnné `UPSTASH_REDIS_REST_URL/TOKEN` (nebo `KV_REST_API_*`) se doplní automaticky.
4. V OpenAI vytvořit projekt, nastavit limit útraty a vygenerovat klíč. **Klíč vložit jen do Vercel → Settings → Environment Variables** (`OPENAI_API_KEY`), nikdy do chatu ani repozitáře.
5. Nastavit: `RATE_LIMIT_SALT` (náhodný ≥32 znaků), `ALLOWED_ORIGINS=https://maysterww-droid.github.io`, `PREVIEW_TOKEN` (pro uzavřený test), `AI_ENABLED=true`. Ostatní dle `.env.example`.
6. Ověřit `GET https://<projekt>.vercel.app/api/analyze` → `{"ok":true,"ai":true,...}`.
7. Do `assets/ai-config.js` doplnit endpoint (v této větvi), otevřít pilot s `?preview=<token>` a provést Owner QA níže. Teprve potom případně veřejné spuštění (smazat `PREVIEW_TOKEN`) a merge – vždy po samostatném schválení.
8. Nouzové vypnutí: `AI_ENABLED=false` (okamžitě) – pilot automaticky přejde jen na lokální pravidla.

## Owner QA (živý test po spuštění)
Testovací SMS: „Ahoj mami, mám nové číslo, pošli prosím 5000 Kč na tento účet ještě dnes“
Očekávání: štítek „AI analýza (pilotní)“ (bez „TESTOVACÍ REŽIM“), riziko **Vysoké**, signály typu nové číslo / žádost o peníze / časový nátlak, doporučení: nic neposílat, zavolat na původní uložené číslo, při odeslání peněz ihned kontaktovat banku, případně Policie ČR 158. Dále: běžná zpráva → „Nejednoznačný výsledek“ s upozorněním, že to neznamená bezpečí.

## Testy (bez sítě a bez placených volání)
```
npm test                       # smoke (pravidla, maskování, žádný klíč v klientu) + 16 testů API
node tests/browser-qa.cjs      # regrese vizuálu a funkcí 0.9 (360/390/430/1440)
node tests/browser-qa-ai.cjs   # AI režim se simulovaným modelem, 360/390/430
npm run dev                    # lokálně http://localhost:8790/pilot.html se simulovaným modelem
```
Všechny AI výsledky v testech pocházejí ze **simulovaného modelu** (`server/mock-provider.cjs`) a v UI jsou označeny „TESTOVACÍ REŽIM se simulovaným modelem“. Skutečné spojení se serverem OpenAI dosud ověřeno nebylo.

# Owner QA · pilot 1.1 – první dojem (Praha + telefon + animace)

Větev `feature/pilot-first-impression-1` (od `feature/ai-analysis-1`). `main`, Production ani GitHub Pages se nemění; AI zůstává vypnutá, žádné placené volání.

## Snímky
- `compare-reference-390.jpg` – schválená reference vs. skutečný web 390 px
- `pilot-{360,390,430,768,1440}-first-screen.jpg`, `pilot-{390,1440}-home-full.jpg`
- `anim-390-*ms.jpg` – snímky animace (80 → 2300 ms), `pilot-390-reduced-motion.jpg`, `pilot-390-scenario-selected.jpg`, `pilot-390-zoom130.jpg`

## Shody s referencí
Pražský hrad + Karlův most za scénou se světlým přechodem; naklopený realistický telefon vpravo s podezřelou SMS „Ahoj mami, mám nové číslo. Pošli mi prosím 5000 Kč ještě dnes.“; zelený štít s fajfkou, který se po skenování rozsvítí, a zelený prstenec, který obíhá telefon – zadní oblouk za telefonem, přední před ním (jako v referenci); štítek „Kontrola zprávy · pilot 1.0“, velký nadpis a popis vlevo; 4 záložky SMS / E-mail / Obrázek / Hovor; velké pole s počítadlem 0/5000; „Vyzkoušejte ukázkový scénář“ + „Zobrazit další →“ a tři karty (červená „Ahoj mami…“, „Zaplaťte doplatek za balík…“, „E-mail od banky…“); velké modré tlačítko „Zkontrolovat zprávu →“; zelený pruh tří výhod.

## Záměrné rozdíly
1. Štít je podle reference zelený s fajfkou: během skenování je šedý, pak se rozsvítí zeleně a dokreslí fajfku („kontrola proběhla, ochrana zasáhla“). Aby to nevypadalo jako „SMS je bezpečná“, objeví se hned poté na rohu bubliny varování „Podezřelé“.
2. Místo telefonního čísla „Neznámé číslo“ (žádné reálné číslo).
3. Telefon nepřekrývá nadpis – nadpis má proto 3 řádky místo 2.
4. Větší písmo (popis 16–19 px, záložky 14–15 px, karty 14 px) a vyšší dotykové plochy kvůli seniorům → obrazovka je delší než reference; na ≤ 440 px mají záložky ikonu nad textem.
5. Pruh výhod: „Vaše data v bezpečí / Neukládáme obsah“ nahrazeno pravdivým „Výchozí režim v prohlížeči / Text se neodesílá“ (bez přehnaných slibů).
6. Mezi kartami a tlačítkem zůstává (skrytá) volba AI se souhlasem; anonymizace „Skrýt:“ je pod tlačítkem.
7. Fotografie Prahy: originál 1680×944 od vlastníka (WebP 42 kB / 127 kB).

## Testy
`node tests/browser-qa-hero.cjs` (128 kontrol), `node tests/browser-qa.cjs` (267), `node tests/browser-qa-ai.cjs` (99), `npm test` (25) – vše PASS; `node tests/browser-qa-ai.cjs`, `npm test` – bez sítě a placených volání.

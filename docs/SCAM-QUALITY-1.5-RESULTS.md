# RODINNÝ ŠTÍT 1.5 — kvalitativní testy a nezávislé vyhodnocení

**Datum:** 1. listopadu 2026 · **Stav:** chráněná vývojová větev, nikoli veřejné vydání.
**Větev:** `feature/scam-quality-1.5`; původní vizuální základ Pilot 1.1 zůstává zachován.

## Co verze 1.5 mění

Vylepšuje **místní pravidla** pro české zprávy, bez síťové AI analýzy. Hodnotí kombinace konkrétního požadavku, peněz nebo přístupových údajů, předstírané autority a časového tlaku. Lépe zachází s textem bez diakritiky, fotografiemi dokladů, předáváním hotovosti, změnou bankovních údajů a falešnou podporou. Odlišuje výuková varování a popisy již provedených transakcí od skutečných pokynů k odeslání peněz či kódů.

Každý nalezený varovný znak musí obsahovat **doslovný úryvek analyzované zprávy**. Výsledek LOW ani AI nejsou potvrzením bezpečnosti nebo identity odesílatele.

## Jediná nezávislá kontrolní sada C — neměněný výsledek

Nová sada `evaluation/holdout-c-1.5:tests/holdout-c-1.5.json` byla vytvořena a uzavřena **před implementací 1.5**. Obsahuje 60 originálních, *fiktivních* zpráv: 30 podvodných scénářů (očekává se HIGH), 20 běžných (LOW) a 10 nejednoznačných (MODERATE). Žádné přesné duplicity původních 120 vývojových případů. Tato sada nebyla použita k ladění.

- **Baseline Pilot 1.4:** commit `df972b2f7af1288da8cac80c3eb6e2b57ff7904d`; `assets/app.js` blob `73a01feed1f9908428bd0da93b233ac2e45a5435`.
- **První zmrazený kandidát 1.5:** commit `3bca2611f64603e3245c72eba7789b6ebde999a2`; blob `05e4d95dbb75674e7fe29250a702a998afc0932d`.
- **Uzavření sady C:** commit `0ba6f5a26776b94875e60fa10252268aecb64e09`, blob `a08a41a03ddc2b8387ea08af0b601e6e52e4540d`.
- Nezávislý vyhodnocovací nástroj: `evaluation/holdout-c-1.5:tests/eval-c-1.5.cjs`.

| Očekávaná skupina / detekovaná úroveň | 1.4 HIGH | 1.4 MODERATE | 1.4 LOW | 1.5 HIGH | 1.5 MODERATE | 1.5 LOW |
|---|---:|---:|---:|---:|---:|---:|
| Fiktivní podvod (30) | 19 | 5 | 6 | **22** | 3 | **5** |
| Nejednoznačné (10) | 0 | 5 | 5 | 0 | **6** | 4 |
| Běžné (20) | 1 | 4 | 15 | 1 | 2 | **17** |

**Celková shoda s očekávanými třídami:** 39/60 → **45/60** (+6).
**Fiktivní hrozby označené HIGH:** 19/30 → **22/30** (+3).
**Běžné zprávy označené správně LOW:** 15/20 → **17/20** (+2).

Kritické nedostatky: **5/30** záměrně podvodných scénářů označeno LOW, **1/20** běžných zpráv označena HIGH. Tímto výsledkem nelze zdůvodnit veřejné prohlášení o spolehlivé detekci. Při nezávislém testu všech 60 nových zpráv nebyla nalezena nepravdivě citovaná pasáž ani chybějící zvýraznění; všechny měly 2–5 doporučených kroků.

**Pozor:** syntetické příklady s hypotetickými třídami nejsou odborně označený, reprezentativní vzorek skutečných SMS. **45/60 není reálná přesnost** a 22/30 nelze vydávat za skutečnou citlivost detekce. Po této jediné kontrole již nelze sadu C použít k nezávislému ověřování dalších oprav. Příští iterace potřebuje novou nedotčenou sadu D.

## Technická regrese

- Vývojové sady: 100 dřívějších + 20 z hardening 1.3 + **45 nových** = **165/165** očekávaných lokálních klasifikací.
- GitHub Actions **run 41256475436**: `npm test` **211/211**, Chromium UI **269/269**, Chromium AI/mock **111/111**, žádné JavaScript/HTTP chyby.
- AI model: **žádná skutečná placená volání**. Souhlas, chyby, kvóty a návrat k lokálním pravidlům ověřeny pomocí mock serveru.
- Preview projekt stále používá Vercel Authentication; `AI_TEST_EXPIRES_AT=2026-10-31T22:00:00Z` již vypršel. Není dovoleno toto omezení prodlužovat automaticky.
- Production, `main` a veřejný soutěžní web zůstávají beze změny.

## Přijetí vlastníkem a další brány

Na reálném Androidu musí vlastník teprve ověřit nový pilot 1.5 (správné červené/modré výsledky, funkčnost tlačítek, čitelnost a nezměněný vizuál). **Dosud schválená kontrola telefonu platila pro 1.4, ne pro 1.5.**

Před veřejným vydáním: odborně zkontrolované anonymizované české zprávy, analýza nákladů falešných poplachů a přehlédnutých hrozeb, nezávislá sada D, bezpečnostní a soukromí audit, a případně samostatně schválené placené testy AI.

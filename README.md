# RODINNÝ ŠTÍT — AI výzva pro Česko 2026

**Soutěžní pilot 0.7:** digitální pomocník pro prevenci podvodů v rodinách.

## Co umí ukázka

- Průvodce podezřelými SMS a e-maily.
- Vložení screenshotu a OCR přímo v prohlížeči pomocí Tesseract.js.
- Identifikace typických varovných znaků a vysvětlení bezpečného dalšího kroku.
- Scénáře pro podvodný telefonát a reklamu.
- Rady při incidentu: zaslané peníze, sdílený kód nebo heslo, vzdálený přístup.
- Lokální pravidla jako záložní režim při nedostupnosti serverového AI.

## Soubory

- `index.html` — česká prezentační stránka pro hodnotitele.
- `pilot.html` — původní interaktivní mobilní pilot 0.7 v ruštině.
- `.nojekyll` — usnadňuje publikaci na GitHub Pages.

## Transparentnost a bezpečnost

Pilot obsahuje klientskou integraci pro `/api/analyze`, ale **ve statické veřejné ukázce tento endpoint neběží**. Není-li API dostupné, ukázka používá lokální pravidla. V této verzi se **neprovádí detekce deepfake médií** ani ověření identity volajícího. OCR je prováděno v prohlížeči; potřebná knihovna a jazyková data se mohou stáhnout přes internet. Neposílejte do demonstrace hesla, PIN ani jednorázové kódy.

## Rychlá publikace přes GitHub Pages

1. Nahrajte soubory do kořene veřejného repozitáře.
2. Otevřete **Settings → Pages → Build and deployment**.
3. Nastavte **Deploy from a branch**, větev `main`, složka `/ (root)`, a uložte.
4. Po dokončení nasazení otevřete adresu uvedenou v GitHub Pages.

**Status:** Funkční uživatelský pilot v ruštině, česká lokalizace a plná serverová AI integrace v dalším vývoji.
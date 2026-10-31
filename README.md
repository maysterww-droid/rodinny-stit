# RODINNÝ ŠTÍT — soutěžní demonstrátor 0.9 + příprava AI 1.0

> **Větev `feature/ai-analysis-1` (31. 10. 2026):** serverová AI analýza (OpenAI Responses, strukturovaný výstup) byla nasazena na chráněném Vercel Preview a majitel na telefonu ověřil jeden AI výsledek. **Po jednorázové zkoušce je AI opět vypnutá**; spotřeba tokenů a skutečná cena dosud nejsou potvrzeny serverovými logy. Veřejné GitHub Pages a Production zůstávají bez změny. Nová iterace 1.0 hlídá i to, aby citace modelu byly obsaženy ve zdrojové zprávě. Viz [`docs/AI-SETUP.md`](docs/AI-SETUP.md).

**AI výzva pro Česko 2026 · prevence digitálních podvodů**

RODINNÝ ŠTÍT pomáhá rodinám, seniorům a lidem bez technického vzdělání lépe se rozhodovat v podezřelých digitálních situacích. Nejprve porozumět riziku, potom bezpečně jednat.

## [Otevřít prezentaci a interaktivní pilot](https://maysterww-droid.github.io/rodinny-stit/)

### Co můžete vyzkoušet

- **Podezřelá zpráva** — vložte text nebo vyberte jednu ze smyšlených ukázek: nové číslo člena rodiny, falešná banka, podvodná zásilka, investiční podvod. Výsledek ukáže úroveň rizika, vysvětlené signály, zvýrazněné výrazy ve zprávě a konkrétní další kroky.
- **Snímek obrazovky** — volitelné rozpoznání češtiny a angličtiny v prohlížeči (Tesseract.js). Text můžete před analýzou opravit a anonymizovat.
- **Orientační vyhodnocení** — vysvětlení varovných signálů, míry nejistoty a bezpečného dalšího kroku.
- **Telefonát a reklama** — bezpečné postupy pro časté typy online manipulace.
- **Pomoc po incidentu** — uživatel už poslal peníze, předal přihlašovací údaje nebo povolil vzdálený přístup; důležitá čísla 158 a 112.
- **Krátký trénink** — tři interaktivní scénáře pro bezpečnější rozhodování.

### Transparentnost a bezpečnost

Jde o **pilotní demonstrátor, nikoli dokončený bezpečnostní produkt**. Ve veřejné verzi **není napojen živý serverový AI model ani databáze podvodných webů**. Ukázka orientačně vyhodnocuje text pomocí lokálních, vysvětlitelných pravidel. Výsledek **neověřuje pravost odesílatele, obrázku, zvuku ani videa a není zárukou bezpečnosti**.

- Text zprávy není odesílán našemu serveru a není ukládán do databáze ani do prohlížečového úložiště.
- OCR běží v prohlížeči pomocí knihovny Tesseract.js, jejíž kód a jazyková data se stahují z CDN až při prvním použití rozpoznávání. Obrázek se nahrává pouze do prohlížeče, nikoliv do našeho backendu.
- Uživatel je upozorněn, aby nezadával hesla, PIN ani jednorázové kódy.
- Před nasazením skutečné AI analýzy je nutné ověřit kvalitu, bezpečnost, minimalizaci dat a soulad s GDPR.

### Architektura

Statický web HTML + CSS + JavaScript, bez backendu a bez build procesu. `index.html` je česká prezentace projektu; `pilot.html` samostatná interaktivní aplikace; `assets/app.js` vyhodnocovací logika, `assets/site.js` mobilní menu, `assets/style.css` vizuální systém (mobile-first). Vlastní grafika: `logo.svg` / `favicon.svg` (štít s rodinou a domem), fotorealistický AI obrázek rodiny `hero-family-*.webp/jpg` (zdroj v `assets/CREDITS.md`, příprava `tools/prepare-hero.py`), noční scéna domu `night-home-*.webp/jpg` (AI, `tools/prepare-night.py`), sada ikon `icons.svg`. Písma Inter a Caveat jsou hostována lokálně (SIL OFL 1.1, `assets/fonts`). GitHub Pages publikuje větev `main` ze složky `/`.

### Kontrola

`node --check assets/app.js`, `node tests/smoke.cjs` (pravidla a ošetření textu) a `node tests/browser-qa.cjs` (Playwright: 360/390/430/1440 px, menu, celý tok pilotu, OCR UI, nouzové obrazovky, odkazy). Snímky a srovnání s referencí jsou ve složce `qa/`.

### Následující vývoj

Ověření na testovacích sadách podvodných scénářů, zpětná vazba seniorů a rodin, bezpečné serverové API pro jazykové modely, rozšíření češtiny a dalších jazyků, důsledná ochrana osobních údajů a dostupné odborné konzultace.

**Licence a autorství:** Koncept, kód a grafika soutěžního prototypu RODINNÝ ŠTÍT. Třetí strany: Tesseract.js (Apache 2.0), písma Inter a Caveat (SIL OFL 1.1). Nejde o oficiální službu policie, banky ani státní správy.

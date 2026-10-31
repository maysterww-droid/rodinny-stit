# RODINNÝ ŠTÍT — soutěžní demonstrátor 0.8

**AI výzva pro Česko 2026 · prevence digitálních podvodů**

RODINNÝ ŠTÍT pomáhá rodinám, seniorům a lidem bez technického vzdělání lépe se rozhodovat v podezřelých digitálních situacích. Nejprve porozumět riziku, potom bezpečně jednat.

## [Otevřít prezentaci a interaktivní pilot](https://maysterww-droid.github.io/rodinny-stit/)

### Co můžete vyzkoušet

- **Podezřelá zpráva** — vložte text nebo vyberte jednu ze tří předpřipravených ukázek: nové číslo člena rodiny, falešná banka, podvodná zásilka.
- **Snímek obrazovky** — volitelné rozpoznání češtiny a angličtiny v prohlížeči (Tesseract.js). Text můžete před analýzou opravit a anonymizovat.
- **Orientační vyhodnocení** — vysvětlení varovných signálů, míry nejistoty a bezpečného dalšího kroku.
- **Telefonát a reklama** — bezpečné postupy pro časté typy online manipulace.
- **Pomoc po incidentu** — uživatel už poslal peníze, předal přihlašovací údaje nebo povolil vzdálený přístup.
- **Krátký trénink** — tři interaktivní scénáře pro bezpečnější rozhodování.

### Transparentnost a bezpečnost

Jde o **pilotní demonstrátor, nikoli dokončený bezpečnostní produkt**. Ve veřejné verzi **není napojen živý serverový AI model ani databáze podvodných webů**. Ukázka orientačně vyhodnocuje text pomocí lokálních, vysvětlitelných pravidel. Výsledek **neověřuje pravost odesílatele, obrázku, zvuku ani videa a není zárukou bezpečnosti**.

- Text zprávy není odesílán našemu serveru a není ukládán do databáze ani do prohlížečového úložiště.
- OCR běží v prohlížeči pomocí knihovny Tesseract.js, jejíž kód a jazyková data se při prvním spuštění stahují z CDN. Obrázek se nahrává pouze do prohlížeče, nikoliv do našeho backendu.
- Uživatel je upozorněn, aby nezadával hesla, PIN ani jednorázové kódy.
- Před nasazením skutečné AI analýzy je nutné ověřit kvalitu, bezpečnost, minimalizaci dat a soulad s GDPR.

### Architektura

Statický web HTML + CSS + JavaScript, bez backendu a bez build procesu. `index.html` je česká prezentace projektu; `pilot.html` obsahuje samostatnou interaktivní aplikaci; `assets/app.js` vyhodnocovací logiku, `assets/style.css` vizuální systém a `assets/logo.svg` vlastní vektorové logo. GitHub Pages publikuje větev `main` ze složky `/`.

### Následující vývoj

Ověření na testovacích sadách podvodných scénářů, zpětná vazba seniorů a rodin, bezpečné serverové API pro jazykové modely, rozšíření češtiny a dalších jazyků, důsledná ochrana osobních údajů a dostupné odborné konzultace.

**Licence a autorství:** Koncept a kód soutěžního prototypu RODINNÝ ŠTÍT. Třetí strana: Tesseract.js pod příslušnou open-source licencí. Nejde o oficiální službu policie, banky ani státní správy.

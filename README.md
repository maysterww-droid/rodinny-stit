# RODINNÝ ŠTÍT — AI FIRST 2.1.2 (živá AI)

**Soutěžní projekt pro AI výzvu pro Česko 2026 · prevence digitálních podvodů**

[Veřejná prezentace](https://maysterww-droid.github.io/rodinny-stit/) · [Funkční AI kontrola](https://rodinny-stit-ai-preview-makster.vercel.app/pilot.html)

## Co už funguje

Veřejná verze **2.1.2 používá skutečnou AI** přes zabezpečený server. AI posoudí text podezřelé zprávy, vysvětlí varovné signály a doporučí bezpečný postup. Po samostatném souhlasu umí odpovědět také na doplňující otázky. Žádná registrace není potřebná.

**Rychlá ukázka:** zvolte smyšlenou SMS o novém čísle člena rodiny → zkontrolujte text a potvrďte souhlas s odesláním → spusťte AI analýzu → zeptejte se například „Proč je to podezřelé?“.

K dispozici zůstává i **místní orientační kontrola** bez odeslání textu AI. OCR rozpoznává text ze snímku v prohlížeči; uživatel může rozpoznaný text opravit. Doplněny jsou informace o podvodných hovorech, rychlé pomoci a tréninkové situace.

## Přesnost, soukromí a limity

- Před každým požadavkem AI je vidět upravený text a je nutný **výslovný souhlas**. U doplňujícího dotazu je souhlas samostatný.
- Při AI analýze se odsouhlasený text odešle přes backend poskytovateli jazykového modelu **OpenAI**. Automatické zakrývání osobních údajů nemusí zachytit všechno; náhled je třeba pečlivě zkontrolovat.
- AI **neověřuje totožnost odesílatele**, pravost hlasu, obrázku ani bankovního účtu a není zárukou bezpečnosti. Nikdy nevkládejte hesla, PIN ani jednorázové kódy.
- API má ochranu proti zneužití a limit výdajů do **5 USD za měsíc**. Soulad s GDPR zatím není deklarován jako odborně posouzený.

## Kde co běží

- **GitHub Pages, větev `main`:** český soutěžní landing `index.html`; starý `pilot.html` návštěvníka přesměruje na funkční AI.
- **Vercel Production:** https://rodinny-stit-ai-preview-makster.vercel.app/pilot.html. Stabilní serverová AI FIRST 2.1.2 z komitu `8b7c6b18e9943690386fceb9e4c21a9a311b9e57` v `feature/ai-first-2-1-quality-mobile`.
- Klíče AI se nepředávají prohlížeči. Bezpečnostní filtry odmítají neověřitelné tvrzení a při problému ukážou označené rezervní vysvětlení.

## Ověření

GitHub Actions pro aktuální AI 2.1.2: **223 Node/API**, **271 browser** a **141 AI mock testů** bez placených testovacích požadavků. Vlastník ověřil reálný výsledek a odpověď na doplňující dotaz v mobilním prohlížeči.

[Záznam testů AI FIRST 2.1.2](https://github.com/maysterww-droid/rodinny-stit/actions/runs/41302831225)

RODINNÝ ŠTÍT zůstává nezávislým soutěžním pilotem. Není službou Policie ČR, banky ani státní správy.

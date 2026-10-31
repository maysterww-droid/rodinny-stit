# Owner QA · RODINNÝ ŠTÍT 0.9 (vizuální redesign)

Větev: `feature/cz-visual-polish` · PR #1 (draft) · **main ani GitHub Pages nebyly změněny.**

## Srovnání s referencí
- `compare-landing.jpg` – koncept (desktop) vs. skutečná první obrazovka 390 px
- `compare-pilot-390.jpg` – dvě mobilní obrazovky konceptu vs. skutečný pilot 390 px
- `reference/owner-concept.png` – schválená reference vlastníka
- `before/` – stav 0.8 (390 px) pro srovnání

## Snímky skutečného webu (Chromium/Playwright, mobilní emulace, DPR 2)
`v09/index-{360,390,430,1440}-*` a `v09/pilot-{360,390,430,1440}-*`:
první obrazovka, otevřené menu, střední sekce, celá stránka; pilot – úvod, ukázka, výsledek (vysoké/střední/bez signálů), záložka Hovor, OCR, rychlá pomoc, telefonát, trénink.

## Automatická kontrola
`node tests/smoke.cjs` (pravidla, ukázky, escapování, kroky) a `node tests/browser-qa.cjs` (255 kontrol: overflow, hamburger + Esc, CTA, ukázky → výsledek, zvýraznění, Zpět/Vpřed v prohlížeči, anonymizace, OCR, nouzové obrazovky, trénink, odkazy, assety, ikony). Výsledek: `v09/qa-log.txt` – vše PASS, žádné JS/HTTP chyby.

## Známé rozdíly oproti referenci (záměrné nebo otevřené)
1. **Fotografie rodiny** – nahrazena fotorealistickým obrázkem tří generací s telefonem, vygenerovaným v Canva (zobrazené osoby nejsou skutečné; zdroj v `assets/CREDITS.md`). WebP 45 kB (800 px) / 100 kB (1400 px), JPG záloha. QA kontroluje načtení, ořez ≤ 12 % (mobil 0 %, desktop ~10 %) a že štít, poznámka, karta, obrázky a tlačítka nejsou oříznuté.
2. **„AI analýza / AI asistent“** v referenci nahrazeno textem „Kontrola zprávy · lokální pravidla“ – veřejný pilot nemá serverový AI model (požadavek pravdivosti).
3. Písmo v pilotu je větší než v referenci (min. 16 px u vstupů a textu) kvůli čitelnosti pro seniory.
4. OCR: v QA prostředí je CDN jsDelivr blokovaná – ověřeno ošetření chyby a celý tok UI s náhradním OCR enginem. Reálné rozpoznávání `ces+eng` je nutné jednou ověřit na telefonu s internetem.
5. Testováno v Chromiu s emulací mobilu, ne na fyzickém Androidu – doporučena krátká kontrola na skutečném zařízení.

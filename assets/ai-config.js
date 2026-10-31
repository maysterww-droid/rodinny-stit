/* RODINNÝ ŠTÍT · konfigurace volitelné AI analýzy.
 * AI se nabízí jen na chráněném Vercel Preview, kde web i /api/analyze běží na stejném originu.
 * Na veřejné GitHub Pages (a kdekoli jinde) zůstává endpoint prázdný → AI volba se nezobrazí, pilot používá jen lokální pravidla.
 * Žádné tajemství (token, klíč) se do klienta ani do URL nevkládá. */
window.RODINNY_STIT_AI = { endpoint: /\.vercel\.app$/i.test(location.hostname) ? '/api/analyze' : '' };

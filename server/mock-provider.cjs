'use strict';
/* Simulovaný poskytovatel ve formátu OpenAI Responses API – POUZE pro testy a lokální vývoj.
 * Nikdy nevolá síť a nic nestojí. Výstup je zřetelně označen jako simulace. */
function mockResponse(obj, usage = { input_tokens: 1200, output_tokens: 300 }) {
  return { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(obj) }] }], usage };
}
function jsonRes(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function createMockFetch({ scenario = () => 'auto', calls = [] } = {}) {
  return async function mockFetch(url, init = {}) {
    if (!String(url).startsWith('https://api.openai.com/')) throw new Error('mock fetch: unexpected URL ' + url);
    const body = JSON.parse(init.body);
    calls.push({ url, body, auth: (init.headers || {}).Authorization });
    const text = (String(body.input).match(/<message>\n([\s\S]*)\n<\/message>/) || [, ''])[1];
    const mode = scenario(text);
    if (mode === '429') return jsonRes(429, { error: { message: 'rate limited' } });
    if (mode === '500') return jsonRes(500, { error: { message: 'server' } });
    if (mode === 'timeout') return new Promise((_, rej) => { init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });
    if (mode === 'garbage') return jsonRes(200, { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '<b>not json</b>' }] }] });
    if (mode === 'html') return jsonRes(200, mockResponse({ risk: 'high', scope: 'message_analysis', warning_signals: [{ name_cs: '<img src=x onerror=alert(1)>Nátlak', explanation_cs: '<script>alert(1)</script>', excerpt: '' }], explanation_cs: 'Test', recommended_steps: ['<b>Neodpovídejte</b>'], uncertainty_cs: '' }));


    // Mock follow-up requests are clearly labeled simulations; NO real model or network.
    const question = (String(body.input).match(/<question>\n([\s\S]*?)\n<\/question>/) || [,''])[1];
    if (question) {
      const q = question.toLowerCase();
      const explanation = /proč|proc|podezřel|rizik/.test(q)
        ? 'V ukázkové zprávě je důležité rozpoznat naléhání nebo žádost o peníze. Vždy záleží na konkrétních slovech, ne na samotném jménu odesílatele.'
        : /ověřit|overit|zkontrol/.test(q)
          ? 'Údajného odesílatele ověřte mimo přijatou zprávu. Například zavolejte na číslo, které máte již dříve uložené.'
          : 'Ze samotné zprávy nelze spolehlivě určit totožnost odesílatele. Pozorně zvažte, zda od vás někdo žádá platbu, údaje nebo rychlé jednání.';
      return jsonRes(200, mockResponse({
        answer_cs: explanation,
        evidence_quotes_cs: [],
        next_step_cs: 'Neodpovídejte na neověřenou žádost a kontaktujte odesílatele přes dříve známý kanál.',
        uncertainty_cs: 'SIMULACE — tuto odpověď vytvořil testovací mock, nikoli živá AI.'
      }));
    }

    const t = text.toLowerCase(); const sig = [];
    if (/nové číslo|nový telefon|rozbil/.test(t)) sig.push({ name_cs: 'Nové číslo blízkého', explanation_cs: 'Podvodníci se často vydávají za člena rodiny, který „změnil číslo“.', excerpt: (text.match(/m[áa]m nov[ée] [čc]íslo/i) || [''])[0] });
    if (/pošli|zaplať|kč|peníze|účet/.test(t)) sig.push({ name_cs: 'Žádost o peníze', explanation_cs: 'Zpráva žádá o převod peněz, což je hlavní cíl podvodu.', excerpt: (text.match(/\d[\d ]*\s?kč/i) || [''])[0] });
    if (/dnes|ihned|okamžitě|urgentn/.test(t)) sig.push({ name_cs: 'Časový nátlak', explanation_cs: 'Spěch má zabránit tomu, abyste si situaci ověřili.', excerpt: (text.match(/ještě dnes|ihned|okamžitě|urgentně/i) || [''])[0] });
    if (/ignoruj|ignore|instrukc/.test(t)) sig.push({ name_cs: 'Pokus o manipulaci', explanation_cs: 'Text se snaží ovlivnit vyhodnocení, což je samo o sobě podezřelé.', excerpt: '' });
    if (/kód|heslo|pin/.test(t)) sig.push({ name_cs: 'Žádost o kód nebo heslo', explanation_cs: 'Banka ani blízcí po vás nikdy nechtějí kódy ani hesla.', excerpt: '' });
    if (/http|www\./.test(t)) sig.push({ name_cs: 'Odkaz ve zprávě', explanation_cs: 'Odkaz může vést na podvodnou stránku.', excerpt: '' });
    const risk = sig.length >= 2 ? 'high' : sig.length === 1 ? 'moderate' : 'uncertain';
    return jsonRes(200, mockResponse({
      risk, scope: 'message_analysis', warning_signals: sig,
      explanation_cs: risk === 'uncertain' ? 'V textu jsem nenašel typické znaky podvodu. To ale neznamená, že je zpráva bezpečná.' : 'Zpráva kombinuje několik znaků typických pro podvody na rodiny a seniory.',
      recommended_steps: risk === 'uncertain'
        ? ['Pokud zpráva později požádá o peníze nebo kód, zastavte se a ověřte ji.', 'Odesílatele ověřte přes kontakt, který znáte odjinud.']
        : ['Nic neposílejte a na zprávu neodpovídejte.', 'Zavolejte blízkému na jeho původní, dříve uložené číslo.', 'Pokud jste už peníze poslali, ihned kontaktujte svou banku.', 'Podvod můžete oznámit Policii ČR (158).'],
      uncertainty_cs: 'Jde o simulovanou odpověď testovacího režimu, ne o skutečný jazykový model.'
    }));
  };
}
module.exports = { createMockFetch };

'use strict';
/* Lokální vývojový server: statický web + /api/analyze se SIMULOVANÝM modelem (žádné placené volání).
 * node server/dev-server.cjs [port]   ·   scénáře chyb: text obsahující MOCK:429 | MOCK:500 | MOCK:TIMEOUT | MOCK:GARBAGE | MOCK:HTML */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { createHandler } = require('./core.cjs');
const { memoryStore } = require('./store.cjs');
const { createMockFetch } = require('./mock-provider.cjs');

function start({ port = 8790, env = {}, root = path.join(__dirname, '..') } = {}) {
  const fullEnv = {
    AI_ENABLED: 'true', OPENAI_API_KEY: 'sk-test-not-a-real-key', OPENAI_MODEL: 'mock-model (simulace)',
    ALLOWED_ORIGINS: `http://localhost:${port}`, RATE_LIMIT_SALT: 'dev-salt-0123456789abcdef', ALLOW_MEMORY_STORE: 'true',
    VERCEL_ENV: 'preview', // mock-only local fixture; production still requires a protected Vercel Preview
    PRICE_INPUT_PER_MTOK_USD: '0.75', PRICE_OUTPUT_PER_MTOK_USD: '4.5', // simulace – jen pro výpočet limitů
    PROVIDER_TIMEOUT_MS: '1500', ...env
  };
  const scenario = t => { const m = t.match(/MOCK:(429|500|TIMEOUT|GARBAGE|HTML)/); return m ? m[1].toLowerCase() : 'auto'; };
  const api = createHandler({ env: fullEnv, store: memoryStore(), fetchImpl: createMockFetch({ scenario }), log: () => {} });
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
  const srv = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/api/analyze') return api(req, res);
    if (p === '/assets/ai-config.js') { // v dev režimu míří klient na lokální API
      res.writeHead(200, { 'content-type': 'text/javascript' });
      return res.end(`window.RODINNY_STIT_AI = { endpoint: '/api/analyze' };`);
    }
    const f = path.join(root, p.endsWith('/') ? p + 'index.html' : p);
    if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
  });
  return new Promise(r => srv.listen(port, () => r(srv)));
}
if (require.main === module) start({ port: Number(process.argv[2]) || 8790 }).then(() => console.log('dev server (simulovaný model) běží na http://localhost:' + (Number(process.argv[2]) || 8790)));
module.exports = { start };

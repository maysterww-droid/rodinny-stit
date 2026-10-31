'use strict';
/* Trvalé čítače pro limity (serverless-safe): Upstash Redis REST (= Vercel KV / Marketplace Redis).
 * Ukládají se jen čítače s expirací (hash IP s tajnou solí, denní souhrny). Žádné texty zpráv. */

function upstashStore({ url, token, fetchImpl = fetch, timeoutMs = 3000 }) {
  if (!url || !token) return null;
  async function pipeline(cmds) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(url.replace(/\/$/, '') + '/pipeline', {
        method: 'POST', signal: ctl.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cmds)
      });
      if (!r.ok) throw new Error('store_http_' + r.status);
      const out = await r.json();
      if (!Array.isArray(out) || out.some(x => x && x.error)) throw new Error('store_error');
      return out.map(x => x.result);
    } finally { clearTimeout(t); }
  }
  return {
    kind: 'upstash',
    /** Atomicky přičte `by` a nastaví expiraci (jen při prvním zápisu). Vrací novou hodnotu. */
    async incr(key, by, ttlSec) {
      const [val] = await pipeline([['INCRBY', key, String(by)], ['EXPIRE', key, String(ttlSec), 'NX']]);
      return Number(val);
    }
  };
}

/** Pouze pro testy a lokální vývoj – v produkci se nepoužije (nepřežije více instancí). */
function memoryStore() {
  const m = new Map();
  return {
    kind: 'memory',
    async incr(key, by, ttlSec) {
      const now = Date.now(); const cur = m.get(key);
      const v = (cur && cur.exp > now ? cur.v : 0) + by;
      m.set(key, { v, exp: cur && cur.exp > now ? cur.exp : now + ttlSec * 1000 });
      return v;
    }
  };
}

module.exports = { upstashStore, memoryStore };

'use strict';
/* Trvalé čítače pro limity (serverless-safe): Upstash Redis REST (= Vercel KV / Marketplace Redis).
 * Ukládají se jen čítače s expirací (hash IP s tajnou solí, denní souhrny). Žádné texty zpráv. */


const LUA_RESERVE = [
  "local v1=tonumber(redis.call('GET',KEYS[1]) or '0')",
  "local v2=tonumber(redis.call('GET',KEYS[2]) or '0')",
  "local v3=tonumber(redis.call('GET',KEYS[3]) or '0')",
  "local v4=tonumber(redis.call('GET',KEYS[4]) or '0')",
  "local v5=tonumber(redis.call('GET',KEYS[5]) or '0')",
  "local cost=tonumber(ARGV[6])",
  "if v1>=tonumber(ARGV[1]) or v2>=tonumber(ARGV[2]) then return 'quota_user' end",
  "if v3>=tonumber(ARGV[3]) then return 'quota_global' end",
  "if v4+cost>tonumber(ARGV[4]) or v5+cost>tonumber(ARGV[5]) then return 'quota_budget' end",
  "for i=1,3 do redis.call('INCR',KEYS[i]); redis.call('EXPIRE',KEYS[i],tonumber(ARGV[i+6]),'NX') end",
  "redis.call('INCRBY',KEYS[4],cost); redis.call('EXPIRE',KEYS[4],tonumber(ARGV[10]),'NX')",
  "redis.call('INCRBY',KEYS[5],cost); redis.call('EXPIRE',KEYS[5],tonumber(ARGV[11]),'NX')",
  "return 'ok'"
].join('\\n');
const LUA_REFUND = [
  "local amount=tonumber(ARGV[1])",
  "if amount<=0 then return 0 end",
  "redis.call('INCRBY',KEYS[1],-amount)",
  "redis.call('INCRBY',KEYS[2],-amount)",
  "return 1"
].join('\\n');

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

  async function evalScript(script, keys, args) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(url.replace(/\/$/, ''), {
        method: 'POST', signal: ctl.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['EVAL', script, String(keys.length), ...keys, ...args.map(String)])
      });
      if (!r.ok) throw new Error('store_http_' + r.status);
      const data = await r.json();
      if (data.error || data.result == null) throw new Error('store_eval_error');
      return data.result;
    } finally { clearTimeout(t); }
  }

  return {
    kind: 'upstash',

    // One Lua EVAL atomically checks all quotas and reserves both budgets.
    // /pipeline alone is NOT atomic; using it for check-then-increment would overspend under contention.
    async reserve({ keys, limits, cost }) {
      const ordered = [keys.hour, keys.ipDay, keys.globalDay, keys.dayBudget, keys.monthBudget];
      const args = [limits.hour, limits.ipDay, limits.globalDay, limits.dayBudget, limits.monthBudget,
        cost, 3700, 90000, 90000, 90000, 35 * 86400];
      return evalScript(LUA_RESERVE, ordered, args);
    },
    async refund({ keys, amount }) {
      if (!(amount > 0)) return;
      await evalScript(LUA_REFUND, [keys.dayBudget, keys.monthBudget], [amount]);
    },
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

    // Test-only in-memory equivalent of one atomic reservation; no awaits inside.
    async reserve({ keys, limits, cost }) {
      const now = Date.now();
      const get = key => { const c = m.get(key); return c && c.exp > now ? c.v : 0; };
      const ordered = [keys.hour, keys.ipDay, keys.globalDay, keys.dayBudget, keys.monthBudget];
      const previous = ordered.map(get);
      if (previous[0] >= limits.hour || previous[1] >= limits.ipDay) return 'quota_user';
      if (previous[2] >= limits.globalDay) return 'quota_global';
      if (previous[3] + cost > limits.dayBudget || previous[4] + cost > limits.monthBudget) return 'quota_budget';
      const ttls = [3700, 90000, 90000, 90000, 35 * 86400];
      ordered.forEach((key, i) => {
        const old = m.get(key);
        m.set(key, { v: previous[i] + (i < 3 ? 1 : cost), exp: old && old.exp > now ? old.exp : now + ttls[i] * 1000 });
      });
      return 'ok';
    },
    async refund({ keys, amount }) {
      if (!(amount > 0)) return;
      const now = Date.now();
      for (const key of [keys.dayBudget, keys.monthBudget]) {
        const old = m.get(key);
        if (old && old.exp > now) m.set(key, { v: old.v - amount, exp: old.exp });
      }
    },
    async incr(key, by, ttlSec) {
      const now = Date.now(); const cur = m.get(key);
      const v = (cur && cur.exp > now ? cur.v : 0) + by;
      m.set(key, { v, exp: cur && cur.exp > now ? cur.exp : now + ttlSec * 1000 });
      return v;
    }
  };
}

module.exports = { upstashStore, memoryStore };

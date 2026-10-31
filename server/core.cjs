'use strict';
/* RODINNÝ ŠTÍT 1.0 · POST /api/analyze – bezpečná AI analýza podezřelé zprávy.
 * - API klíč jen v proměnných prostředí serveru; nikdy se neloguje.
 * - Text zprávy ani IP adresa se neukládají ani nelogují (jen anonymní čítače s expirací).
 * - Bez trvalého úložiště limitů se AI neaktivuje (fail-closed).
 */
const crypto = require('node:crypto');
const { callOpenAI, ProviderError } = require('./openai.cjs');
const { RESPONSE_SCHEMA } = require('./prompt.cjs');

/* Ceník (USD za 1M tokenů, standardní tarif). Zdroj: veřejné ceníky OpenAI k 31. 10. 2026 – před spuštěním ověřit.
 * Proměnné PRICE_* mohou ceny jen ZVÝŠIT (konzervativně), nikdy snížit. Neznámý model bez PRICE_* = AI se nezapne. */
const PRICES = {
  'gpt-5.4-mini': { in: 0.75, out: 4.5 },
  'gpt-5.4-nano': { in: 0.2, out: 1.25 },
  'gpt-6-luna': { in: 0.1, out: 0.5 },
  'gpt-5-mini': { in: 0.25, out: 2.0 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 } // zastaralý – vypnutí API 14. 1. 2027
};
const HARD_MAX_OUTPUT_TOKENS = 2000;

function readConfig(env) {
  const num = (k, d) => (env[k] !== undefined && env[k] !== '' && Number.isFinite(Number(env[k])) ? Number(env[k]) : d);
  const model = env.OPENAI_MODEL || 'gpt-5.4-mini';
  const table = PRICES[model];
  const envIn = num('PRICE_INPUT_PER_MTOK_USD', NaN), envOut = num('PRICE_OUTPUT_PER_MTOK_USD', NaN);
  const priceIn = table ? Math.max(table.in, Number.isFinite(envIn) ? envIn : 0) : envIn;
  const priceOut = table ? Math.max(table.out, Number.isFinite(envOut) ? envOut : 0) : envOut;
  return {
    enabled: env.AI_ENABLED === 'true',
    apiKey: env.OPENAI_API_KEY || '',
    model,
    reasoningEffort: env.OPENAI_REASONING_EFFORT === undefined ? 'low' : env.OPENAI_REASONING_EFFORT,
    origins: (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
    allowSameOrigin: env.ALLOW_SAME_ORIGIN !== 'false',
    vercelEnv: env.VERCEL_ENV || '',
    allowedVercelEnvs: (env.AI_ALLOWED_VERCEL_ENVS || 'preview').split(',').map(s => s.trim()).filter(Boolean),
    salt: env.RATE_LIMIT_SALT || '',
    maxChars: num('MAX_CHARS', 3000),
    maxTextBytes: num('MAX_TEXT_BYTES', 6000),
    maxBodyBytes: num('MAX_BODY_BYTES', 16384),
    maxOutputTokens: Math.min(num('MAX_OUTPUT_TOKENS', 1200), HARD_MAX_OUTPUT_TOKENS),
    overheadTokens: num('PROMPT_OVERHEAD_TOKENS', 500),
    timeoutMs: num('PROVIDER_TIMEOUT_MS', 20000),
    perIpHour: num('LIMIT_PER_IP_HOUR', 5),
    perIpDay: num('LIMIT_PER_IP_DAY', 15),
    globalDay: num('LIMIT_GLOBAL_DAY', 200),
    dailyBudgetUsd: num('DAILY_BUDGET_USD', 1),
    monthlyBudgetUsd: num('MONTHLY_BUDGET_USD', 5),
    priceInPerMTok: priceIn,
    priceOutPerMTok: priceOut
  };
}

/* ---- Garantovaná horní mez ceny jednoho volání ----
 * Vstup: OpenAI tokenizéry jsou byte-level BPE → každý token pokrývá ≥ 1 bajt UTF-8, takže počet vstupních tokenů
 * ≤ počet bajtů instrukcí + JSON Schema + obalené zprávy + pevná rezerva na rámování zpráv (overheadTokens).
 * Výstup: max_output_tokens je tvrdý strop na generované tokeny VČETNĚ reasoning tokenů.
 * Rezervuje se před voláním (atomicky), takže součet skutečných útrat nepřekročí rozpočet. */
const { INSTRUCTIONS, RESPONSE_SCHEMA: SCHEMA, buildInput } = require('./prompt.cjs');
const FIXED_INPUT_BYTES = Buffer.byteLength(INSTRUCTIONS) + Buffer.byteLength(JSON.stringify(SCHEMA));
function maxInputTokens(c, text) { return FIXED_INPUT_BYTES + Buffer.byteLength(buildInput(text)) + c.overheadTokens; }
function worstCaseMicroUsd(c, text) {
  return Math.ceil(maxInputTokens(c, text) * c.priceInPerMTok + c.maxOutputTokens * c.priceOutPerMTok);
}
function actualMicroUsd(c, u) { return Math.ceil(u.input * c.priceInPerMTok + u.output * c.priceOutPerMTok); }

const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);

/** Přísná validace a normalizace výstupu modelu – vše jako prostý text, omezené délky a výčty. */
function validateResult(p) {
  if (!p || typeof p !== 'object') return null;
  if (!RESPONSE_SCHEMA.properties.risk.enum.includes(p.risk)) return null;
  if (!RESPONSE_SCHEMA.properties.scope.enum.includes(p.scope)) return null;
  if (!Array.isArray(p.warning_signals) || !Array.isArray(p.recommended_steps)) return null;
  const signals = p.warning_signals.slice(0, 6).map(s => ({
    name_cs: clip(s && s.name_cs, 80), explanation_cs: clip(s && s.explanation_cs, 300), excerpt: clip(s && s.excerpt, 100)
  })).filter(s => s.name_cs);
  const steps = p.recommended_steps.slice(0, 5).map(s => clip(s, 240)).filter(Boolean);
  if (!steps.length) return null;
  return {
    risk: p.risk, scope: p.scope, warning_signals: signals,
    explanation_cs: clip(p.explanation_cs, 600), recommended_steps: steps, uncertainty_cs: clip(p.uncertainty_cs, 300)
  };
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(req.headers['x-real-ip'] || '') || (req.socket && req.socket.remoteAddress) || 'unknown';
}

async function readBody(req, limit) {
  if (req.body !== undefined) { // platforma (např. Vercel) už tělo zpracovala
    const s = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    if (Buffer.byteLength(s) > limit) throw Object.assign(new Error('too_large'), { http: 413 });
    return s;
  }
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('too_large'), { http: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function createHandler({ env = process.env, store, fetchImpl = fetch, now = () => Date.now(), log = (o) => console.log(JSON.stringify(o)) } = {}) {
  const cfg = readConfig(env);

  function send(res, status, body, origin) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.end(JSON.stringify(body));
  }
  const err = (res, status, code, origin, extra = {}) => send(res, status, { ok: false, error: code, ...extra }, origin);

  /** Dostupnost AI pro klienta (nic neutrácí). */
  function availability() {
    if (!cfg.enabled) return 'disabled';
    if (!cfg.apiKey) return 'not_configured';
    if (!store || store.kind === 'memory' && env.ALLOW_MEMORY_STORE !== 'true') return 'no_rate_limit_store';
    if (!cfg.salt || cfg.salt.length < 16) return 'no_salt';
    if (!cfg.origins.length && !cfg.allowSameOrigin) return 'no_origins';
    if (cfg.vercelEnv && !cfg.allowedVercelEnvs.includes(cfg.vercelEnv)) return 'env_not_allowed'; // např. production bez schválení
    if (!(cfg.priceInPerMTok > 0) || !(cfg.priceOutPerMTok > 0)) return 'no_pricing';
    if (!(cfg.dailyBudgetUsd > 0) || !(cfg.monthlyBudgetUsd > 0)) return 'no_budget';
    return 'available';
  }

  return async function handler(req, res) {
    const started = now();
    const origin = String(req.headers.origin || '');
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    const sameOrigin = !!origin && !!host && cfg.allowSameOrigin && origin === 'https://' + host;
    const listed = !!origin && cfg.origins.includes(origin);
    const allowed = listed ? origin : ''; // CORS hlavičky jen pro výslovně povolené cizí originy; same-origin je nepotřebuje
    const site = String(req.headers['sec-fetch-site'] || '');
    const day = new Date(now()).toISOString().slice(0, 10);
    const done = (status, code, extra = {}) => log({ evt: 'analyze', status, code, ms: now() - started, ...extra }); // bez textu, bez IP

    if (origin && !listed && !sameOrigin) { done(403, 'origin_not_allowed'); return err(res, 403, 'origin_not_allowed', ''); }
    if (site === 'cross-site' && !listed) { done(403, 'cross_site'); return err(res, 403, 'origin_not_allowed', ''); }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      if (allowed) {
        res.setHeader('Access-Control-Allow-Origin', allowed); res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Max-Age', '600');
      }
      return res.end();
    }

    const state = availability();
    if (req.method === 'GET') {
      return send(res, 200, { ok: true, ai: state === 'available', mode: state === 'available' ? 'ai' : 'local_only', maxChars: cfg.maxChars }, allowed);
    }
    if (req.method !== 'POST') return err(res, 405, 'method_not_allowed', allowed);
    if (state !== 'available') { done(503, 'ai_' + state); return err(res, 503, 'ai_unavailable', allowed); }
    if (!origin) { done(403, 'origin_missing'); return err(res, 403, 'origin_required', ''); } // prohlížeč posílá Origin u každého POST
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return err(res, 415, 'json_only', allowed);

    let body;
    try { body = JSON.parse(await readBody(req, cfg.maxBodyBytes)); }
    catch (e) { const s = e.http || 400; done(s, s === 413 ? 'too_large' : 'bad_json'); return err(res, s, s === 413 ? 'too_large' : 'bad_json', allowed); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return err(res, 400, 'bad_request', allowed);
    if (body.consent !== true) { done(400, 'no_consent'); return err(res, 400, 'consent_required', allowed); }
    if (body.language !== 'cs') return err(res, 400, 'unsupported_language', allowed);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return err(res, 400, 'empty_text', allowed);
    if (text.length > cfg.maxChars || Buffer.byteLength(text) > cfg.maxTextBytes) { done(413, 'too_long'); return err(res, 413, 'too_long', allowed, { maxChars: cfg.maxChars }); }

    // ---- limity (trvalé čítače, fail-closed) ----
    const ipKey = crypto.createHmac('sha256', cfg.salt).update(clientIp(req)).digest('hex').slice(0, 24);
    const hour = new Date(now()).toISOString().slice(0, 13);
    const month = day.slice(0, 7);
    const reserve = worstCaseMicroUsd(cfg, text); // garantovaná horní mez pro TENTO požadavek
    const budgetMicro = Math.floor(cfg.dailyBudgetUsd * 1e6), monthMicro = Math.floor(cfg.monthlyBudgetUsd * 1e6);
    try {
      const [h, d] = [await store.incr(`rs:ip:h:${hour}:${ipKey}`, 1, 3700), await store.incr(`rs:ip:d:${day}:${ipKey}`, 1, 90000)];
      if (h > cfg.perIpHour || d > cfg.perIpDay) { done(429, 'ip_quota'); return err(res, 429, 'quota_user', allowed); }
      const g = await store.incr(`rs:g:req:${day}`, 1, 90000);
      if (g > cfg.globalDay) { done(429, 'global_quota'); return err(res, 429, 'quota_global', allowed); }
      const spent = await store.incr(`rs:g:usd:${day}`, reserve, 90000);
      if (spent > budgetMicro) { await store.incr(`rs:g:usd:${day}`, -reserve, 90000); done(429, 'budget_day'); return err(res, 429, 'quota_budget', allowed); }
      const spentM = await store.incr(`rs:g:usdm:${month}`, reserve, 35 * 86400);
      if (spentM > monthMicro) {
        await store.incr(`rs:g:usdm:${month}`, -reserve, 35 * 86400); await store.incr(`rs:g:usd:${day}`, -reserve, 90000);
        done(429, 'budget_month'); return err(res, 429, 'quota_budget', allowed);
      }
    } catch { done(503, 'store_down'); return err(res, 503, 'ai_unavailable', allowed); }

    // ---- volání modelu (jediný pokus) ----
    try {
      const { parsed, usage } = await callOpenAI({ text, apiKey: cfg.apiKey, model: cfg.model, reasoningEffort: cfg.reasoningEffort, maxOutputTokens: cfg.maxOutputTokens, timeoutMs: cfg.timeoutMs, fetchImpl });
      const actual = actualMicroUsd(cfg, usage);
      if (actual > reserve) log({ evt: 'budget_bound_violated', reserve, actual }); // nemá nastat; skutečnost se započítá
      const diff = actual - reserve; // vrácení nevyužité části rezervace (jen po úspěšné odpovědi)
      if (diff) { try { await store.incr(`rs:g:usd:${day}`, diff, 90000); await store.incr(`rs:g:usdm:${month}`, diff, 35 * 86400); } catch { /* rezervace zůstane – bezpečnější směr */ } }
      const result = validateResult(parsed);
      if (!result) { done(502, 'invalid_model_output', { tin: usage.input, tout: usage.output }); return err(res, 502, 'ai_bad_output', allowed); }
      done(200, 'ok', { tin: usage.input, tout: usage.output, risk: result.risk });
      return send(res, 200, { ok: true, mode: 'ai', model: cfg.model, result }, allowed);
    } catch (e) {
      const code = e instanceof ProviderError ? e.code : 'provider_error';
      const status = code === 'provider_timeout' ? 504 : code === 'provider_rate_limited' ? 429 : 502;
      done(status, code);
      return err(res, status, code === 'provider_timeout' ? 'ai_timeout' : code === 'provider_rate_limited' ? 'ai_busy' : 'ai_failed', allowed);
    }
  };
}

module.exports = { createHandler, readConfig, validateResult, worstCaseMicroUsd, maxInputTokens, PRICES, HARD_MAX_OUTPUT_TOKENS };

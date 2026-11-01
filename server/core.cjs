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
    testExpiresAt: env.AI_TEST_EXPIRES_AT ? Date.parse(env.AI_TEST_EXPIRES_AT) : null,
    salt: env.RATE_LIMIT_SALT || '',
    quotaNamespace: /^[a-z][a-z0-9_-]{1,31}$/i.test(env.RATE_LIMIT_NAMESPACE || 'rs') ? (env.RATE_LIMIT_NAMESPACE || 'rs') : null,
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
const { INSTRUCTIONS, RESPONSE_SCHEMA: SCHEMA, buildInput, FOLLOWUP_INSTRUCTIONS, FOLLOWUP_SCHEMA, buildFollowupInput } = require('./prompt.cjs');
const FIXED_INPUT_BYTES = Buffer.byteLength(INSTRUCTIONS) + Buffer.byteLength(JSON.stringify(SCHEMA));
function maxInputTokens(c, text, task = null) {
  return (task
    ? Buffer.byteLength(task.instructions) + Buffer.byteLength(JSON.stringify(task.schema)) + Buffer.byteLength(task.input)
    : FIXED_INPUT_BYTES + Buffer.byteLength(buildInput(text))) + c.overheadTokens;
}
function worstCaseMicroUsd(c, text, task = null) {
  return Math.ceil(maxInputTokens(c, text, task) * c.priceInPerMTok + c.maxOutputTokens * c.priceOutPerMTok);
}
function actualMicroUsd(c, u) { return Math.ceil(u.input * c.priceInPerMTok + u.output * c.priceOutPerMTok); }

const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);

/** Přísná validace a normalizace výstupu modelu – vše jako prostý text, omezené délky a výčty. */
function validateResult(p, sourceText = null) {
  if (!p || typeof p !== 'object') return null;
  if (!RESPONSE_SCHEMA.properties.risk.enum.includes(p.risk)) return null;
  if (!RESPONSE_SCHEMA.properties.scope.enum.includes(p.scope)) return null;
  if (!Array.isArray(p.warning_signals) || !Array.isArray(p.recommended_steps)) return null;
  // A model may fabricate a convincing-looking quotation. Never present it as evidence
  // unless it occurs verbatim in the message actually sent to the model.
  const source = typeof sourceText === 'string' ? sourceText.toLocaleLowerCase('cs') : null;
  const signals = p.warning_signals.slice(0, 6).map(s => ({
    name_cs: clip(s && s.name_cs, 80), explanation_cs: clip(s && s.explanation_cs, 300), excerpt: clip(s && s.excerpt, 80)
  })).filter(s => s.name_cs && (!s.excerpt || source === null || source.includes(s.excerpt.toLocaleLowerCase('cs'))));
  if (p.scope === 'not_a_message' && p.risk !== 'uncertain') return null;
  // A confident risk label requires an identified signal, not an unsupported guess.
  if (p.risk !== 'uncertain' && !signals.length) return null;
  // High-risk results must include at least one grounded quotation when source is available.
  if (source !== null && p.risk === 'high' && !signals.some(s => s.excerpt && source.includes(s.excerpt.toLocaleLowerCase('cs')))) return null;
  const explanation = clip(p.explanation_cs, 600), uncertainty = clip(p.uncertainty_cs, 300);
  // Do not forward absolute guarantees or false claims that the sender was verified.
  const fakeAssurance = /(?<![\p{L}\p{N}])(?:(?:zpráva|sms|e-mail|odkaz|účet)\s+(?:je|jsou)\s+(?:(?:zcela|naprosto|určitě|bezpochyby|100\s*%)\s+)?bezpečn|ověřili jsme (?:totožnost|odesílatele)|zaručujeme bezpečn)/iu;
  if (fakeAssurance.test(explanation) || fakeAssurance.test(uncertainty) || signals.some(sig => fakeAssurance.test(sig.name_cs) || fakeAssurance.test(sig.explanation_cs))) return null;
  // The model generates advice, but can itself hallucinate a dangerous next step.
  // Filter such steps server-side, while permitting negated instructions like "Nesmažte".
  const unsafeStep = /\b(?:smažte|vymažte|smazat|vymazat|odstraňte|odstranit|zlikvidujte)\b|\b(?:sdělte|pošlete|přepošlete|nadiktujte|zadejte|vyplňte|zašlete)\b.{0,90}\b(?:kód|heslo|pin|cvv|frázi|seed phrase|platební kartu|číslo karty)\b|\b(?:klikněte|otevřete|přejděte)\b.{0,45}\b(?:odkaz|link)\b|\b(?:zaplaťte|převeďte|pošlete)\b.{0,80}(?:\b(?:peníze|částku|platbu|zálohu)\b|\d[\d ]{0,10}\s*(?:kč|czk))|\b(?:zavolejte|volejte)\b.{0,60}\b(?:na číslo ve zprávě|na uvedené číslo)\b/iu;
  const steps = p.recommended_steps.slice(0, 5).map(s => clip(s, 240)).filter(s => s && !unsafeStep.test(s) && !fakeAssurance.test(s));
  if (!steps.length) return null;
  // If an unsafe deletion instruction was removed, replace it with a concrete
  // evidence-preservation step rather than leaving a gap in the advice.
  if (p.risk !== 'uncertain' && steps.length < 5 && !steps.some(s => /uchov|uschov|ulož|nesmaž|nemaž|důkaz/iu.test(s))) {
    steps.push('Původní zprávu nemažte; uchovejte ji nebo snímek obrazovky jako případný důkaz.');
  }
  return {
    risk: p.risk, scope: p.scope, warning_signals: signals,
    explanation_cs: explanation, recommended_steps: steps, uncertainty_cs: uncertainty
  };
}


/** AI Q&A is never an identity verification, crime determination or safety guarantee. */
function validateFollowup(p) {
  if (!p || typeof p !== 'object' || typeof p.answer_cs !== 'string' ||
      typeof p.next_step_cs !== 'string' || typeof p.uncertainty_cs !== 'string') return null;
  if (!p.answer_cs.trim() || !p.next_step_cs.trim()) return null;
  // Reuse the existing conservative safety filter for explanation and advice.
  const checked = validateResult({
    risk: 'uncertain', scope: 'message_analysis', warning_signals: [],
    explanation_cs: p.answer_cs, recommended_steps: [p.next_step_cs],
    uncertainty_cs: p.uncertainty_cs
  });
  if (!checked || !checked.recommended_steps.length) return null;
  const answer = checked.explanation_cs;
  const dangerousAnswer = /(?:^|[.!?]\s+)(?:pošlete|sdělte|nadiktujte|vyplňte|zadejte|přepošlete)\s+.{0,90}(?:kód|heslo|pin|cvv|údaje z karty|obnovovací frázi)|(?:^|[.!?]\s+)(?:klikněte|otevřete)\s+.{0,70}(?:odkaz|link)|(?:^|[.!?]\s+)(?:zaplaťte|převeďte)\s+.{0,75}(?:kč|peníze|částku|platbu)|(?:^|[.!?]\s+)(?:smažte|vymažte)\s+(?:zprávu|důkazy)/iu;
  if (dangerousAnswer.test(answer)) return null;
  return {
    answer_cs: answer,
    next_step_cs: checked.recommended_steps[0],
    uncertainty_cs: checked.uncertainty_cs
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
    if (!store || typeof store.reserve !== 'function' || typeof store.refund !== 'function' || store.kind === 'memory' && env.ALLOW_MEMORY_STORE !== 'true') return 'no_rate_limit_store';
    if (!cfg.salt || cfg.salt.length < 16) return 'no_salt';
    if (!cfg.quotaNamespace) return 'invalid_quota_namespace';
    if (!cfg.origins.length && !cfg.allowSameOrigin) return 'no_origins';
    if (!cfg.vercelEnv || !cfg.allowedVercelEnvs.includes(cfg.vercelEnv)) return 'env_not_allowed'; // fail closed: no VERCEL_ENV or production
    if (cfg.testExpiresAt !== null && (!Number.isFinite(cfg.testExpiresAt) || now() >= cfg.testExpiresAt)) return 'test_window_closed'; // temporary one-call QA, fail closed on expiry
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
    const followup = body.kind === 'followup';
    if (body.kind !== undefined && body.kind !== 'analyze' && !followup) return err(res, 400, 'bad_request', allowed);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return err(res, 400, 'empty_text', allowed);
    if (text.length > cfg.maxChars || Buffer.byteLength(text) > cfg.maxTextBytes) { done(413, 'too_long'); return err(res, 413, 'too_long', allowed, { maxChars: cfg.maxChars }); }
    const question = followup && typeof body.question === 'string' ? body.question.trim() : '';
    if (followup && (question.length < 3 || question.length > 280 || Buffer.byteLength(question) > 600))
      return err(res, 400, 'invalid_question', allowed);
    const task = followup ? {
      name: 'scam_followup', instructions: FOLLOWUP_INSTRUCTIONS,
      schema: FOLLOWUP_SCHEMA, input: buildFollowupInput(text, question)
    } : null;

    // ---- limity (trvalé čítače, fail-closed) ----
    const ipKey = crypto.createHmac('sha256', cfg.salt).update(clientIp(req)).digest('hex').slice(0, 24);
    const hour = new Date(now()).toISOString().slice(0, 13);
    const month = day.slice(0, 7);
    const reserve = worstCaseMicroUsd(cfg, text, task); // garantovaná horní mez pro TENTO požadavek
    const budgetMicro = Math.floor(cfg.dailyBudgetUsd * 1e6), monthMicro = Math.floor(cfg.monthlyBudgetUsd * 1e6);

    const quotaKeys = {
      hour: `${cfg.quotaNamespace}:ip:h:${hour}:${ipKey}`,
      ipDay: `${cfg.quotaNamespace}:ip:d:${day}:${ipKey}`,
      globalDay: `${cfg.quotaNamespace}:g:req:${day}`,
      dayBudget: `${cfg.quotaNamespace}:g:usd:${day}`,
      monthBudget: `${cfg.quotaNamespace}:g:usdm:${month}`
    };
    try {
      // Single atomic Redis EVAL: no provider call unless all quotas and both budgets are reserved.
      const reservation = await store.reserve({
        keys: quotaKeys, cost: reserve,
        limits: { hour: cfg.perIpHour, ipDay: cfg.perIpDay, globalDay: cfg.globalDay,
          dayBudget: budgetMicro, monthBudget: monthMicro }
      });
      if (reservation !== 'ok') {
        const code = reservation === 'quota_user' ? 'quota_user' : reservation === 'quota_global' ? 'quota_global' : reservation === 'quota_budget' ? 'quota_budget' : 'ai_unavailable';
        const status = code === 'ai_unavailable' ? 503 : 429;
        done(status, reservation);
        return err(res, status, code, allowed);
      }
    } catch { done(503, 'store_down'); return err(res, 503, 'ai_unavailable', allowed); }

    // ---- volání modelu (jediný pokus) ----
    try {
      const { parsed, usage } = await callOpenAI({ text, apiKey: cfg.apiKey, model: cfg.model, reasoningEffort: cfg.reasoningEffort, maxOutputTokens: cfg.maxOutputTokens, timeoutMs: cfg.timeoutMs, fetchImpl, task });
      const actual = actualMicroUsd(cfg, usage);
      if (actual > reserve) log({ evt: 'budget_bound_violated', reserve, actual }); // nemá nastat; skutečnost se započítá
      const diff = actual - reserve; // vrácení nevyužité části rezervace (jen po úspěšné odpovědi)
      if (diff < 0) { try { await store.refund({ keys: quotaKeys, amount: -diff }); } catch { /* reservation stays, conservative */ } }
      const result = followup ? validateFollowup(parsed) : validateResult(parsed, text);
      if (!result) { done(502, 'invalid_model_output', { tin: usage.input, tout: usage.output }); return err(res, 502, 'ai_bad_output', allowed); }
      done(200, 'ok', { tin: usage.input, tout: usage.output, kind: followup ? 'followup' : 'analysis', ...(followup ? {} : { risk: result.risk }) });
      return send(res, 200, { ok: true, mode: followup ? 'followup' : 'ai', model: cfg.model, result }, allowed);
    } catch (e) {
      const code = e instanceof ProviderError ? e.code : 'provider_error';
      const status = code === 'provider_timeout' ? 504 : code === 'provider_rate_limited' ? 429 : 502;
      done(status, code);
      return err(res, status, code === 'provider_timeout' ? 'ai_timeout' : code === 'provider_rate_limited' ? 'ai_busy' : 'ai_failed', allowed);
    }
  };
}

module.exports = { createHandler, readConfig, validateResult, validateFollowup, worstCaseMicroUsd, maxInputTokens, PRICES, HARD_MAX_OUTPUT_TOKENS };

'use strict';
/* Server-to-server volání OpenAI Responses API se strukturovaným výstupem (JSON Schema, strict).
 * Bez opakování (žádné nekonečné retry), s časovým limitem a omezením výstupních tokenů. */
const { INSTRUCTIONS, RESPONSE_SCHEMA, buildInput } = require('./prompt.cjs');

class ProviderError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

async function callOpenAI({ text, apiKey, model, reasoningEffort = '', maxOutputTokens, timeoutMs, fetchImpl = fetch, baseUrl = 'https://api.openai.com/v1', task = null }) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let r;
  try {
    r = await fetchImpl(baseUrl + '/responses', {
      method: 'POST', signal: ctl.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        instructions: task ? task.instructions : INSTRUCTIONS,
        input: task ? task.input : buildInput(text),
        max_output_tokens: maxOutputTokens,  // tvrdý strop včetně reasoning tokenů
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        store: false,                       // neukládat odpověď u poskytovatele
        text: { format: { type: 'json_schema', name: task ? task.name : 'scam_analysis', strict: true, schema: task ? task.schema : RESPONSE_SCHEMA } }
      })
    });
  } catch (e) {
    throw new ProviderError(e && e.name === 'AbortError' ? 'provider_timeout' : 'provider_unreachable');
  } finally { clearTimeout(timer); }

  if (r.status === 429) throw new ProviderError('provider_rate_limited', 429);
  if (r.status >= 500) throw new ProviderError('provider_unavailable', r.status);
  if (!r.ok) throw new ProviderError('provider_rejected', r.status);

  let data;
  try { data = await r.json(); } catch { throw new ProviderError('provider_bad_json'); }
  if (data.status && data.status !== 'completed') throw new ProviderError('provider_incomplete'); // např. vyčerpán max_output_tokens
  const parts = (data.output || []).filter(o => o.type === 'message').flatMap(o => o.content || []);
  if (parts.some(p => p.type === 'refusal')) throw new ProviderError('provider_refusal');
  const raw = parts.filter(p => p.type === 'output_text').map(p => p.text).join('');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new ProviderError('provider_bad_output'); }
  const usage = data.usage || {};
  return { parsed, usage: { input: Number(usage.input_tokens) || 0, output: Number(usage.output_tokens) || 0 } };
}

module.exports = { callOpenAI, ProviderError };

'use strict';
// PUBLIC AI SHUTDOWN, 2026-11-11. Restore only after explicit owner approval.
// No OpenAI, Upstash, or paid provider imports on this public endpoint.
module.exports = function pausedPublicAi(req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  const isStatus = method === 'GET';
  res.statusCode = isStatus ? 200 : method === 'POST' ? 503 : 405;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end(JSON.stringify(
    isStatus
      ? { ok: true, ai: false, mode: 'local_only', maxChars: 3000 }
      : { ok: false, error: method === 'POST' ? 'ai_unavailable' : 'method_not_allowed' }
  ));
};

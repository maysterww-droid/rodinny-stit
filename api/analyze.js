'use strict';
// Vercel Serverless Function (Node.js runtime): POST /api/analyze, GET /api/analyze (dostupnost)
const { createHandler } = require('../server/core.cjs');
const { upstashStore } = require('../server/store.cjs');

const store = upstashStore({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
});
module.exports = createHandler({ env: process.env, store });

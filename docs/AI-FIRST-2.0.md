# RODINNÝ ŠTÍT 2.0 — AI FIRST

**Date:** 2026-11-01 · **Status:** protected Preview candidate / not a public production release.
**Development branch:** `feature/ai-first-2.0`.
**Owner-approved visual baseline:** Prague photograph, handset, green orbit, amber warning shield and intro animation remain unchanged.

## Purpose

Demonstrate AI as a useful, explainable assistant for Czech families rather than a keyword-only classifier. When a **real AI server is available**, the pilot now defaults to AI analysis while requiring explicit, fresh consent before sending anything. Local rules are an openly labelled fallback, not an imitation of AI.

### User journey

1. Paste a suspicious SMS, chat message or e-mail (or extract text from a screenshot using client-side OCR).
2. Read the edited/redacted text preview and confirm **one-time consent**; the main button then starts AI analysis.
3. AI shows a cautious risk estimate, exact grounded excerpts, an explanation, uncertainty and safe next steps in Czech.
4. On the AI result screen, ask one of three sample questions or type a custom question (3–280 characters, max 600 UTF-8 bytes).
5. The original *masked* message and this *masked* question are previewed; a separate checkbox is required **for every follow-up**. Prior questions and answers are not transmitted. No messages are stored.
6. One response shows a direct explanation and one safe next step. Answers are not identity verification or a safety guarantee.
7. Unavailable AI, quotas, timeout, malformed model output and offline state produce clear errors or local fallback. No autonomous retry or paid call.

### Engineering

- Reuses existing same-origin `/api/analyze`: `kind: 'followup'` is processed through the **same Redis quotas, atomic budget reservation, model allowlist, environment gates, expiry and origin protections** as the initial analysis.
- Independent strict JSON schema for follow-up `answer_cs`, `next_step_cs`, `uncertainty_cs`; input and user question are explicitly untrusted data.
- Before rendering, output is clipped, checked against prohibited assurances and dangerous instructions. The UI uses `textContent` for answer strings (no executable HTML).
- Original analysis retains existing evidence verification (literal source quotations), preservation-of-evidence rules and no claim of verified sender.
- All provider calls use Responses API with `store: false`; no chat history or message content is written to application logs.
- `server/mock-provider.cjs` provides **explicitly labelled simulation** only for tests; no live OpenAI calls.
- The AI-first explanation panel is added below the approved intro scene, preserving its appearance.

## Completed QA

**GitHub Actions run:** https://github.com/maysterww-droid/rodinny-stit/actions/runs/41258357166

- **217/217** Node tests: existing regressions, API quotas and budgets, consent, same-origin checks, follow-up schema and rejection of unsafe advice.
- **270/270** Chromium browser checks: base pilot, responsive widths and no JS/HTTP errors.
- **135/135** Chromium AI+mock checks: AI-first default, no posting without consent, follow-up questions, one POST per approved follow-up, masked previews and explicit simulation label.
- **Real OpenAI requests:** 0. **Paid AI costs:** $0.
- Android Owner QA for **this 2.0 branch**: still pending. Past owner approval applies to Pilot 1.5, not 2.0.

## Important release restrictions

At the last check the existing Vercel Preview was SSO-protected for **all deployments**, and `AI_ENABLED=false` on Preview. The previous temporary `AI_TEST_EXPIRES_AT=2026-10-31T22:00:00Z` had also expired. Neither setting has been changed here.

Thus the new protected Preview can demonstrate the **AI-first user interface and honest local fallback**, but cannot make paid AI calls or conduct a live conversation until the owner separately authorizes a **capped test budget and time window**. Do not misrepresent mock responses as real AI.

Production, `main`, the public competition GitHub Pages site, and approved Pilot 1.5 remain unchanged. Do not publicly expose the endpoint, remove authentication or extend the AI test window without privacy/security and explicit spending approval.

## Suggested Owner QA

- Confirm Prague/phone/green orbit/amber shield animation did not change.
- Confirm AI-first introduction is readable on Android and that an unavailable server is **clearly described as unavailable**.
- Confirm local fallback still produces the expected red/high and blue/low results.
- A live AI review requires a separate decision on activation. When approved, test only invented Czech messages, verify redaction and use exact budget caps, then test both suggested and typed follow-up questions.
- Public release requires separate security/privacy review, realistic independently reviewed messages and a clear public AI access/budget strategy.

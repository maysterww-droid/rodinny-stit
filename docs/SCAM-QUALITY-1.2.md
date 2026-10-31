# RODINNÝ ŠTÍT — SCAM QUALITY 1.2 / 100 Czech QA cases

**Date:** 31 October 2026 · **Scope:** development branch only, no paid AI calls.
**Visual baseline:** frozen at `97724dfbc3d48efda0d6448da62679a75a69ed8d`
(`backup/pilot-1.1-owner-approved-20261031`). No changes to Prague, handset, green orbit, amber shield, or intro animation.

## What changed

1. **100 synthetic Czech cases** in `tests/scenarios-cs.json`: 36 deliberately suspicious/fraud-like, 34 benign, 30 ambiguous. These are fictional messages, not real reported crimes.
2. Context-sensitive local rules: reduce benign false positives; detect credentials, bank account changes, QR payments, coercion/extortion, fake support, and account updates without assuming a standalone keyword proves fraud.
3. Tailored guidance: independent verification through known contacts, preserve evidence, do not scan unknown QR payment codes, contact Police ČR after threats. No claim that a message or sender is verified.
4. **AI output guardrails (server):** risk high/moderate requires signals; high risk with the source text requires a verbatim source quotation; invented excerpts and absolute safety claims are rejected. Remove harmful model-generated suggestions (delete evidence, send access codes, click message links, transfer money, call number from suspicious message), allow correctly negated safety advice. If all steps are unsafe, reject the answer and let the UI offer local fallback.
5. Source-of-analysis badge remains neutral blue information icon; never implies the message is safe. Visible test version `1.2`.

## Results and limits

| Measure | Result |
|---|---|
| Initial 100-case baseline (before contextual expansion) | 79/100 expected classes |
| After rule refinement | **100/100 expected classes**, manually evaluated against current source |
| Scenario categories | 36 fraud-like high, 34 benign low, 30 ambiguous moderate |
| Highlighted expressions | All checked excerpts belong to the provided synthetic texts |
| Recommendations | 100/100 cases had 2–5 steps, no tested absolute safety statements |
| Direct server output-safety checks | Normal advice accepted; unsupported verdicts, invented high-risk evidence and harmful instructions rejected |
| `npm test` / Node test runner | **Not executed in this integration session**; tests added and parsed; run locally or in CI before merge |
| Live paid model tests | **0** in this development iteration |
| Actual fraud-detection accuracy | **Unknown** |

**Do not describe 100/100 as 100% precision, recall, or real-world detection accuracy.** The same synthetic data was used to refine rules and verify behavior. A separate held-out corpus of authentic, anonymized Czech messages, expert-reviewed labels, and supervised testing is necessary before any accuracy claims. Keyword rules will miss novel wording, mixed languages, typos without diacritics, image-only content without successful OCR, voice impersonation, and scam schemes with subtle social engineering.

## How to reproduce

```bash
npm test             # legacy smoke + API mock + 100-scenario regression
npm run test:quality # scenarios only
npm run test:browser # browser regression (requires its documented dependencies)
```

## Next QA gate (no rollout without owner approval)

1. Run all Node and browser tests on the latest branch; manually inspect Android on 360–430 px after the build.
2. Build a genuinely independent held-out set (e.g., 50–100 anonymized Czech messages), reviewed by at least two people. Include false positive/negative analysis, typos, colloquial Czech, bank/courier text, QR, social-engineering and multilingual samples. Never commit real personal information.
3. Independently test OCR on a real Android device. A simulated OCR response does not validate actual recognition.
4. Only after **new, explicit budget approval**, evaluate a protected Preview with a small, pre-defined set of synthetic messages and monitor token usage/costs. No automatic promotion, no public API exposure.
5. Before public AI: security and privacy audit including GDPR, limits, data minimization, provider processing/retention, user notices, and incident response.

**Deployment policy:** protect Preview via Vercel Authentication. AI remains disabled unless a distinct owner-approved test enables it. Never change `main`, the competition website or Production as part of this branch.

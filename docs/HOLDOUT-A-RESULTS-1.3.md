# RODINNÝ ŠTÍT — Independent Holdout A / Pilot 1.2

**Evaluation date:** 2026-11-01 · **Mode:** read-only evaluation of frozen local rules, **zero paid AI requests**.

- Frozen code commit: `7b4109e4989ca6d646d14f7245cc875562529725`
- Frozen `assets/app.js` Git blob: `82c30b21643819923b99ce502dc7ae8d3d5af0c9`
- Holdout dataset: `tests/holdout-cs-a.json` (sealed before first evaluation, commit `502f15f`)
- Reproduction: `node tests/eval-holdout.cjs --json` on `feature/scam-heldout-1.3`
- The original 100-case development/regression set **was not** used as this holdout. There are no exact duplicates of source messages.
- Labels describe intended risk levels in fictional scenarios, **not** expert-verified facts. The dataset is not representative of Czech message frequencies.

## Primary outcome

**49/100 match** between expected and predicted levels.

| Expected ↓ / Detected → | HIGH | MODERATE | LOW | Total |
|---|---:|---:|---:|---:|
| HIGH (simulated scams) | 16 | 19 | 5 | 40 |
| MODERATE (ambiguous) | 1 | 8 | 16 | 25 |
| LOW (ordinary messages) | 0 | 10 | 25 | 35 |

- **24/40 fictional scam messages** did not receive HIGH, of which **five** received LOW.
- **10/35 ordinary messages** were flagged MODERATE, but none were flagged HIGH.
- **17/25 ambiguous messages** received a different level; many received LOW.
- HIGH detection in this challenge set: **16/40 = 40%**. This is NOT measured real-world fraud recall.
- Correct LOW among the benign set: **25/35 = 71.4%**. This is NOT an estimate of real-world specificity.
- HIGH precision within this artificially balanced set: **16/17 = 94.1%**; synthetic class priors make this unsuitable as a real-world precision estimate.

## Most consequential misses

1. **Social engineering without stock keywords:** family travel emergency, cash courier impersonating police, extortion using unusual wording, card photo request and OTP copy request were among the five LOW-scoring simulated threats.
2. **Czech variation / absent diacritics:** colloquial `posli` / `nevolej` etc. were sometimes only MODERATE, despite money and identity manipulation.
3. **Credible-looking official pretexts:** falsified traffic penalty / public portal, fake utility disconnection, parcel and prescription fees, account transfer changes.
4. **Cross-channel credentials and QR:** Signal linked-device QR, fake bank identity, card details, fake operator verification.
5. **Benign educational/transactional context:** warnings telling users *not* to give out PINs/codes, everyday use of URLs/QR codes, investment literacy talks, ordinary delivery notices, book returns and school materials triggered unsupported caution.

The reported failure IDs and the complete predictions are reproducible through the evaluator; the messages remain in the test file, not in logs or public user records.

## Correct engineering next step

**Do not tune the original classifier on this dataset and then claim improved independent performance.** That would contaminate Holdout A. Freeze it as the diagnostic baseline.

To improve the product:
1. Develop generalized semantic features on the original 100 training/regression cases plus **separately authored development fixtures** (negation/context handling, accent folding, mixed-language signals, payment requests and third-party identity claims).
2. Add safe "uncertain" escalation for borderline messages; avoid claiming a message is safe. Ensure severity and advice are consistent: a HIGH risk needs grounded quoted evidence.
3. Create a *new* isolated Holdout B before the next acceptance evaluation and do not adjust to its labels during that acceptance run.
4. In parallel, prepare a small **human-reviewed, anonymized real Czech message dataset** and an audit of threat/false-alarm costs; collect no sensitive real messages in a public repo.
5. Run `npm test`, security tests and browser/Android QA in a suitable CI/runner before enabling live AI or changing public deployment.

## Sources used for scenario categories (not copied victim SMS)

- Policie ČR: https://policie.gov.cz/kyberkriminalita/podvodne-sms-zpravy
- ČNB: https://www.cnb.cz/cs/dohled-financni-trh/ochrana-spotrebitele/online-podvody-chrante-sve-penize
- NÚKIB: https://portal.nukib.gov.cz/informacni-servis/aktualne/6acf2c21c712795fe005527f
- KB: https://www.kb.cz/cs/podpora/bezpecnost/aktualni-hrozby

## Safeguards

No OpenAI calls, no model token spending, no changes to the owner-approved Pilot 1.1 visual, `main`, Production, or public contest site. This is a source-control QA experiment. Vercel Preview is not required to run the independent classification test.

**Owner decision gate:** Treat synthetic 49/100 as a safety warning and engineering diagnostic, not as a public benchmark. Do not publish success claims without an independent real-world evaluation.

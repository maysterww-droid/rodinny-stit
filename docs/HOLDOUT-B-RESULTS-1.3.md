# RODINNÝ ŠTÍT 1.3 — Holdout B (single blind acceptance evaluation)

**Recorded:** 2026-11-01.
**Development classifier frozen before evaluation:** Git blob `9b2bc7cc0e81de38db7499aaa5b8c57672a5043f`, commit `61e0a9d69942d4ec39b59d45a64199bbf77c4545`.
**Sealed test data:** `feature/scam-heldout-b-1.3:tests/holdout-cs-b.json`, Git blob `497b85109a5caf42541bff409065a68b6c88be76`, initial seal commit `b738b2e`.

These 60 **fictional synthetic Czech messages** had no identical text in the development set. Their scenario labels were written and committed before the 1.3 hardening layer. They were first read and evaluated **after the hardening source was committed**. No source changes were made in response to Holdout B *before* this acceptance evaluation.

## Results

| Expected \ Detected | HIGH | MODERATE | LOW | Total |
|---|---:|---:|---:|---:|
| **Pilot 1.2** expected HIGH | 9 | 11 | 10 | 30 |
| **Pilot 1.3** expected HIGH | **15** | 7 | 8 | 30 |
| **Pilot 1.2** expected MODERATE | 0 | 3 | 7 | 10 |
| **Pilot 1.3** expected MODERATE | 0 | 3 | 7 | 10 |
| **Pilot 1.2** expected LOW | 0 | 6 | 14 | 20 |
| **Pilot 1.3** expected LOW | 1 | 5 | 14 | 20 |

**Overall expected-class matches:** Pilot 1.2: **26/60**; Pilot 1.3: **32/60**.

**Strong scam detection:** 9/30 -> **15/30**. **Serious misses labeled LOW:** 10 -> **8**.
**Benign LOW:** both **14/20**, with one false HIGH in Pilot 1.3.

No highlighted excerpt was found to mismatch its source message in the evaluation, and all advice lists contained 2–5 entries. Those narrow technical facts do not establish safety or helpfulness of advice.

## Interpretation and safety finding

The independent challenge set shows an improvement in *synthetic* high-risk detection, but the classifier is **not ready for deployment as a reliable sole protector**. Eight deliberately constructed scam-like messages received LOW, and one benign case received HIGH. This is evidence of limitations in phrase-matching and context processing, not measured population accuracy. The class mix was deliberately balanced and is not representative of real traffic.

**Specific bug found during post-evaluation inspection:** the access-code regex matches substring `pin` inside unrelated Czech words such as `skupiny`. This creates a false password/code signal. Any correction made after this evaluation constitutes **post-holdout development**; B must no longer be used to claim an unbiased improvement score for those later commits.

## Next release gate

1. Repair lexical boundaries and related false positives with new *developer* examples.
2. Freeze another untouched acceptance dataset before evaluating subsequent changes.
3. In parallel, improve safe uncertainty messaging and route truly ambiguous text to the optional, consented AI analysis in a protected Preview only when enabled by separate owner authorization.
4. Create a human-reviewed, privacy-safe real Czech dataset before marketing accuracy claims. Rules and an LLM cannot confirm sender identity, URLs, images, voices, or authenticity.
5. Run `npm test` plus browser/Android QA before merge or any public release.

**Cost / deployment:** No live AI calls or spending. No Production, competition site or `main` changes. Visual baseline Pilot 1.1 remains owner-approved and frozen.

## Post-holdout engineering change (NOT a new independent score)

After the single acceptance evaluation above was recorded, the developer discovered an
implementation bug: the substring `pin` in an ordinary Czech word (e.g. *skupiny*)
was misinterpreted as a secret PIN. Generic word boundaries were added in
`assets/app.js` (commit `f214907`) and a separate, differently worded
developer regression case was introduced. This was **after** looking at Holdout B.
Therefore **32/60 remains the only unbiased B result**. Re-running B after this
fix cannot be presented as a second independent benchmark.

Direct, local JavaScript checks now cover **120/120 development cases**
(100 original + 20 new, including grounded warning quotes and 2–5 next steps).
The complete Node `npm test` suite and physical Android have **not** yet been run
for this post-holdout branch. Public deployment remains blocked.

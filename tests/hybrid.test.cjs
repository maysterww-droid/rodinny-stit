// RODINNÝ ŠTÍT 1.4 — hybrid local/AI consent gates (no live server, no paid calls).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'pilot.html'), 'utf8');

function harness(provider) {
  const elements = new Map();
  const element = id => {
    if (elements.has(id)) return elements.get(id);
    const classes = new Set(id === 'home' ? ['active'] : []);
    const obj = {
      id, value: '', maxLength: 5000, checked: false, hidden: false,
      className: '', textContent: '', innerHTML: '', lastChild: { textContent: '' },
      style: {}, offsetWidth: 0,
      classList: {
        add: x => classes.add(x), remove: x => classes.delete(x),
        contains: x => classes.has(x),
        toggle(x, force) {
          const yes = force === undefined ? !classes.has(x) : force;
          if (yes) classes.add(x); else classes.delete(x);
          return yes;
        }
      },
      setAttribute(k, v) { this[k] = v; },
      getAttribute(k) { return this[k] || null; },
      focus() { this.focused = true; },
      scrollIntoView() { this.scrolled = true; },
      addEventListener(k, fn) { this['on_' + k] = fn; }
    };
    elements.set(id, obj);
    return obj;
  };
  const local = element('local'), ai = element('ai');
  local.value = 'local'; local.checked = true; ai.value = 'ai';
  const textTab = element('tab-text');
  textTab.dataset = { tab: 'text' };
  textTab.getAttribute = key => key === 'aria-controls' ? 'panel-text' : null;
  const doc = {
    getElementById: element,
    querySelectorAll(query) {
      if (query === '#app > section') return [element('home'), element('result')];
      if (query === '[data-tab]') return [textTab];
      if (query === 'input[name="checkMode"]') return [local, ai];
      return [];
    },
    querySelector(query) {
      if (query === 'input[name="checkMode"]:checked')
        return ai.checked ? ai : local.checked ? local : null;
      if (query.includes('[value="ai"]')) return ai;
      if (query.includes('[value="local"]')) return local;
      return null;
    }
  };
  const network = [];
  const fakeFetch = async (...args) => {
    network.push(args);
    return provider ? provider(args, element) : Promise.reject(Error('simulated offline'));
  };
  class FakeAbortController {
    constructor() { this.signal = { aborted: false }; }
    abort() { this.signal.aborted = true; }
  }
  const ctx = {
    document: doc, window: { scrollTo() {} },
    fetch: fakeFetch, AbortController: FakeAbortController,
    setTimeout: () => 1, clearTimeout: () => {}, console
  };
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx, { timeout: 2000 });
  const run = expression => vm.runInContext(expression, ctx, { timeout: 2000 });
  return { element, local, ai, network, run };
}

test('HTML has a hidden, accessible optional review; existing hero remains present', () => {
  assert.match(HTML, /id="aiReviewOffer"[^>]*aria-labelledby="aiReviewTitle"[^>]*hidden/);
  assert.match(HTML, /id="aiReviewBtn"[^>]*onclick="prepareAiReview\(\)"/);
  assert.match(HTML, /id="pilotHero"/);
  assert.match(HTML, /id="aiAgree"/);
  assert.match(HTML, /maskování nemusí zachytit všechny osobní údaje/);
});

test('local LOW result only offers second opinion on available protected preview; never sends', () => {
  const h = harness();
  h.element('msg').value = 'Pošli mi fotky z oslavy, prosím.';
  h.run('analyzeLocal()');
  assert.equal(h.element('aiReviewOffer').hidden, true);
  h.run('AI.available = true; updateAiReviewOffer("local")');
  assert.equal(h.element('aiReviewOffer').hidden, false);
  assert.equal(h.network.length, 0);
  assert.equal(h.run('prepareAiReview()'), true);
  assert.equal(h.ai.checked, true);
  assert.equal(h.element('aiAgree').checked, false);
  assert.match(h.element('aiPreview').textContent, /Pošli mi fotky/);
  assert.equal(h.element('aiPreview').focused, true);
  assert.equal(h.network.length, 0, 'preparation has no network side effects');
});

test('local HIGH is never offered AI as a safety override, and no message is sent', () => {
  const h = harness();
  h.run('AI.available = true');
  h.element('msg').value = 'Ahoj mami, mám nové číslo. Pošli mi 5000 Kč ještě dnes, nevolej.';
  h.run('analyzeLocal()');
  assert.equal(h.element('aiReviewOffer').hidden, true);
  assert.equal(h.run('prepareAiReview()'), false);
  assert.equal(h.network.length, 0);
});

test('consent is bound to the exact masked content and revoked after an edit', () => {
  const h = harness();
  h.run('AI.available = true');
  h.element('msg').value = 'Napište na mama@example.com.';
  h.element('aiAgree').checked = true;
  h.run('recordAiConsent()');
  assert.match(h.run('AI.consentSnapshot'), /\[SKRYTÝ E-MAIL\]/);
  h.element('msg').value = 'Jiný text pro kontrolu.';
  h.run('updateAiPreview()');
  assert.equal(h.element('aiAgree').checked, false);
  assert.equal(h.run('AI.consentSnapshot'), null);
  assert.equal(h.network.length, 0);
});

test('without fresh consent AI call is refused before fetch', async () => {
  const h = harness();
  h.run('AI.available = true');
  h.element('msg').value = 'Pošli mi 5000 Kč.';
  await h.run('analyzeWithAI(document.getElementById("msg").value)');
  assert.equal(h.network.length, 0);
  assert.match(h.element('aiMode').innerHTML, /souhlas/);
});

test('one consented attempt calls only mocked endpoint; failure revokes consent', async () => {
  const h = harness();
  h.run('AI.available = true');
  h.element('msg').value = 'Ahoj, můžeš mi poslat fotografii?';
  h.element('aiAgree').checked = true;
  h.run('recordAiConsent()');
  await h.run('analyzeWithAI(document.getElementById("msg").value)');
  assert.equal(h.network.length, 1);
  assert.equal(h.network[0][1].credentials, 'same-origin');
  assert.equal(h.element('aiAgree').checked, false);
  assert.equal(h.run('AI.consentSnapshot'), null);
  assert.match(h.element('aiMode').innerHTML, /offline|serverem/i);
  assert.equal(h.network[0][1].method, 'POST');
});

test('stale successful AI response does not replace current result after text edit', async () => {
  const h = harness(async (_, element) => {
    element('msg').value = 'Text byl během analýzy změněn.';
    return { ok: true, json: async () => ({ ok: true, mode: 'ai', result: { risk: 'uncertain' } }) };
  });
  h.run('AI.available = true');
  h.element('msg').value = 'Neznámá zpráva před odesláním.';
  h.element('aiAgree').checked = true;
  h.run('recordAiConsent()');
  await h.run('analyzeWithAI(document.getElementById("msg").value)');
  assert.equal(h.network.length, 1);
  assert.match(h.element('aiMode').innerHTML, /Text se během analýzy změnil/);
  assert.equal(h.element('aiAgree').checked, false);
});

test('context-only signal excerpts can be highlighted without JavaScript error or HTML injection', () => {
  const h = harness();
  const html = h.run('highlight("Posli 5000 korun hned, nevolej.", classify("Posli 5000 korun hned, nevolej.").found)');
  assert.match(html, /<mark>/);
  const result = h.run('highlight("<img src=x onerror=alert(1)> + [ $foo", [{example:"<img src=x onerror=alert(1)> + [ $foo"}])');
  assert.match(result, /&lt;img/);
  assert.doesNotMatch(result, /<img/);
});

test('AI eligibility is only local LOW or MODERATE with current server availability', () => {
  const h = harness();
  assert.equal(h.run('canOfferAiReview({level:"low"}, true)'), true);
  assert.equal(h.run('canOfferAiReview({level:"moderate"}, true)'), true);
  assert.equal(h.run('canOfferAiReview({level:"high"}, true)'), false);
  assert.equal(h.run('canOfferAiReview({kind:"ai",level:"low"}, true)'), false);
  assert.equal(h.run('canOfferAiReview({level:"low"}, false)'), false);
});

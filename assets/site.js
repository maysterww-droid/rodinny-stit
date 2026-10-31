/* RODINNÝ ŠTÍT · mobilní menu (sdílené pro obě stránky) */
'use strict';
(function () {
  const btn = document.querySelector('[data-menu-btn]');
  const menu = btn && document.getElementById(btn.getAttribute('aria-controls'));
  if (!btn || !menu) return;
  const setOpen = open => {
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Zavřít menu' : 'Otevřít menu');
    menu.hidden = !open;
    if (open) { const first = menu.querySelector('a,button'); if (first) first.focus(); }
  };
  btn.addEventListener('click', () => setOpen(btn.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', e => { if (e.target.closest('a,button')) setOpen(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); } });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) setOpen(false); });
  window.matchMedia('(min-width: 960px)').addEventListener('change', m => { if (m.matches) setOpen(false); });
})();

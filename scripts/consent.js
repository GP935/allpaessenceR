// consent.js — AE-L1: acordeón de políticas + consentimiento de cookies de Allpa Essence.
// Marco: Perú (Ley 29733 + Código de Protección al Consumidor). Hoy NO se carga ningún script de
// analítica ni de marketing (GA4 y Meta Pixel se instalan después, con ID y OK de Paul).
// Nombres DOM `ae-privacy-*` (nunca `cookie-*`/`consent-*`: los filtros cosméticos de adblock los ocultan).
// Elección en localStorage `ae_cookie_consent` = { v:1, analytics:bool, marketing:bool, ts:ISO } (no es una cookie).
// El aviso solo se pinta cuando css publica el centinela `:root { --ae-privacy-ui: ready }`.

const timers = new WeakMap();

function openAccPanel(panel) {
  if (!panel) return;
  clearTimeout(timers.get(panel));
  panel.hidden = false;
  void panel.offsetHeight;
  panel.classList.add('is-open');
}

function closeAccPanel(panel) {
  if (!panel) return;
  clearTimeout(timers.get(panel));
  panel.classList.remove('is-open');
  panel.hidden = true;
}

export function initPoliciesAccordion() {
  const accordion = document.querySelector('[data-accordion]');
  if (!accordion) return;
  const triggers = [...accordion.querySelectorAll('.accordion-trigger')];

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const panel = document.getElementById(trigger.getAttribute('aria-controls'));
      const isOpen = trigger.getAttribute('aria-expanded') === 'true';
      triggers.forEach((t) => {
        if (t === trigger) return;
        t.setAttribute('aria-expanded', 'false');
        closeAccPanel(document.getElementById(t.getAttribute('aria-controls')));
      });
      trigger.setAttribute('aria-expanded', String(!isOpen));
      if (isOpen) closeAccPanel(panel); else openAccPanel(panel);
    });
  });

  const openByHash = () => {
    const slug = location.hash.replace('#', '');
    const t = slug && document.getElementById(`acc-trigger-${slug}`);
    if (!t) return;
    triggers.forEach((o) => {
      if (o === t) return;
      o.setAttribute('aria-expanded', 'false');
      closeAccPanel(document.getElementById(o.getAttribute('aria-controls')));
    });
    t.setAttribute('aria-expanded', 'true');
    openAccPanel(document.getElementById(t.getAttribute('aria-controls')));
    t.scrollIntoView({ block: 'start' });
  };
  openByHash();
  window.addEventListener('hashchange', openByHash);
}

const CONSENT_KEY = 'ae_cookie_consent';
const CONSENT_VERSION = 1;
const CATEGORIES = ['analytics', 'marketing'];

function readConsent() {
  try {
    const d = JSON.parse(localStorage.getItem(CONSENT_KEY));
    if (d && d.v === CONSENT_VERSION) return { analytics: !!d.analytics, marketing: !!d.marketing };
  } catch { /* corrupto o no disponible: sin decidir */ }
  return null;
}

// Activa <script type="text/plain" data-ae-cat="..."> (inline o por data-src) solo con la categoría concedida.
function activateGated(ph) {
  if (ph.dataset.aeActivated) return;
  const real = document.createElement('script');
  for (const a of ph.attributes) {
    if (['type', 'data-ae-cat', 'data-src'].includes(a.name)) continue;
    real.setAttribute(a.name, a.value);
  }
  if (ph.dataset.src) real.src = ph.dataset.src;
  real.textContent = ph.textContent;
  ph.dataset.aeActivated = 'true';
  ph.replaceWith(real);
}

function applyConsent(choice) {
  CATEGORIES.forEach((cat) => {
    if (!choice[cat]) return;
    document.querySelectorAll(`script[type="text/plain"][data-ae-cat="${cat}"]`).forEach(activateGated);
  });
  if (typeof window.fbq === 'function' && !choice.marketing) window.fbq('consent', 'revoke');
  document.dispatchEvent(new CustomEvent('ae:privacy-change', { detail: { analytics: !!choice.analytics, marketing: !!choice.marketing } }));
}

function writeConsent(choice) {
  const record = { v: CONSENT_VERSION, analytics: !!choice.analytics, marketing: !!choice.marketing, ts: new Date().toISOString() };
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(record)); } catch { /* solo vale esta carga */ }
  applyConsent(record);
}

export const aePrivacy = {
  get: () => readConsent(),
  allowed: (cat) => cat === 'necessary' || !!(readConsent() || {})[cat],
  openPreferences: () => {},
  reset: () => { try { localStorage.removeItem(CONSENT_KEY); } catch { /* noop */ } },
};

const REJECT_HINT = 'Solo cookies necesarias para el funcionamiento de la web';

function buildUI() {
  const wrap = document.createElement('div');
  wrap.id = 'ae-privacy-root';
  wrap.innerHTML = `
<section id="ae-privacy-bar" class="ae-privacy-bar" role="dialog" aria-modal="false" aria-labelledby="ae-privacy-bar-title" aria-describedby="ae-privacy-bar-text" hidden>
  <div class="ae-privacy-bar__inner">
    <h2 id="ae-privacy-bar-title" class="ae-privacy-bar__title">Cookies en Allpa Essence</h2>
    <p id="ae-privacy-bar-text" class="ae-privacy-bar__text">Usamos cookies necesarias para que la web funcione (carrito y pedido). Con tu permiso también usamos cookies de analítica y de marketing, como el Meta Pixel, para medir cómo se usa la tienda y conocer mejor cómo compran nuestros clientes. Más información en la <a href="politicas.html#cookies">Política de cookies</a>.</p>
    <div class="ae-privacy-bar__actions">
      <button type="button" class="ae-privacy-btn ae-privacy-btn--accept" data-ae-privacy-act="accept">Aceptar todas</button>
      <button type="button" class="ae-privacy-btn ae-privacy-btn--reject" data-ae-privacy-act="reject" aria-label="Rechazar. ${REJECT_HINT}">Rechazar<span class="ae-privacy-btn__hint">${REJECT_HINT}</span></button>
      <button type="button" class="ae-privacy-btn ae-privacy-btn--config" data-ae-privacy>Configurar</button>
    </div>
  </div>
</section>
<div id="ae-privacy-panel" class="ae-privacy-panel" hidden>
  <div class="ae-privacy-panel__backdrop" data-ae-privacy-act="close"></div>
  <div class="ae-privacy-panel__dialog" role="dialog" aria-modal="true" aria-labelledby="ae-privacy-panel-title">
    <button type="button" class="ae-privacy-panel__close" data-ae-privacy-act="close" aria-label="Cerrar">×</button>
    <h2 id="ae-privacy-panel-title" class="ae-privacy-panel__title">Preferencias de cookies</h2>
    <p class="ae-privacy-panel__intro">Elige qué categorías permites. Puedes cambiarlo cuando quieras desde el pie de página.</p>
    <ul class="ae-privacy-panel__list">
      <li class="ae-privacy-panel__row">
        <label class="ae-privacy-panel__label"><input type="checkbox" class="ae-privacy-panel__toggle" checked disabled><span class="ae-privacy-panel__name">Técnicas (necesarias)</span></label>
        <p class="ae-privacy-panel__desc">Imprescindibles para navegar y usar el carrito y el pedido. Siempre activas.</p>
      </li>
      <li class="ae-privacy-panel__row">
        <label class="ae-privacy-panel__label"><input type="checkbox" class="ae-privacy-panel__toggle" data-ae-privacy-cat="analytics"><span class="ae-privacy-panel__name">Analíticas</span></label>
        <p class="ae-privacy-panel__desc">Medición agregada del uso de la tienda para mejorarla.</p>
      </li>
      <li class="ae-privacy-panel__row">
        <label class="ae-privacy-panel__label"><input type="checkbox" class="ae-privacy-panel__toggle" data-ae-privacy-cat="marketing"><span class="ae-privacy-panel__name">Marketing — Meta Pixel (Instagram/Facebook)</span></label>
        <p class="ae-privacy-panel__desc">Medición de campañas y de cómo compran nuestros clientes.</p>
      </li>
    </ul>
    <div class="ae-privacy-panel__actions">
      <button type="button" class="ae-privacy-btn ae-privacy-btn--save" data-ae-privacy-act="save">Guardar preferencias</button>
      <button type="button" class="ae-privacy-btn ae-privacy-btn--accept" data-ae-privacy-act="accept">Aceptar todas</button>
      <button type="button" class="ae-privacy-btn ae-privacy-btn--reject" data-ae-privacy-act="reject" aria-label="Rechazar todas. ${REJECT_HINT}">Rechazar todas<span class="ae-privacy-btn__hint">${REJECT_HINT}</span></button>
    </div>
  </div>
</div>`;
  document.body.appendChild(wrap);
}

export function initCookieConsent() {
  window.aePrivacy = aePrivacy;
  const decided = readConsent();
  if (decided) applyConsent(decided);

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let built = false;
  let lastFocus = null;
  const bar = () => document.getElementById('ae-privacy-bar');
  const panel = () => document.getElementById('ae-privacy-panel');

  function build() {
    if (built) return;
    if (!bar()) buildUI();
    built = true;
    document.addEventListener('keydown', (e) => {
      const p = panel();
      if (!p || p.hidden) return;
      if (e.key === 'Escape') { closePreferences(); return; }
      if (e.key !== 'Tab') return;
      const f = [...p.querySelectorAll(`.ae-privacy-panel__dialog ${FOCUSABLE}`)];
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  function openPreferences() {
    build();
    const p = panel();
    if (!p) return;
    lastFocus = document.activeElement;
    const cur = readConsent() || {};
    p.querySelectorAll('[data-ae-privacy-cat]').forEach((cb) => { cb.checked = !!cur[cb.dataset.aePrivacyCat]; });
    p.hidden = false;
    void p.offsetHeight;
    p.classList.add('is-open');
    p.querySelector(`.ae-privacy-panel__dialog ${FOCUSABLE}`)?.focus();
  }

  function closePreferences() {
    const p = panel();
    if (!p || p.hidden) return;
    p.classList.remove('is-open');
    p.hidden = true;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  function save(choice) {
    writeConsent(choice);
    if (bar()) bar().hidden = true;
    closePreferences();
  }

  aePrivacy.openPreferences = openPreferences;

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-ae-privacy]')) { e.preventDefault(); openPreferences(); return; }
    const act = e.target.closest('[data-ae-privacy-act]');
    if (!act) return;
    const kind = act.dataset.aePrivacyAct;
    if (kind === 'accept') save({ analytics: true, marketing: true });
    else if (kind === 'reject') save({ analytics: false, marketing: false });
    else if (kind === 'close') closePreferences();
    else if (kind === 'save') {
      const choice = {};
      panel().querySelectorAll('[data-ae-privacy-cat]').forEach((cb) => { choice[cb.dataset.aePrivacyCat] = cb.checked; });
      save(choice);
    }
  });

  const cssReady = getComputedStyle(document.documentElement).getPropertyValue('--ae-privacy-ui').trim() === 'ready';
  if (cssReady) {
    build();
    if (!decided) bar().hidden = false;
  }
}

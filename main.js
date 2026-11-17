// main.js — Allpa Essence (AE-J1). Contrato completo: header/menú móvil, dropdown de
// catálogo, carrito (drawer + página), carrusel genérico ×3, filtro de catálogo por
// familia, plantilla de producto por ?id=, estado de confirmación por ?estado=.
// Checkout: Mercado Pago Card Payment Brick (mismo patrón que AP-J2 de AP Beauty), activado
// por el interruptor del backend (GET /api/market).

import { cartStore } from './scripts/cart.js';
import { OFFER, getOfferEnd, computeCartTotals } from './scripts/offer.js';
import { loadStock, availableFor, stockLabel, isLowEnoughToShow, baseId } from './scripts/stock.js';

const priceFormatter = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

// data-price en este proyecto es soles enteros, no céntimos (AE-F16: todos los precios
// reales son 50/75/90, sin decimales) — front escribió los 60 atributos data-price del
// catálogo ya en esa unidad, así que el formateador no divide entre 100.
function formatPrice(soles) {
  return priceFormatter.format(soles || 0);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/* --------------------------------------------------------------------------
   Paneles off-canvas (menú móvil + carrito) — mismo patrón .is-open +
   transitionend que Powervein/AP Beauty (ver PV-C1 en pipeline.md).
   -------------------------------------------------------------------------- */
function openPanel(panel, backdrop, toggleBtn, focusTarget) {
  if (backdrop) {
    backdrop.hidden = false;
    requestAnimationFrame(() => backdrop.classList.add('is-open'));
  }
  requestAnimationFrame(() => panel.classList.add('is-open'));
  panel.setAttribute('aria-hidden', 'false');
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
  focusTarget?.focus();
}

function closePanel(panel, backdrop, toggleBtn, returnFocusTo) {
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
  if (backdrop) {
    backdrop.classList.remove('is-open');
    const onEnd = (e) => {
      if (e.target !== backdrop) return;
      backdrop.hidden = true;
      backdrop.removeEventListener('transitionend', onEnd);
    };
    backdrop.addEventListener('transitionend', onEnd);
  }
  returnFocusTo?.focus();
}

function initMobileMenu() {
  const btn = document.getElementById('btn-menu');
  const panel = document.getElementById('menu-panel');
  const backdrop = document.getElementById('menu-backdrop');
  const closeBtn = document.getElementById('btn-menu-close');
  if (!btn || !panel) return;

  const open = () => openPanel(panel, backdrop, btn, closeBtn);
  const close = () => closePanel(panel, backdrop, btn, btn);

  btn.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('is-open')) close();
  });
}

function openCartDrawer() {
  const panel = document.getElementById('cart-drawer');
  if (!panel) return;
  const backdrop = document.getElementById('cart-backdrop');
  const btn = document.getElementById('btn-cart');
  const closeBtn = document.getElementById('btn-cart-close');
  openPanel(panel, backdrop, btn, closeBtn);
}

function closeCartDrawer() {
  const panel = document.getElementById('cart-drawer');
  if (!panel) return;
  const backdrop = document.getElementById('cart-backdrop');
  const btn = document.getElementById('btn-cart');
  closePanel(panel, backdrop, btn, btn);
}

function initCartDrawer() {
  const btn = document.getElementById('btn-cart');
  const panel = document.getElementById('cart-drawer');
  const closeBtn = document.getElementById('btn-cart-close');
  const backdrop = document.getElementById('cart-backdrop');
  if (!btn || !panel) return;

  btn.addEventListener('click', openCartDrawer);
  closeBtn?.addEventListener('click', closeCartDrawer);
  backdrop?.addEventListener('click', closeCartDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('is-open')) closeCartDrawer();
  });
}

/* --------------------------------------------------------------------------
   Dropdown de Catálogo en el nav (handoff front AE-F4). CSS ya tiene fallback
   hover/focus-within para navegación sin JS — este toggle añade click (táctil)
   + Esc + click-afuera, apuntando al mismo [hidden] que usa el CSS.
   -------------------------------------------------------------------------- */
function initCatalogDropdown() {
  const btn = document.getElementById('btn-catalogo-nav');
  const menu = document.getElementById('catalogo-nav-menu');
  if (!btn || !menu) return;
  const wrapper = btn.closest('.nav-dropdown');

  const close = () => {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  };

  btn.addEventListener('click', () => (menu.hidden ? open() : close()));

  document.addEventListener('click', (e) => {
    if (!menu.hidden && wrapper && !wrapper.contains(e.target)) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      close();
      btn.focus();
    }
  });
}

/* --------------------------------------------------------------------------
   Carrito — render compartido entre drawer (todas las páginas) y página
   completa carrito.html, ambos leen el mismo #cart-line-tpl.
   -------------------------------------------------------------------------- */
function renderCartLines(listEl, items) {
  const tpl = document.getElementById('cart-line-tpl');
  if (!tpl) return;
  listEl.innerHTML = '';
  items.forEach((item) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = item.id;
    const img = node.querySelector('.cart-line__img');
    img.src = item.image;
    img.alt = item.name;
    node.querySelector('.cart-line__name').textContent = item.name;
    node.querySelector('.cart-line__price').textContent = formatPrice(item.price * item.qty);
    node.querySelector('.cart-line__qval').textContent = String(item.qty);
    listEl.appendChild(node);
  });
}

let productosCache = null;
async function loadProductosOnce() {
  if (productosCache) return productosCache;
  try {
    const res = await fetch('data/productos.json');
    productosCache = await res.json();
  } catch {
    productosCache = [];
  }
  return productosCache;
}

function renderCartOffer(items, totals) {
  const progress = document.getElementById('cart-progress');
  const upsell = document.getElementById('cart-upsell');
  const showOffer = totals.active && items.length > 0;

  if (progress) {
    progress.hidden = !showOffer;
    if (showOffer) {
      const r = totals.eligible % OFFER.qty;
      const complete = totals.eligible > 0 && r === 0;
      const need = OFFER.qty - r;
      const msg = document.getElementById('cart-progress-msg');
      if (msg) {
        msg.textContent = complete
          ? `¡Oferta aplicada! Pagas S/ ${OFFER.price} por cada ${OFFER.qty} fragancias.`
          : `Añade ${need} ${need === 1 ? 'fragancia más' : 'fragancias más'} y paga S/ ${OFFER.price} por ${OFFER.qty} (antes S/ ${OFFER.was}).`;
      }
      const filled = complete ? OFFER.qty : r;
      document.getElementById('cart-progress-track')?.setAttribute('aria-valuenow', String(filled));
      const fill = document.getElementById('cart-progress-fill');
      if (fill) fill.style.width = `${(filled / OFFER.qty) * 100}%`;
    }
  }

  if (upsell) {
    const needMore = showOffer && totals.eligible % OFFER.qty !== 0;
    upsell.hidden = !needMore;
    if (needMore) {
      loadProductosOnce().then((productos) => {
        const list = document.getElementById('cart-upsell-list');
        const tpl = document.getElementById('cart-upsell-tpl');
        if (!list || !tpl) return;
        const inCart = new Set(items.map((i) => i.id));
        const picks = productos.filter((p) => !inCart.has(p.id)).slice(0, 2);
        list.replaceChildren();
        picks.forEach((p) => {
          const node = tpl.content.firstElementChild.cloneNode(true);
          const im = node.querySelector('.cart-upsell__img');
          im.src = p.imagen; im.alt = p.alt;
          node.querySelector('.cart-upsell__name').textContent = p.nombre;
          node.querySelector('.cart-upsell__price').textContent = displayPrice(p);
          const btn = node.querySelector('.add-to-cart');
          btn.dataset.id = p.id; btn.dataset.name = p.nombreCarrito || p.nombre; btn.dataset.price = String(basePrice(p)); btn.dataset.image = p.imagen;
          list.appendChild(node);
        });
        upsell.hidden = picks.length === 0;
      });
    }
  }
}

function initCartRendering() {
  const drawerList = document.getElementById('cart-items');
  const drawerEmpty = document.getElementById('cart-empty');
  const drawerFoot = document.getElementById('cart-foot');
  const drawerSubtotal = document.getElementById('cart-subtotal');
  const drawerDiscountRow = document.getElementById('cart-discount-row');
  const drawerDiscount = document.getElementById('cart-discount');
  const drawerTotal = document.getElementById('cart-total');

  const pageList = document.getElementById('cart-page-items');
  const pageEmpty = document.getElementById('cart-page-empty');
  const pageLayout = document.getElementById('cart-page-layout');
  const pageSubtotal = document.getElementById('cart-page-subtotal');
  const pageDiscountRow = document.getElementById('cart-page-discount-row');
  const pageDiscount = document.getElementById('cart-page-discount');
  const pageTotal = document.getElementById('cart-page-total');

  const render = (items) => {
    const hasItems = items.length > 0;
    const totals = computeCartTotals(items);
    const subtotal = formatPrice(totals.subtotal);
    const discount = `−${formatPrice(totals.discount)}`;
    const total = formatPrice(totals.total);
    const hasDiscount = totals.discount > 0;

    if (drawerList) {
      renderCartLines(drawerList, items);
      if (drawerEmpty) drawerEmpty.hidden = hasItems;
      if (drawerFoot) drawerFoot.hidden = !hasItems;
      if (drawerSubtotal) drawerSubtotal.textContent = subtotal;
      if (drawerDiscountRow) drawerDiscountRow.hidden = !hasDiscount;
      if (drawerDiscount) drawerDiscount.textContent = discount;
      if (drawerTotal) drawerTotal.textContent = total;
      renderCartOffer(items, totals);
    }
    applyCartCaps();

    if (pageList) {
      renderCartLines(pageList, items);
      if (pageEmpty) pageEmpty.hidden = hasItems;
      if (pageLayout) pageLayout.hidden = !hasItems;
      if (pageSubtotal) pageSubtotal.textContent = subtotal;
      if (pageDiscountRow) pageDiscountRow.hidden = !hasDiscount;
      if (pageDiscount) pageDiscount.textContent = discount;
      if (pageTotal) pageTotal.textContent = total;
    }
  };

  cartStore.subscribe(render);
  document.addEventListener('ae:offer-expired', () => render(cartStore.getItems()));
}

function initCartCount() {
  const el = document.getElementById('cart-count');
  if (!el) return;
  cartStore.subscribe(() => {
    el.textContent = String(cartStore.getCount());
  });
}

function initCartActions() {
  document.addEventListener('click', (e) => {
    const addBtn = e.target.closest('.add-to-cart');
    if (addBtn) {
      if (addBtn.disabled || addBtn.dataset.agotado) return;
      // AE-R2: en la ficha el botón principal respeta el selector de cantidad (1-99)
      const qtyInput = addBtn.id === 'btn-add-to-cart' ? document.getElementById('product-qty') : null;
      let times = qtyInput ? Math.min(99, Math.max(1, parseInt(qtyInput.value, 10) || 1)) : 1;
      // Tope por stock (AE-J5): descuenta lo que ya hay en el carrito; el rechazo no depende del botón.
      const avail = availableFor(addBtn.dataset.id);
      if (avail !== undefined) {
        const inCart = (cartStore.getItems().find((i) => i.id === addBtn.dataset.id) || { qty: 0 }).qty;
        times = Math.min(times, Math.max(0, avail - inCart));
      }
      if (times <= 0) {
        const prev = addBtn.textContent;
        addBtn.textContent = 'Máximo disponible';
        setTimeout(() => { if (addBtn.textContent === 'Máximo disponible') addBtn.textContent = prev; }, 1800);
        openCartDrawer();
        return;
      }
      for (let i = 0; i < times; i += 1) {
        cartStore.addItem({
          id: addBtn.dataset.id,
          name: addBtn.dataset.name,
          price: Number(addBtn.dataset.price) || 0,
          image: addBtn.dataset.image,
        });
      }
      openCartDrawer();
      return;
    }

    const qtyBtn = e.target.closest('.qty-btn');
    if (qtyBtn) {
      const line = qtyBtn.closest('.cart-line');
      if (line) {
        const inc = qtyBtn.dataset.action === 'inc';
        const avail = availableFor(line.dataset.id);
        const cur = (cartStore.getItems().find((i) => i.id === line.dataset.id) || { qty: 0 }).qty;
        if (inc && avail !== undefined && cur >= avail) return;
        cartStore.updateQty(line.dataset.id, inc ? 1 : -1);
      }
      return;
    }

    const removeBtn = e.target.closest('.cart-line__remove');
    if (removeBtn) {
      const line = removeBtn.closest('.cart-line');
      if (line) cartStore.removeItem(line.dataset.id);
    }
  });
}

/* --------------------------------------------------------------------------
   Carrusel genérico (handoff front AE-F4) — hoy solo lo usa trending/favoritos.
   Flechas: prev/next miden un slide+gap y hacen scrollBy. Llegan [hidden] desde el
   HTML (mockup sin overflow en desktop) — un ResizeObserver las revela solo si el
   track realmente desborda el viewport. (Contador y modo peek del carrusel de
   familias retirados en AE-J7, tras AE-R7.)
   -------------------------------------------------------------------------- */
function setUpCarousel(root) {
  const viewport = root.querySelector('.carousel__viewport');
  const track = root.querySelector('.carousel__track');
  if (!viewport || !track) return;
  const prevBtn = root.querySelector('[data-carousel-prev]');
  const nextBtn = root.querySelector('[data-carousel-next]');

  const scrollByStep = (dir) => {
    const slide = track.querySelector('.carousel__slide');
    if (!slide) return;
    const style = getComputedStyle(track);
    const gap = parseFloat(style.columnGap || style.gap || '0') || 0;
    const step = (slide.getBoundingClientRect().width + gap) * dir;
    // behavior:'smooth' no mueve el scroll cuando el contenedor tiene
    // scroll-snap-type:mandatory (confirmado con clic real en Chrome) — 'auto'
    // funciona igual, el snap CSS anima el asentamiento final.
    viewport.scrollBy({ left: step, behavior: 'auto' });
  };

  prevBtn?.addEventListener('click', () => scrollByStep(-1));
  nextBtn?.addEventListener('click', () => scrollByStep(1));

  if (prevBtn || nextBtn) {
    const updateArrows = () => {
      const overflow = track.scrollWidth > viewport.clientWidth + 2;
      if (prevBtn) prevBtn.hidden = !overflow;
      if (nextBtn) nextBtn.hidden = !overflow;
    };
    updateArrows();
    new ResizeObserver(updateArrows).observe(viewport);
  }

  if (AUTOPLAY_CAROUSELS.has(root.dataset.carousel)) setUpCarouselAutoplay(root, viewport, track);
}

// Carruseles con autoavance (AE-R5: muro anecdótico). Opt-in por nombre de data-carousel.
const AUTOPLAY_CAROUSELS = new Set(['memory-wall']);
const AUTOPLAY_MS = 4500;

function setUpCarouselAutoplay(root, viewport, track) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false;
  const pause = () => { paused = true; };
  const resume = () => { paused = false; };

  root.addEventListener('mouseenter', pause);
  root.addEventListener('mouseleave', resume);
  root.addEventListener('focusin', pause);
  root.addEventListener('focusout', resume);
  root.addEventListener('touchstart', pause, { passive: true });
  root.addEventListener('touchend', () => setTimeout(resume, AUTOPLAY_MS), { passive: true });

  setInterval(() => {
    if (paused || reduce.matches || document.hidden) return;
    if (track.scrollWidth <= viewport.clientWidth + 2) return;
    const rect = root.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const slide = track.querySelector('.carousel__slide');
    if (!slide) return;
    const gap = parseFloat(getComputedStyle(track).columnGap || '0') || 0;
    const atEnd = viewport.scrollLeft + viewport.clientWidth >= track.scrollWidth - 4;
    // Mover solo scrollLeft del viewport: nunca scrollIntoView (movería la página).
    viewport.scrollTo({ left: atEnd ? 0 : viewport.scrollLeft + slide.getBoundingClientRect().width + gap, behavior: 'auto' });
  }, AUTOPLAY_MS);
}

function initCarousels() {
  document.querySelectorAll('.carousel').forEach(setUpCarousel);
}

/* --------------------------------------------------------------------------
   Búsqueda: cada fragancia tiene un nombre propio (p.nombre) y una referencia oculta
   (p.ref, la fragancia por la que el cliente llega con la cabeza). El cliente busca por
   cualquiera de las dos; la referencia NUNCA se pinta en pantalla. Sinónimos: man/men/
   hombre, woman/women/mujer y siglas de casas habituales (CH, YSL…).
   -------------------------------------------------------------------------- */
const SEARCH_ALIAS = {
  man: 'men', hombre: 'men', homme: 'men', uomo: 'men', male: 'men', masculino: 'men',
  woman: 'women', mujer: 'women', femme: 'women', donna: 'women', female: 'women', femenino: 'women',
  ch: 'carolina herrera', ysl: 'yves saint laurent', jpg: 'jean paul gaultier', dg: 'dolce gabbana',
  pr: 'paco rabanne', lv: 'louis vuitton', mb: 'mont blanc', cdn: 'club de nuit',
};
function searchTokens(s) {
  const out = [];
  normalizeText(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).forEach((t) => {
    (SEARCH_ALIAS[t] || t).split(' ').forEach((w) => out.push(w));
  });
  return out;
}
function buildSearchIndex(productos) {
  productos.forEach((p) => {
    p._nameTok = searchTokens(p.nombre);
    p._tok = p._nameTok.concat(searchTokens(`${p.ref || ''} ${(p.familiasLabel || []).join(' ')}`));
  });
}
// Distancia de Levenshtein acotada (corta en cuanto supera max).
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
// Puntaje por token de la consulta: palabra exacta > prefijo > typo tolerado; el nombre propio pesa más que la ref.
function tokenScore(q, p, fuzzy) {
  let best = 0;
  const check = (tokens, w) => {
    for (const t of tokens) {
      let sc = 0;
      if (t === q) sc = 3;
      else if (t.startsWith(q)) sc = 2;
      else if (fuzzy && q.length >= 4) {
        const max = q.length >= 7 ? 2 : 1;
        if (editDistance(q, t.slice(0, q.length + 1), max) <= max || editDistance(q, t, max) <= max) sc = 1;
      }
      if (sc * w > best) best = sc * w;
    }
  };
  check(p._nameTok || [], 2);
  check(p._tok || [], 1);
  return best;
}
// Devuelve null si no coincide, o el puntaje total (AND entre tokens).
function searchScore(p, qTokens, fuzzy) {
  let total = 0;
  for (const q of qTokens) {
    const sc = tokenScore(q, p, fuzzy);
    if (!sc) return null;
    total += sc;
  }
  return total;
}
function searchProducts(productos, qTokens) {
  if (!qTokens.length) return productos.map((p) => ({ p, score: 0 }));
  let hits = [];
  for (const fuzzy of [false, true]) {
    hits = [];
    productos.forEach((p) => { const score = searchScore(p, qTokens, fuzzy); if (score !== null) hits.push({ p, score }); });
    if (hits.length) break;
  }
  return hits;
}

// Única fuente de precio: productos.json -> tamanos[30 ml]. precio/precioDisplay del JSON se ignoran para pintar.
function basePrice(p) {
  const t = (p.tamanos || []).find((x) => x.ml === 30) || (p.tamanos || [])[0];
  return t ? t.precio : p.precio;
}
function displayPrice(p) {
  return `S/ ${basePrice(p)} · 30 ml`;
}

function buildCatalogItem(p) {
  const li = document.createElement('li');
  li.className = 'product-item';
  li.dataset.id = p.id;
  const href = `producto.html?id=${encodeURIComponent(p.id)}`;
  const badge = p.flag === 'bestseller' ? 'Bestseller' : p.flag === 'trending' ? 'Trending' : p.nuevo ? 'Nuevo' : '';
  li.innerHTML = `
    <a href="${href}" class="product-item__link">
      ${badge ? '<span class="product-item__badge"></span>' : ''}
      <div class="product-item__media"><img width="600" height="600" loading="lazy"></div>
      <p class="product-item__familia"></p>
      <h2 class="product-item__name"></h2>
      <p class="product-item__desc"></p>
      <p class="product-item__price"></p>
    </a>
    <button type="button" class="add-to-cart btn btn--outline">Añadir</button>`;
  if (badge) li.querySelector('.product-item__badge').textContent = badge;
  const img = li.querySelector('img');
  img.src = p.imagen; img.alt = p.alt;
  li.querySelector('.product-item__familia').textContent = (p.familiasLabel || [p.familiaLabel]).slice(0, 2).join(' · ');
  li.querySelector('.product-item__name').textContent = p.nombre;
  li.querySelector('.product-item__desc').textContent = p.desc;
  li.querySelector('.product-item__price').textContent = displayPrice(p);
  const btn = li.querySelector('.add-to-cart');
  btn.dataset.id = p.id; btn.dataset.name = p.nombreCarrito || p.nombre; btn.dataset.price = String(basePrice(p)); btn.dataset.image = p.imagen;
  return li;
}

async function initCatalogFilter() {
  const grid = document.getElementById('catalog-grid');
  if (!grid || !grid.hasAttribute('data-catalog-render')) return;
  const productos = await loadProductosOnce();
  buildSearchIndex(productos);
  const PAGE = 24;
  const familiaPills = document.querySelectorAll('.familia-pill');
  const generoPills = document.querySelectorAll('.genero-pill');
  const sortSel = document.getElementById('catalog-sort');
  const searchInput = document.getElementById('catalog-search');
  const moreBtn = document.getElementById('catalog-more');
  const emptyEl = document.getElementById('catalog-empty');
  const countEl = document.getElementById('catalog-count');
  const state = { familia: '', genero: '', q: '', shown: PAGE };

  const sorted = (hits) => {
    const v = sortSel ? sortSel.value : 'destacados';
    const arr = hits.map((h, i) => [h.p, i, h.score]);
    const rank = (p) => (p.flag === 'bestseller' ? 0 : p.flag === 'trending' ? 1 : p.nuevo ? 2 : 3);
    if (v === 'nuevos') arr.sort((a, b) => (Number(b[0].nuevo) - Number(a[0].nuevo)) || b[0].id.localeCompare(a[0].id));
    else if (v === 'precio-asc') arr.sort((a, b) => basePrice(a[0]) - basePrice(b[0]) || a[1] - b[1]);
    else if (v === 'precio-desc') arr.sort((a, b) => basePrice(b[0]) - basePrice(a[0]) || a[1] - b[1]);
    else arr.sort((a, b) => (b[2] - a[2]) || rank(a[0]) - rank(b[0]) || a[1] - b[1]);
    return arr.map((x) => x[0]);
  };

  // Render incremental: si solo crece "Ver más", se añaden las tarjetas nuevas sin repintar las existentes.
  let lastKey = null;
  let renderedCount = 0;
  const render = () => {
    const qTokens = searchTokens(state.q);
    const base = productos.filter((p) =>
      (!state.familia || (p.familias || [p.familia]).includes(state.familia)) &&
      (!state.genero || p.genero === state.genero));
    const list = sorted(searchProducts(base, qTokens));
    const key = `${state.familia}|${state.genero}|${qTokens.join(' ')}|${sortSel ? sortSel.value : ''}`;
    const slice = list.slice(0, state.shown);
    if (key === lastKey && slice.length >= renderedCount) {
      const frag = document.createDocumentFragment();
      slice.slice(renderedCount).forEach((p) => frag.appendChild(buildCatalogItem(p)));
      grid.appendChild(frag);
    } else {
      grid.replaceChildren(...slice.map(buildCatalogItem));
    }
    lastKey = key;
    renderedCount = slice.length;
    applyStockTags(grid);
    if (countEl) countEl.textContent = list.length === 1 ? '1 fragancia' : `${list.length} fragancias`;
    if (emptyEl) emptyEl.hidden = list.length > 0;
    if (moreBtn) moreBtn.hidden = list.length <= state.shown;
    familiaPills.forEach((pill) => pill.classList.toggle('is-active', (pill.dataset.familia || '') === state.familia));
    generoPills.forEach((pill) => pill.classList.toggle('is-active', (pill.dataset.genero || '') === state.genero));
  };

  const readUrl = () => {
    const params = new URLSearchParams(window.location.search);
    state.familia = params.get('familia') || '';
    state.genero = params.get('genero') || '';
    state.q = params.get('q') || '';
    state.shown = PAGE;
    if (searchInput) searchInput.value = state.q;
    render();
  };
  const pushUrl = () => {
    const params = new URLSearchParams();
    if (state.familia) params.set('familia', state.familia);
    if (state.genero) params.set('genero', state.genero);
    if (state.q) params.set('q', state.q);
    const query = params.toString();
    window.history.pushState({}, '', query ? `catalogo.html?${query}` : 'catalogo.html');
  };

  const wirePill = (pill, key) => {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      state[key] = pill.dataset[key] || '';
      state.shown = PAGE;
      pushUrl();
      render();
    });
  };
  familiaPills.forEach((pill) => wirePill(pill, 'familia'));
  generoPills.forEach((pill) => wirePill(pill, 'genero'));
  sortSel?.addEventListener('change', () => { state.shown = PAGE; render(); });
  moreBtn?.addEventListener('click', () => { state.shown += PAGE; render(); });
  let t;
  searchInput?.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = searchInput.value.trim(); state.shown = PAGE; pushUrl(); render(); }, 150);
  });
  document.getElementById('catalog-search-form')?.addEventListener('submit', (e) => e.preventDefault());
  window.addEventListener('popstate', readUrl);
  readUrl();
}

/* --------------------------------------------------------------------------
   Ficha de producto — plantilla única por ?id= (producto.html). Fuente de
   datos: data/productos.json, mock claramente marcado (nombres/notas/precios
   [PENDIENTE] hasta que Paul confirme catálogo real) — mismo criterio
   mock→real que api.js de Powervein.
   -------------------------------------------------------------------------- */
async function initProductPage() {
  const section = document.querySelector('.product-detail');
  if (!section) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id') || section.dataset.defaultId;
  const initialIsMuestra = params.get('variant') === 'muestra';

  let productos;
  try {
    const res = await fetch('data/productos.json');
    productos = await res.json();
  } catch {
    return; // sin datos: se queda el placeholder ae-01 ya presente en el HTML
  }

  const producto = productos.find((p) => p.id === id);
  if (!producto) return;

  const img = document.getElementById('product-img');
  if (img) {
    img.src = producto.imagen;
    img.alt = producto.alt;
  }
  const thumb1 = document.getElementById('thumb-1');
  if (thumb1) thumb1.src = producto.imagen;
  const buyBarImg = document.getElementById('buy-bar-img');
  if (buyBarImg) buyBarImg.src = producto.imagen;
  setText('product-familia', producto.familiaLabel);
  setText('product-desc', producto.desc);
  if (producto.notas) {
    setText('nota-salida', producto.notas.salida);
    setText('nota-corazon', producto.notas.corazon);
    setText('nota-fondo', producto.notas.fondo);
  } else {
    // Sin pirámide olfativa todavía: se muestran las familias olfativas reales de la hoja de valores.
    const dl = document.querySelector('.product-detail__notas');
    if (dl) {
      dl.replaceChildren();
      const row = document.createElement('div');
      row.className = 'product-detail__nota';
      const dt = document.createElement('dt'); dt.textContent = 'Familias olfativas';
      const dd = document.createElement('dd'); dd.textContent = (producto.familiasLabel || [producto.familiaLabel]).join(' · ');
      row.append(dt, dd);
      dl.appendChild(row);
    }
  }
  if (producto.duracion) setText('spec-duracion', producto.duracion);
  else document.getElementById('spec-duracion')?.closest('details')?.setAttribute('hidden', '');
  if (producto.intensidad) setText('spec-intensidad', producto.intensidad);

  const addBtn = document.getElementById('btn-add-to-cart');

  const tamanos = producto.tamanos || [{ ml: 30, precio: producto.precio }];
  const renderTamano = (size) => {
    const isMuestra = size === 'muestra';
    const t = tamanos.find((x) => String(x.ml) === size) || tamanos.find((x) => x.ml === 30) || tamanos[0];
    // 30 ml conserva el id base (es el único formato de la oferta 3 por S/ 99); 50 y 100 ml llevan sufijo y no entran.
    const id = isMuestra ? `${producto.id}-muestra` : (t.ml === 30 ? producto.id : `${producto.id}-${t.ml}ml`);
    const label = isMuestra ? 'Muestra' : `${t.ml} ml`;
    const price = isMuestra ? producto.precioMuestra : t.precio;
    setText('product-titulo', isMuestra ? `${producto.nombre} — Muestra` : producto.nombre);
    setText('product-precio', isMuestra ? producto.precioMuestraDisplay : `S/ ${t.precio} · ${label}`);
    if (addBtn) {
      addBtn.dataset.id = id;
      addBtn.dataset.name = `${producto.nombre} · ${label}`;
      addBtn.dataset.price = String(price);
      addBtn.dataset.image = producto.imagen;
    }
    // AE-R2: la barra sticky refleja nombre/precio vigentes (mismo texto que la ficha)
    setText('buy-bar-name', document.getElementById('product-titulo')?.textContent || '');
    setText('buy-bar-price', document.getElementById('product-precio')?.textContent || '');
    refreshProductStock();
  };

  renderTamano(initialIsMuestra ? 'muestra' : '30');
  initProductExtras(producto, productos);

  // Copy deck AE-F7: el radio "Elige tu tamaño" reemplaza el link "Probar en muestra
  // antes" (#link-muestra) que ya no existe en el DOM — recalcula precio/id/nombre sin
  // recargar, mismo dato que antes leía de ?variant=muestra en la URL.
  const sizeOptions = document.querySelectorAll('[data-size-option]');
  const initialSize = initialIsMuestra ? 'muestra' : '30';
  sizeOptions.forEach((input) => {
    input.checked = input.value === initialSize;
    input.addEventListener('change', () => {
      if (input.checked) renderTamano(input.value);
    });
  });
}

/* --------------------------------------------------------------------------
   AE-R2 · Extras de la ficha (BRIEFING_REESTRUCTURACION.md §4). Escrito por
   front en esta copia por autorización de Paul (2026-11-15).
   Galería, cantidad, fecha de entrega, barra sticky, relacionados y reseñas.
   NO inventa urgencia: [data-viewers-slot]/[data-stock-slot] quedan hidden
   hasta que exista un dato real (contrato /api/stock, ver briefing §4.7).
   -------------------------------------------------------------------------- */
function initProductExtras(producto, productos) {
  // Galería: miniaturas con imagen cambian la principal
  const mainImg = document.getElementById('product-img');
  const thumbs = document.querySelectorAll('[data-gallery-thumb]');
  thumbs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const src = btn.querySelector('img')?.getAttribute('src');
      if (!src || !mainImg) return;
      mainImg.src = src;
      thumbs.forEach((b) => { b.classList.toggle('is-active', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
    });
  });

  // Cantidad
  const qty = document.getElementById('product-qty');
  const clampQty = () => { qty.value = String(Math.min(Number(qty.max) || 99, Math.max(1, parseInt(qty.value, 10) || 1))); };
  if (qty) {
    document.querySelector('[data-qty-dec]')?.addEventListener('click', () => { qty.value = String((parseInt(qty.value, 10) || 1) - 1); clampQty(); });
    document.querySelector('[data-qty-inc]')?.addEventListener('click', () => { qty.value = String((parseInt(qty.value, 10) || 1) + 1); clampQty(); });
    qty.addEventListener('change', clampQty);
  }

  // Fecha de entrega calculada (plazo en data-delivery-min/max, PENDIENTE de confirmar con Paul)
  const deliveryEl = document.getElementById('product-delivery');
  const deliveryText = deliveryEl?.querySelector('[data-delivery-text]');
  if (deliveryEl && deliveryText) {
    const min = parseInt(deliveryEl.dataset.deliveryMin, 10);
    const max = parseInt(deliveryEl.dataset.deliveryMax, 10);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      const fmt = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
      const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return fmt.format(d); };
      deliveryText.textContent = `Pídelo hoy y recíbelo entre el ${day(min)} y el ${day(max)}`;
    }
  }

  // Barra sticky: aparece cuando el botón principal ya salió por arriba. Usa scroll + rect
  // (no IntersectionObserver) para no depender de él.
  const buyBar = document.getElementById('buy-bar');
  const mainBtn = document.getElementById('btn-add-to-cart');
  const buyBtn = document.getElementById('buy-bar-btn');
  if (buyBar && mainBtn) {
    const update = () => {
      const show = mainBtn.getBoundingClientRect().bottom < 0;
      if (buyBar.hidden !== !show) {
        buyBar.hidden = !show;
        buyBar.setAttribute('aria-hidden', String(!show));
        if (buyBtn) buyBtn.tabIndex = show ? 0 : -1;
        document.body.classList.toggle('has-buy-bar', show);
      }
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
    buyBtn?.addEventListener('click', () => mainBtn.click());
  }

  // Relacionados: 4 de la misma familia
  const grid = document.getElementById('related-grid');
  const tpl = document.getElementById('related-card-tpl');
  if (grid && tpl) {
    const rel = productos.filter((p) => p.familia === producto.familia && p.genero === producto.genero && p.id !== producto.id).slice(0, 4);
    rel.forEach((p) => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.querySelector('.related-card__link').href = `producto.html?id=${encodeURIComponent(p.id)}`;
      const im = node.querySelector('.related-card__img');
      im.src = p.imagen; im.alt = p.alt;
      node.querySelector('.related-card__familia').textContent = p.familiaLabel;
      node.querySelector('.related-card__name').textContent = p.nombre;
      node.querySelector('.related-card__price').textContent = displayPrice(p);
      grid.appendChild(node);
    });
    if (rel.length) document.querySelector('.related')?.removeAttribute('hidden');
  }

  initProductReviews(producto);
}

// Reseñas reales de Paul: data/resenas.json = [{ autor, texto, estrellas(1-5), fecha(ISO), foto?, producto?, verificado?, productos?:[ids] }].
// Vacío o ausente → se quedan los placeholders del HTML.
// Listas soportadas: #reviews-list (ficha/home) y cualquier [data-reviews-list] con data-reviews-offset / data-reviews-count;
// [data-reviews-all] pinta TODAS (página resenas.html).
function fillReviewList(list, tpl, source) {
  list.replaceChildren();
  source.forEach((r) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    const stars = Math.min(5, Math.max(0, Number(r.estrellas) || 0));
    const starsEl = node.querySelector('.review-card__stars');
    starsEl.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    starsEl.setAttribute('aria-label', `${stars} de 5 estrellas`);
    node.querySelector('.review-card__text').textContent = r.texto || '';
    node.querySelector('.review-card__author').textContent = r.autor || '';
    node.querySelector('.review-card__product').textContent = r.producto || '';
    const time = node.querySelector('.review-card__date');
    if (r.fecha) { time.dateTime = r.fecha; time.textContent = new Date(r.fecha).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' }); } else time.remove();
    if (r.verificado) node.querySelector('.review-card__verified').hidden = false;
    const photo = node.querySelector('[data-review-photo]');
    if (r.foto) { const im = document.createElement('img'); im.src = r.foto; im.alt = `Foto de ${r.autor || 'cliente'}`; im.width = 600; im.height = 600; im.loading = 'lazy'; photo.appendChild(im); }
    list.appendChild(node);
  });
}

let reviewsCache = null;
async function loadReviewsOnce() {
  if (reviewsCache) return reviewsCache;
  try {
    const res = await fetch('data/resenas.json', { cache: 'no-cache' });
    const json = res.ok ? await res.json() : [];
    reviewsCache = Array.isArray(json) ? json : [];
  } catch {
    reviewsCache = [];
  }
  return reviewsCache;
}

// Valoración por tarjeta: media de las reseñas que citan el id en `productos` (SKU base). Sin reseñas, queda oculta.
async function applyCardRatings(root = document) {
  const items = await loadReviewsOnce();
  if (!items.length) return;
  root.querySelectorAll('[data-card-rating]').forEach((el) => {
    const id = el.closest('.product-card')?.querySelector('.add-to-cart')?.dataset.id;
    if (!id) return;
    const own = items.filter((r) => Array.isArray(r.productos) && r.productos.includes(baseId(id)) && Number(r.estrellas) > 0);
    if (!own.length) return;
    const avg = own.reduce((s, r) => s + Number(r.estrellas), 0) / own.length;
    el.textContent = `★ ${avg.toFixed(1).replace('.', ',')} (${own.length})`;
    el.hidden = false;
  });
}

// Carrusel con flechas para las listas de reseñas del home/ficha. Las flechas solo aparecen si la lista desborda.
function setUpReviewCarousel(list) {
  if (list.dataset.carousel) return;
  list.dataset.carousel = '1';
  list.classList.add('reviews__list--carousel');
  const nav = document.createElement('div');
  nav.className = 'reviews__nav';
  nav.hidden = true;
  nav.innerHTML = '<button type="button" class="reviews__nav-btn" data-dir="-1" aria-label="Reseñas anteriores">‹</button><button type="button" class="reviews__nav-btn" data-dir="1" aria-label="Reseñas siguientes">›</button>';
  list.after(nav);
  const step = () => (list.firstElementChild ? list.firstElementChild.getBoundingClientRect().width + 20 : list.clientWidth);
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dir]');
    if (b) list.scrollBy({ left: Number(b.dataset.dir) * step(), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  const update = () => {
    nav.hidden = list.scrollWidth <= list.clientWidth + 4;
    const [prev, next] = nav.querySelectorAll('button');
    prev.disabled = list.scrollLeft <= 2;
    next.disabled = list.scrollLeft + list.clientWidth >= list.scrollWidth - 2;
  };
  list.addEventListener('scroll', update, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(update).observe(list);
  window.addEventListener('resize', update);
  update();
}

// Página de todas las reseñas: filtro por estrellas + "Cargar más".
function setUpReviewsAll(list, tpl, items) {
  const PAGE = 9;
  const sorted = items.slice().sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  const state = { stars: 0, shown: PAGE };
  const counts = [0, 0, 0, 0, 0, 0];
  sorted.forEach((r) => { const s = Math.min(5, Math.max(0, Number(r.estrellas) || 0)); counts[s] += 1; });

  const bar = document.createElement('div');
  bar.className = 'reviews-filter';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Filtrar reseñas por estrellas');
  const mk = (stars, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'reviews-filter__btn';
    b.dataset.stars = String(stars);
    b.textContent = label;
    return b;
  };
  bar.appendChild(mk(0, `Todas (${sorted.length})`));
  for (let s = 5; s >= 1; s -= 1) if (counts[s]) bar.appendChild(mk(s, `${s} ★ (${counts[s]})`));
  const status = document.createElement('p');
  status.className = 'reviews-filter__status';
  status.setAttribute('role', 'status');
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'btn btn--outline reviews-more';
  more.textContent = 'Cargar más reseñas';
  list.before(bar, status);
  list.after(more);

  const render = () => {
    const filtered = state.stars ? sorted.filter((r) => Math.round(Number(r.estrellas) || 0) === state.stars) : sorted;
    fillReviewList(list, tpl, filtered.slice(0, state.shown));
    more.hidden = filtered.length <= state.shown;
    status.textContent = `Mostrando ${Math.min(state.shown, filtered.length)} de ${filtered.length} reseñas`;
    bar.querySelectorAll('[data-stars]').forEach((b) => {
      const on = Number(b.dataset.stars) === state.stars;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-stars]');
    if (!b) return;
    state.stars = Number(b.dataset.stars);
    state.shown = PAGE;
    render();
  });
  more.addEventListener('click', () => { state.shown += PAGE; render(); });
  render();
}

async function initProductReviews(producto) {
  const lists = [...document.querySelectorAll('#reviews-list, [data-reviews-list], [data-reviews-all]')];
  const tpl = document.getElementById('review-card-tpl');
  if (!lists.length || !tpl) return;
  const items = await loadReviewsOnce();
  if (!items.length) return;

  const own = producto ? items.filter((r) => !r.productos || r.productos.includes(producto.id)) : items;
  const pool = own.length ? own : items;
  lists.forEach((list) => {
    if (list.hasAttribute('data-reviews-all')) { setUpReviewsAll(list, tpl, items); return; }
    const offset = parseInt(list.dataset.reviewsOffset, 10) || 0;
    const count = parseInt(list.dataset.reviewsCount, 10) || 6;
    const slice = pool.slice(offset, offset + count);
    fillReviewList(list, tpl, slice.length ? slice : pool.slice(0, count));
    setUpReviewCarousel(list);
  });

  // Valoración global (solo con datos reales)
  const rated = items.filter((r) => Number(r.estrellas) > 0);
  if (rated.length) {
    const avg = rated.reduce((s, r) => s + Number(r.estrellas), 0) / rated.length;
    const avgText = avg.toFixed(1).replace('.', ',');
    const text = `${avgText} de 5 · ${rated.length} reseñas`;
    const slot = document.querySelector('[data-rating-slot]');
    if (slot) { slot.querySelector('[data-rating-text]').textContent = text; slot.hidden = false; }
    document.querySelectorAll('[data-rating-num]').forEach((el) => { el.textContent = avgText; });
    document.querySelectorAll('[data-rating-summary]').forEach((el) => {
      el.textContent = document.querySelector('[data-rating-num]') ? `Basado en ${rated.length} reseñas` : text;
      el.hidden = false;
    });
    const bar = document.querySelector('[data-rating-bar]');
    if (bar) { bar.querySelector('[data-rating-bar-text]').textContent = `${avgText}/5 · Basado en ${rated.length} opiniones`; bar.hidden = false; }
    // Solo se desmarcan las cifras de valoración: stock/"viendo"/pedidos siguen siendo de muestra hasta tener dato real.
    document.querySelectorAll('[data-rating-num], [data-rating-summary], [data-rating-bar-text]').forEach((el) => el.removeAttribute('data-placeholder-cifra'));
  }
  applyCardRatings();
}

// Métricas reales de la tienda (data/metricas.json: { "pedidosEntregados": N }). Sin dato, la cifra sigue siendo de muestra.
async function initMetrics() {
  const els = document.querySelectorAll('[data-metric]');
  if (!els.length) return;
  let data;
  try {
    const res = await fetch('data/metricas.json', { cache: 'no-store' });
    if (!res.ok) return;
    data = await res.json();
  } catch { return; }
  els.forEach((el) => {
    const v = Number(data[el.dataset.metric]);
    if (!Number.isFinite(v) || v <= 0) return;
    el.textContent = `+${new Intl.NumberFormat('es-PE').format(v)}`;
    el.removeAttribute('data-placeholder-cifra');
  });
}
/* --------------------------------------------------------------------------
   AE-R4 · Home reestructurado (index.html). Escrito por front en esta copia por
   autorización de Paul (2026-11-15). Pestañas de favoritos, "recién llegados",
   datalist del buscador, reseñas y franja de valoración. Los datos salen de
   data/productos.json (género real y flag "nuevo"). Sin datos, queda el HTML
   estático (4 tarjetas de fallback; "recién llegados" oculto).
   -------------------------------------------------------------------------- */
function buildHomeCard(p, badgeText) {
  const tpl = document.getElementById('home-card-tpl');
  const node = tpl.content.firstElementChild.cloneNode(true);
  const href = `producto.html?id=${encodeURIComponent(p.id)}`;
  node.dataset.familia = p.familia;
  node.querySelector('.product-card__link').href = href;
  const im = node.querySelector('.product-card__media img');
  im.src = p.imagen; im.alt = p.alt;
  node.querySelector('.product-card__familia').textContent = p.familiaLabel;
  const nameLink = node.querySelector('.product-card__name a');
  nameLink.href = href; nameLink.textContent = p.nombre;
  node.querySelector('.product-card__price').textContent = displayPrice(p);
  const badge = node.querySelector('.product-card__badge');
  if (badgeText) { badge.textContent = badgeText; badge.hidden = false; }
  const btn = node.querySelector('.add-to-cart');
  btn.dataset.id = p.id; btn.dataset.name = p.nombreCarrito || p.nombre; btn.dataset.price = String(basePrice(p)); btn.dataset.image = p.imagen;
  return node;
}

/* --------------------------------------------------------------------------
   AE-R5 · URGENCIA en perfumes (decisión de Paul 2026-11-15: "buscamos la urgencia y la
   necesidad de comprar"). Etiquetas "Quedan N unidades" / "Últimas unidades" en las tarjetas
   y "N personas viendo" + stock en la ficha, desde data/urgencia.json. Con "placeholder": true
   las cifras son de MUESTRA (se marcan data-placeholder-cifra): NO publicar así; con datos
   reales poner placeholder:false y el stock real por SKU. Si el JSON falla, no se muestra nada.
   -------------------------------------------------------------------------- */
function soldOutButton(btn) {
  if (!btn || btn.dataset.agotado) return;
  btn.dataset.agotado = '1';
  btn.dataset.labelOriginal = btn.textContent;
  btn.disabled = true;
  btn.setAttribute('aria-disabled', 'true');
  btn.textContent = 'Agotado';
}
function restoreButton(btn) {
  if (!btn || !btn.dataset.agotado) return;
  delete btn.dataset.agotado;
  btn.disabled = false;
  btn.removeAttribute('aria-disabled');
  btn.textContent = btn.dataset.labelOriginal || 'Añadir';
}

async function applyStockTags(root = document) {
  const data = await loadStock();
  if (!data || data.source === 'none') return;
  root.querySelectorAll('.product-card, .product-item, .cart-upsell__item, .related-card').forEach((card) => {
    const btn = card.querySelector('.add-to-cart');
    const id = btn?.dataset.id;
    const n = id ? availableFor(id) : undefined;
    if (!btn || n === undefined) return;
    if (n <= 0) soldOutButton(btn);
    if (card.querySelector('.stock-tag')) return;
    if (n > 0 && !isLowEnoughToShow(n)) return;
    const tag = document.createElement('p');
    tag.className = `stock-tag${n <= data.meta.umbralUltimas ? ' stock-tag--low' : ''}`;
    tag.textContent = stockLabel(n);
    if (data.placeholder) tag.setAttribute('data-placeholder-cifra', '');
    btn.before(tag);
  });
}

/* Ficha: stock del tamaño elegido, tope del selector de cantidad y estado "Agotado".
   Se llama desde renderTamano (cada cambio de tamaño). "Personas viendo": SOLO con cifras de muestra
   (placeholder); con datos reales se oculta — no hay contador real y inventarlo infringe la Ley 29571.
   Se fija una vez por carga (no se actualiza en vivo). */
async function refreshProductStock() {
  const addBtn = document.getElementById('btn-add-to-cart');
  if (!addBtn) return;
  const data = await loadStock();
  const id = addBtn.dataset.id;
  const n = data.source === 'none' ? undefined : availableFor(id);
  const stockSlot = document.querySelector('[data-stock-slot]');
  const viewersSlot = document.querySelector('[data-viewers-slot]');
  const qty = document.getElementById('product-qty');
  const buyBtn = document.getElementById('buy-bar-btn');

  if (stockSlot) {
    const show = n !== undefined && (n <= 0 || isLowEnoughToShow(n));
    stockSlot.hidden = !show;
    if (show) {
      stockSlot.textContent = stockLabel(n);
      stockSlot.toggleAttribute('data-placeholder-cifra', !!data.placeholder);
    }
  }
  if (viewersSlot && data.meta.viewers && data.placeholder && n !== 0) {
    if (!viewersSlot.dataset.v) {
      const { min, max } = data.meta.viewers;
      viewersSlot.dataset.v = String(Math.floor(min + Math.random() * (max - min + 1)));
    }
    viewersSlot.textContent = `${viewersSlot.dataset.v} personas viendo este producto`;
    viewersSlot.setAttribute('data-placeholder-cifra', '');
    viewersSlot.hidden = false;
  } else if (viewersSlot) {
    viewersSlot.hidden = true;
  }
  if (qty) {
    qty.max = String(n === undefined ? 99 : Math.min(99, Math.max(1, n)));
    if (Number(qty.value) > Number(qty.max)) qty.value = qty.max;
  }
  [addBtn, buyBtn].forEach((b) => { if (!b) return; if (n === 0) soldOutButton(b); else restoreButton(b); });
}

async function initUrgency() {
  await applyStockTags();
}

/* Carrito: tope por stock. Desactiva "+" al llegar al tope y ajusta (una vez por carga) las líneas que
   superan el stock actual (p. ej. el stock bajó desde que se añadió). */
let cartClamped = false;
async function applyCartCaps() {
  const data = await loadStock();
  if (!data || data.source === 'none') return;
  if (!cartClamped) {
    cartClamped = true;
    let changed = false;
    cartStore.getItems().slice().forEach((it) => {
      const n = availableFor(it.id);
      if (n !== undefined && it.qty > n) { cartStore.updateQty(it.id, n - it.qty); changed = true; }
    });
    if (changed) return; // el notify de cartStore repinta y vuelve a entrar aquí
  }
  document.querySelectorAll('.cart-line').forEach((line) => {
    const n = availableFor(line.dataset.id);
    const item = cartStore.getItems().find((i) => i.id === line.dataset.id);
    const inc = line.querySelector('.qty-btn[data-action="inc"]');
    if (!inc || n === undefined || !item) return;
    const atCap = item.qty >= n;
    inc.disabled = atCap;
    inc.title = atCap ? `Máximo disponible: ${n}` : '';
  });
}

/* Conflicto de stock del backend (409 { code:'sin_stock', stock:[{sku,pedido,disponible}] }): refresca el
   stock, ajusta el carrito al disponible y devuelve el texto para mostrar. Lo llamará initCheckout cuando
   exista el endpoint (hoy no hay backend en esta copia). */
async function handleStockConflict(payload) {
  cartClamped = false;
  await loadStock(true);
  await applyCartCaps();
  return (payload && payload.error) || 'Algunas fragancias ya no tienen stock suficiente. Ajustamos tu carrito.';
}

/* Destinos aún sin confirmar (data-cta-pendiente): no navegar a un 404 mientras no exista la URL real. */
function initPendingLinks() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-cta-pendiente]');
    if (link) e.preventDefault();
  });
}
// Prioridad en la pestaña "Para ella" del home (ids de data/productos.json). Editable.
const INICIO_ELLA = ['ae-210', 'ae-219', 'ae-237', 'ae-289', 'ae-310', 'ae-181', 'ae-258', 'ae-175'];
const idxElla = (p) => { const i = INICIO_ELLA.indexOf(p.id); return i === -1 ? 99 : i; };
// Mezcla ella/él de a uno, empezando por ella, hasta n tarjetas (Favoritos y Nuevos ingresos del home).
function intercalar(ella, el, n) {
  const out = [];
  for (let i = 0; out.length < n && (i < ella.length || i < el.length); i++) {
    if (ella[i]) out.push(ella[i]);
    if (out.length < n && el[i]) out.push(el[i]);
  }
  return out;
}
async function initHomePage() {
  if (document.body.dataset.page === 'resenas') { initProductReviews(null); return; }
  if (document.body.dataset.page !== 'home' && document.body.dataset.page !== 'index' && !document.getElementById('trending-track')) return;
  const productos = await loadProductosOnce();
  if (productos.length) {
    // Pestañas de favoritos
    const track = document.getElementById('trending-track');
    const tabs = document.querySelectorAll('[data-tabs="favoritos"] [data-tab]');
    const pick = (tab) => {
      if (tab === 'favoritos') {
        const fav = productos.filter((p) => p.flag === 'bestseller' || p.flag === 'trending');
        const ella = fav.filter((p) => p.genero === 'para-ella').sort((x, y) => idxElla(x) - idxElla(y));
        return intercalar(ella, fav.filter((p) => p.genero !== 'para-ella'), 4);
      }
      const lista = productos.filter((p) => p.genero === tab);
      if (tab !== 'para-ella') return lista.slice(0, 4);
      // "Para ella": primero las fichas elegidas por Paul con el frasco transparente del color de la esencia
      // (imágenes nuevas, más femeninas); el resto sigue el orden del catálogo.
      const idx = idxElla;
      return lista.map((p, i) => [p, i]).sort((a, b) => (idx(a[0]) - idx(b[0])) || a[1] - b[1]).map((x) => x[0]).slice(0, 4);
    };
    const renderTab = (tab) => {
      if (!track) return;
      track.replaceChildren(...pick(tab).map((p) => buildHomeCard(p, p.flag === 'bestseller' ? 'Bestseller' : p.flag === 'trending' ? 'Trending' : '')));
      applyStockTags(track);
      applyCardRatings(track);
      tabs.forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
    };
    if (track && tabs.length) {
      renderTab('favoritos');
      tabs.forEach((b) => b.addEventListener('click', () => renderTab(b.dataset.tab)));
    }

    // Recién llegados
    const nuevosGrid = document.getElementById('nuevos-grid');
    const nuevosTodos = productos.filter((p) => p.nuevo);
    const nuevos = intercalar(nuevosTodos.filter((p) => p.genero === 'para-ella'), nuevosTodos.filter((p) => p.genero !== 'para-ella'), 8);
    if (nuevosGrid && nuevos.length) {
      nuevosGrid.replaceChildren(...nuevos.map((p) => buildHomeCard(p, 'Nuevo')));
      applyStockTags(nuevosGrid);
      applyCardRatings(nuevosGrid);
      document.querySelector('.nuevos')?.removeAttribute('hidden');
    }

    // Sugerencias del buscador (nombres propios, nunca marcas)
    const list = document.getElementById('home-search-list');
    if (list) {
      productos.forEach((p) => { const o = document.createElement('option'); o.value = p.nombre; list.appendChild(o); });
    }
  }
  initProductReviews(null);
}

/* --------------------------------------------------------------------------
   AE-R4 · Reels wrapper ("Del laboratorio a tu casa"). Vídeo vertical 9:16 por
   .reel; sin data-reel-src queda el placeholder y el botón de reproducir oculto.
   Un solo reel suena/reproduce a la vez. Escrito por front en esta copia por
   autorización de Paul (2026-11-15).
   -------------------------------------------------------------------------- */
function initReels() {
  const reels = [...document.querySelectorAll('[data-reels] .reel')];
  if (!reels.length) return;
  const stopAll = (except) => reels.forEach((r) => {
    if (r === except) return;
    r.querySelector('.reel__video')?.pause();
    r.classList.remove('is-playing');
  });
  reels.forEach((reel) => {
    const video = reel.querySelector('.reel__video');
    const btn = reel.querySelector('.reel__play');
    const pending = reel.querySelector('.reel__pending');
    const src = video?.dataset.reelSrc;
    if (!video || !btn || !src) return;
    btn.hidden = false;
    if (pending) pending.hidden = true;
    btn.addEventListener('click', () => {
      if (!video.getAttribute('src')) video.src = src;
      stopAll(reel);
      if (video.paused) { video.play().catch(() => {}); reel.classList.add('is-playing'); }
      else { video.pause(); reel.classList.remove('is-playing'); }
    });
    video.addEventListener('click', () => btn.click());
  });

  const pauseOffscreen = () => {
    reels.forEach((reel) => {
      if (!reel.classList.contains('is-playing')) return;
      const r = reel.getBoundingClientRect();
      const visible = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      if (document.hidden || visible < r.height * 0.3) stopAll(null);
    });
  };
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    setTimeout(() => { ticking = false; pauseOffscreen(); }, 150);
  }, { passive: true });
  document.addEventListener('visibilitychange', pauseOffscreen);
}
/* --------------------------------------------------------------------------
   Catálogo — búsqueda ?q= (desde el buscador del home). Normaliza acentos.
   -------------------------------------------------------------------------- */
const normalizeText = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* --------------------------------------------------------------------------
   Checkout (carrito.html) — Mercado Pago Card Payment Brick, mismo patrón que
   AP Beauty (AP-J2 / AB-J15..J21). GET /api/market decide: con `mercadopago` se
   monta [dirección de envío] → [Brick] → [aviso de error]; con `none` (o si el
   backend no responde) el botón mantiene el aviso "pago en configuración".
   El importe SIEMPRE lo fija el servidor (create-order): el Brick solo lo muestra.
   Los nodos los crea JS (carrito.html no trae markup de checkout); estilos en
   style.css (`.mp-*`, `.is-hidden-mp`).
   -------------------------------------------------------------------------- */
const MP_PUBLIC_KEY = 'APP_USR-2a92421a-445e-4c40-8786-000697f584fe';
const SHIPPING_DRAFT_KEY = 'ae_shipping_draft';

function loadMercadoPagoSdk() {
  if (window.MercadoPago) return Promise.resolve();
  const existing = document.getElementById('mp-sdk');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'mp-sdk';
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.appendChild(script);
  });
}

function showMpError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function buildShippingForm() {
  const form = document.createElement('form');
  form.id = 'mp-shipping';
  form.className = 'mp-shipping';
  form.setAttribute('aria-label', 'Datos de envío');
  form.autocomplete = 'on';
  form.addEventListener('submit', (e) => e.preventDefault()); // el que paga es el Brick
  form.innerHTML = [
    '<h3 class="mp-shipping__title">Datos de envío</h3>',
    '<div class="mp-shipping__grid">',
    '  <label class="mp-shipping__field mp-shipping__field--wide">',
    '    <span>Nombre y apellidos</span>',
    '    <input name="nombre" type="text" autocomplete="name" required maxlength="120" placeholder="Nombre y apellido">',
    '  </label>',
    '  <label class="mp-shipping__field">',
    '    <span>Teléfono / celular</span>',
    '    <input name="telefono" type="tel" inputmode="tel" enterkeyhint="next" autocomplete="tel" required maxlength="20">',
    '  </label>',
    '  <label class="mp-shipping__field">',
    '    <span>Departamento</span>',
    '    <input name="departamento" type="text" autocomplete="address-level1" required maxlength="60">',
    '  </label>',
    '  <label class="mp-shipping__field">',
    '    <span>Provincia</span>',
    '    <input name="provincia" type="text" autocomplete="address-level2" required maxlength="60">',
    '  </label>',
    '  <label class="mp-shipping__field">',
    '    <span>Distrito</span>',
    '    <input name="distrito" type="text" autocomplete="address-level3" required maxlength="60">',
    '  </label>',
    '  <label class="mp-shipping__field mp-shipping__field--wide">',
    '    <span>Calle, avenida o jirón</span>',
    '    <input name="calle" type="text" autocomplete="address-line1" required maxlength="140" placeholder="Solo la calle (ej. Av. Pardo)">',
    '  </label>',
    '  <label class="mp-shipping__field">',
    '    <span>Número de casa / edificio</span>',
    '    <input name="numero" type="text" inputmode="numeric" enterkeyhint="next" autocomplete="address-line2" required maxlength="20" placeholder="Ej. 123">',
    '  </label>',
    '  <label class="mp-shipping__field mp-shipping__field--wide">',
    '    <span>Referencia, dpto./interior <em>(opcional)</em></span>',
    '    <input name="referencia" type="text" maxlength="160">',
    '  </label>',
    '  <label class="mp-shipping__field">',
    '    <span>Código postal <em>(opcional)</em></span>',
    '    <input name="codigoPostal" type="text" inputmode="numeric" enterkeyhint="done" autocomplete="postal-code" maxlength="12">',
    '  </label>',
    '</div>',
  ].join('\n');

  // MP puntúa más riesgo a un comprador con nombre incompleto; el backend lo rechaza (400).
  const nombre = form.elements.nombre;
  const validarNombre = () => nombre.setCustomValidity(
    nombre.value.trim().split(/\s+/).filter(Boolean).length >= 2 ? '' : 'Escribe tu nombre y apellido',
  );
  nombre.addEventListener('input', validarNombre);

  // Borrador (solo datos de envío, NUNCA tarjeta): un rechazo o recarga no vacía el formulario.
  try {
    const draft = JSON.parse(sessionStorage.getItem(SHIPPING_DRAFT_KEY) || '{}');
    Object.keys(draft).forEach((k) => {
      if (form.elements[k] && typeof draft[k] === 'string') form.elements[k].value = draft[k];
    });
  } catch (_) { /* borrador corrupto: se ignora */ }
  validarNombre();
  form.addEventListener('input', () => {
    const draft = {};
    Array.from(form.elements).forEach((el) => { if (el.name) draft[el.name] = el.value; });
    try { sessionStorage.setItem(SHIPPING_DRAFT_KEY, JSON.stringify(draft)); } catch (_) { /* cuota/privado */ }
  });

  Array.from(form.elements).forEach((el) => {
    if (!el.name || el.tagName !== 'INPUT') return;
    const err = document.createElement('p');
    err.className = 'mp-shipping__error';
    err.id = `mp-err-${el.name}`;
    err.setAttribute('aria-live', 'polite');
    err.hidden = true;
    el.closest('label').appendChild(err);
    el.addEventListener('input', () => { if (el.validity.valid) clearFieldError(el); });
  });
  return form;
}

function clearFieldError(input) {
  input.removeAttribute('aria-invalid');
  input.removeAttribute('aria-describedby');
  const err = document.getElementById(`mp-err-${input.name}`);
  if (err) { err.textContent = ''; err.hidden = true; }
}

// Marca el form como "intentado" (css pinta :invalid desde entonces), muestra el error por
// campo y enfoca el primero inválido. Devuelve true si todo es válido.
function validateShippingInline(form) {
  form.classList.add('is-attempted');
  let first = null;
  Array.from(form.elements).forEach((el) => {
    if (!el.name || el.tagName !== 'INPUT') return;
    if (el.validity.valid) { clearFieldError(el); return; }
    const err = document.getElementById(`mp-err-${el.name}`);
    el.setAttribute('aria-invalid', 'true');
    if (err) {
      err.textContent = el.validationMessage || 'Revisa este campo';
      err.hidden = false;
      el.setAttribute('aria-describedby', err.id);
    }
    if (!first) first = el;
  });
  if (first) {
    first.focus();
    first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  return !first;
}

// Forma que consume el backend (POST /api/mp/process-payment). El servidor revalida todo.
function readShippingForm(form) {
  const val = (n) => (form.elements[n]?.value || '').trim();
  const street = val('calle');
  const number = val('numero');
  return {
    name: val('nombre'),
    phone: val('telefono'),
    address: {
      // "Amazonas 836" + "836" → "Amazonas 836", no "Amazonas 836 836"
      line: number && street.split(/\s+/).pop().toLowerCase() === number.toLowerCase()
        ? street
        : [street, number].filter(Boolean).join(' '),
      street,
      number,
      reference: val('referencia'),
      district: val('distrito'),
      province: val('provincia'),
      department: val('departamento'),
      zip: val('codigoPostal'),
      country: 'PE',
    },
  };
}

// Mensajes por status_detail: MP recomienda explicar el motivo y qué hacer.
function rejectionMessage(detail) {
  const d = String(detail || '');
  if (d === 'cc_rejected_high_risk') return 'No pudimos validar este pago. Prueba con otra tarjeta.';
  if (d.startsWith('cc_rejected_bad_filled')) return 'Revisa los datos de la tarjeta (número, vencimiento o código) e inténtalo de nuevo.';
  if (d === 'cc_rejected_insufficient_amount') return 'Saldo insuficiente. Prueba con otra tarjeta u otro medio de pago.';
  if (d === 'cc_rejected_call_for_authorize') return 'Tu banco necesita autorizar este pago. Llámalo para autorizarlo o prueba con otra tarjeta.';
  if (d === 'cc_rejected_card_disabled') return 'Tu tarjeta está inactiva. Actívala con tu banco o prueba con otra.';
  if (d === 'cc_rejected_max_attempts') return 'Superaste el máximo de intentos. Prueba con otra tarjeta o inténtalo más tarde.';
  if (d === 'cc_rejected_duplicated_payment') return 'Ya hiciste un pago igual hace un momento. Revisa tu correo antes de reintentar.';
  return 'El pago fue rechazado. Prueba con otra tarjeta.';
}

function setProcessing(on) {
  const summary = document.querySelector('.cart-summary');
  if (!summary) return;
  summary.classList.toggle('is-processing', on);
  summary.setAttribute('aria-busy', on ? 'true' : 'false');
  let st = summary.querySelector('.cart-summary__status');
  if (on) {
    if (!st) {
      st = document.createElement('p');
      st.className = 'cart-summary__status';
      st.setAttribute('role', 'status');
      st.textContent = 'Procesando tu pago…';
      summary.querySelector('.mp-brick-error')?.insertAdjacentElement('beforebegin', st);
    }
    st.hidden = false;
  } else if (st) {
    st.hidden = true;
  }
}

function clearCartAfterPayment() {
  cartStore.getItems().map((i) => i.id).forEach((id) => cartStore.removeItem(id));
  try { sessionStorage.removeItem(SHIPPING_DRAFT_KEY); } catch (_) { /* noop */ }
}

// Monta el Card Payment Brick. `orderId`/`amount` vienen de create-order: el Brick nunca decide el importe.
// `onNewOrder` se invoca cuando hay que rehacer el pedido (4º intento tras rechazos).
async function mountMercadoPagoBrick(container, errorEl, orderId, amount, shippingForm, onNewOrder) {
  await loadMercadoPagoSdk();
  const mp = new window.MercadoPago(MP_PUBLIC_KEY, { locale: 'es-PE' });
  const bricksBuilder = mp.bricks();
  let inFlight = false;

  return bricksBuilder.create('cardPayment', container.id, {
    initialization: { amount },
    customization: {
      visual: {
        style: {
          theme: 'default',
          customVariables: {
            textPrimaryColor: '#242422',
            formBackgroundColor: '#FFFFFF',
            inputBackgroundColor: '#FFFFFF',
            baseColor: '#242422',
            errorColor: '#C8102E',
            outlinePrimaryColor: '#B8B8B8',
            outlineSecondaryColor: '#B8B8B8',
            borderRadiusMedium: '2px',
          },
        },
      },
    },
    callbacks: {
      onReady: () => {},
      // La forma del argumento varía entre versiones del SDK: acepto `{ formData }` o plano.
      onSubmit: (brickData) => new Promise((resolve, reject) => {
        const formData = (brickData && brickData.formData) || brickData || {};

        // El Brick solo valida SUS campos; los de envío se validan aquí. `reject()` mantiene el Brick activo.
        if (shippingForm && !validateShippingInline(shippingForm)) {
          reject();
          showMpError(errorEl, 'Completa los datos de envío antes de pagar.');
          return;
        }
        if (inFlight) { reject(); return; }
        inFlight = true;
        setProcessing(true);
        errorEl.hidden = true;

        // Solo orderId + tarjeta tokenizada + envío + Device ID. El importe lo resuelve el servidor desde
        // el pedido. `device_id` lo puebla el SDK solo en `window.MP_DEVICE_SESSION_ID` (antifraude MP).
        const payload = {
          orderId,
          token: formData.token,
          issuer_id: formData.issuer_id,
          payment_method_id: formData.payment_method_id,
          payer: {
            email: formData.payer?.email,
            identification: formData.payer?.identification,
          },
          shipping: readShippingForm(shippingForm),
          ...(window.MP_DEVICE_SESSION_ID ? { device_id: window.MP_DEVICE_SESSION_ID } : {}),
        };
        fetch('/api/mp/process-payment', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then((res) => res.json().catch(() => ({})).then((data) => ({ ok: res.ok, status: res.status, data })))
          .then(({ ok, status, data }) => {
            inFlight = false;
            setProcessing(false);
            resolve(); // el Brick solo espera que la promesa termine
            if (status === 400 && data.field === 'shipping.name') {
              showMpError(errorEl, data.error || 'Escribe tu nombre y apellido');
              shippingForm?.elements.nombre?.focus();
              return;
            }
            if (status === 409) {
              // Intentos agotados o pedido ya procesado: se prepara un pedido nuevo.
              showMpError(errorEl, data.error || 'Preparamos un pago nuevo. Vuelve a introducir los datos de tu tarjeta.');
              onNewOrder();
              return;
            }
            if (!ok) { showMpError(errorEl, 'No se pudo procesar el pago. Inténtalo de nuevo.'); return; }
            if (data.status === 'approved') {
              clearCartAfterPayment();
              window.location.href = 'confirmacion.html';
            } else if (data.status === 'pending' && data.status_detail === 'pending_challenge' && data.three_ds_info?.external_resource_url) {
              // 3DS 2.0: el banco pide verificar al cliente (Status Screen Brick). El resultado final lo fija
              // el webhook; aquí solo se consulta /api/mp/order-status.
              start3dsChallenge({ bricksBuilder, data, orderId, brickContainer: container, errorEl });
            } else if (data.status === 'in_process' || data.status === 'pending') {
              // Bancos peruanos: pago en revisión; el webhook confirma (nunca se marca pagado desde aquí).
              clearCartAfterPayment();
              window.location.href = 'confirmacion.html?estado=pendiente';
            } else {
              showMpError(errorEl, rejectionMessage(data.status_detail));
            }
          })
          .catch(() => {
            inFlight = false;
            setProcessing(false);
            reject();
            showMpError(errorEl, 'No se pudo procesar el pago. Inténtalo de nuevo.');
          });
      }),
      onError: (error) => {
        console.error('Mercado Pago — error del Brick:', error);
        showMpError(errorEl, 'No se pudo cargar el formulario de pago.');
      },
    },
  });
}

// 3DS 2.0 (Checkout Bricks): `process-payment` devolvió `pending_challenge` + `three_ds_info`. Se oculta el
// Brick de tarjeta, se monta el Status Screen Brick (muestra el desafío del banco; debe empezar en <30 s o MP
// rechaza) y se consulta `order-status` hasta que el webhook fije `approved`/`rejected`. Si pasa el tiempo
// máximo sin resultado → «pago en revisión». Nada se confirma desde el navegador.
const THREEDS_POLL_MS = 4000;
const THREEDS_MAX_MS = 180000;

async function start3dsChallenge({ bricksBuilder, data, orderId, brickContainer, errorEl }) {
  if (errorEl) errorEl.hidden = true;
  brickContainer.hidden = true;
  const host = document.createElement('div');
  host.id = 'statusScreenBrick_container';
  host.className = 'mp-3ds-container';
  const note = document.createElement('p');
  note.className = 'mp-3ds-note';
  note.setAttribute('role', 'status');
  note.textContent = 'Tu banco te pedirá verificar este pago. No cierres ni recargues la página.';
  brickContainer.insertAdjacentElement('afterend', host);
  host.insertAdjacentElement('beforebegin', note);

  const volverAlBrick = () => {
    host.remove();
    note.remove();
    brickContainer.hidden = false;
  };

  try {
    await bricksBuilder.create('statusScreen', host.id, {
      initialization: {
        paymentId: String(data.id),
        additionalInfo: {
          externalResourceURL: data.three_ds_info.external_resource_url,
          creq: data.three_ds_info.creq,
        },
      },
      callbacks: {
        onReady: () => {},
        onError: (error) => console.error('Mercado Pago — error del Status Screen (3DS):', error),
      },
    });
  } catch (err) {
    console.error('Mercado Pago — no se pudo mostrar el desafío 3DS:', err);
  }

  const inicio = Date.now();
  const timer = setInterval(async () => {
    try {
      const res = await fetch(`/api/mp/order-status/${encodeURIComponent(orderId)}`, { cache: 'no-store' });
      const { estado } = await res.json();
      if (estado === 'approved') {
        clearInterval(timer);
        clearCartAfterPayment();
        window.location.href = 'confirmacion.html';
        return;
      }
      if (estado === 'rejected') {
        clearInterval(timer);
        volverAlBrick();
        showMpError(errorEl, 'Tu banco no pudo verificar el pago. Prueba con otra tarjeta.');
        return;
      }
    } catch (_) { /* red intermitente: se reintenta en el siguiente ciclo */ }
    if (Date.now() - inicio > THREEDS_MAX_MS) {
      clearInterval(timer);
      clearCartAfterPayment();
      window.location.href = 'confirmacion.html?estado=pendiente';
    }
  }, THREEDS_POLL_MS);
}

// `Bricks.create` con credenciales rotas loguea el error y deja el contenedor vacío: se vigila que
// aparezca el iframe para no dejar al cliente con la página de pago en blanco.
function brickRendered(container, timeoutMs) {
  return new Promise((resolve) => {
    if (container.querySelector('iframe')) { resolve(true); return; }
    const done = (val) => { obs.disconnect(); clearTimeout(timer); resolve(val); };
    const obs = new MutationObserver(() => { if (container.querySelector('iframe')) done(true); });
    obs.observe(container, { childList: true, subtree: true });
    const timer = setTimeout(() => done(!!container.querySelector('iframe')), timeoutMs);
  });
}

async function initPaymentGateway(btnCheckout) {
  const summary = btnCheckout.closest('.cart-summary');
  if (!summary) return;

  // `.cart-summary__checkout` trae display:flex propio: no se usa `.hidden`, sino una clase CSS.
  btnCheckout.classList.add('is-hidden-mp');

  const shippingForm = buildShippingForm();
  btnCheckout.insertAdjacentElement('afterend', shippingForm);
  const container = document.createElement('div');
  container.id = 'cardPaymentBrick_container';
  container.className = 'mp-brick-container';
  shippingForm.insertAdjacentElement('afterend', container);
  const errorEl = document.createElement('p');
  errorEl.className = 'mp-brick-error';
  errorEl.setAttribute('role', 'alert');
  errorEl.hidden = true;
  container.insertAdjacentElement('afterend', errorEl);

  let brick = null;
  let generation = 0; // descarta respuestas de pedidos viejos si el carrito cambió mientras tanto

  function unmountBrick() {
    try { if (brick && brick.unmount) brick.unmount(); } catch (_) { /* ya desmontado */ }
    brick = null;
    container.textContent = '';
  }

  async function startCheckout() {
    const mine = ++generation;
    unmountBrick();
    const items = cartStore.getItems().filter((i) => i.qty > 0).map((i) => ({ id: i.id, quantity: i.qty }));
    if (items.length === 0) return;
    try {
      const orderRes = await fetch('/api/mp/create-order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const order = await orderRes.json().catch(() => ({}));
      if (mine !== generation) return;
      if (!orderRes.ok || !order.orderId) {
        if (orderRes.status === 400) { showMpError(errorEl, order.error || 'Algún producto de tu carrito ya no está disponible.'); return; }
        throw new Error(order.error || 'order_failed');
      }
      errorEl.hidden = true;

      // El total del servidor manda: si difiere del que calculó el navegador (p. ej. terminó la oferta),
      // se avisa y se actualiza el resumen para que el cliente pague exactamente lo que ve.
      const clientTotal = computeCartTotals(cartStore.getItems()).total;
      if (Math.abs(order.amount - clientTotal) > 0.009) {
        showMpError(errorEl, `El total de tu pedido es ${formatPrice(order.amount)}.`);
        setText('cart-page-total', formatPrice(order.amount));
      }

      mountMercadoPagoBrick(container, errorEl, order.orderId, order.amount, shippingForm, () => {
        if (mine === generation) startCheckout();
      })
        .then((ctrl) => { if (mine === generation) brick = ctrl; else if (ctrl && ctrl.unmount) ctrl.unmount(); })
        .catch((err) => console.error('Mercado Pago — el Brick no montó:', err));

      if (!(await brickRendered(container, 8000)) && mine === generation) throw new Error('brick_no_render');
    } catch (err) {
      console.error('Mercado Pago — no se pudo iniciar el checkout:', err);
      if (mine === generation) showMpError(errorEl, 'No se pudo cargar el formulario de pago. Recarga la página e inténtalo de nuevo.');
    }
  }

  // El pedido del servidor es una foto del carrito: si el cliente cambia cantidades o quita algo,
  // se rehace el pedido (y el Brick) para que lo que paga sea exactamente lo que ve.
  const firma = () => cartStore.getItems().map((i) => `${i.id}:${i.qty}`).join('|');
  let ultima = firma();
  let timer = null;
  cartStore.subscribe(() => {
    const f = firma();
    if (f === ultima) return;
    ultima = f;
    clearTimeout(timer);
    timer = setTimeout(startCheckout, 400);
  });

  await startCheckout();
}

async function initCheckout() {
  const btn = document.getElementById('btn-checkout');
  if (!btn) return; // solo carrito.html

  let gateway = 'none';
  try {
    const res = await fetch('/api/market', { cache: 'no-store' });
    if (res.ok) gateway = (await res.json()).gateway;
  } catch (_) { /* sin backend (mockup / local estático) */ }

  if (gateway === 'mercadopago') {
    await initPaymentGateway(btn);
    return;
  }

  // Sin pasarela activa: feedback inline honesto en vez de un checkout que no existe.
  btn.addEventListener('click', () => {
    if (cartStore.getItems().length === 0) return;
    let note = btn.parentElement.querySelector('.checkout-note');
    if (!note) {
      note = document.createElement('p');
      note.className = 'cart-summary__note checkout-note';
      btn.insertAdjacentElement('afterend', note);
    }
    note.textContent = 'Pago en línea en configuración — escríbenos por WhatsApp para coordinar tu pedido mientras tanto.';
  });
}

/* --------------------------------------------------------------------------
   Confirmación de pedido (confirmacion.html) — ?estado=pendiente para el
   flujo "en revisión" de Mercado Pago, mismo patrón que AP-J2.
   -------------------------------------------------------------------------- */
function initConfirmacionEstado() {
  const pendiente = document.getElementById('estado-pendiente');
  const aprobado = document.getElementById('estado-aprobado');
  if (!pendiente || !aprobado) return;
  const isPendiente = new URLSearchParams(window.location.search).get('estado') === 'pendiente';
  pendiente.hidden = !isPendiente;
  aprobado.hidden = isPendiente;
}

function initFooterYear() {
  setText('footer-year', String(new Date().getFullYear()));
}

/* --------------------------------------------------------------------------
   Reveals al scroll — mismo efecto/técnica que `.why-stat` de AP Beauty
   (IntersectionObserver, disparo único, respeta prefers-reduced-motion).
   A diferencia de Makeup Andrea (JS agrega `.reveal` a selectores fijos),
   acá el hook ya vive en el HTML de estas 4 páginas (`.reveal` +
   `[data-animate="stagger"]` en el contenedor padre) — este bloque solo
   observa lo que ya está marcado y togglea `.is-visible`.
   NO visible todavía: el CSS de `.reveal` sigue sin estado oculto ni
   transición ("FASE MOCKUP", style.css ~L44-48) — handoff dejado en
   inbox/css.md con el bloque exacto que necesita, mismo patrón que
   `.why-stat`/`.revealed` de AP Beauty.
   -------------------------------------------------------------------------- */
function initScrollReveals() {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.querySelectorAll('[data-animate="stagger"]').forEach((container) => {
    container.querySelectorAll(':scope > .reveal, :scope > * > .reveal').forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i, 5) * 90}ms`;
    });
  });

  const targets = document.querySelectorAll('.reveal');
  if (!targets.length) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  targets.forEach((el) => observer.observe(el));
}

/* --------------------------------------------------------------------------
   Utility bar — rotación de los mensajes (copy deck AE-F7). CSS oculta los
   inactivos (AE-C10); acá movemos .is-active. Controles opcionales por hook
   (los pone front): [data-utility-prev], [data-utility-next], [data-utility-pause]
   (aria-pressed). Auto-rotación se detiene con prefers-reduced-motion, hover/foco
   sobre la barra o pausa manual (WCAG 2.2.2). Mensaje activo anunciado con aria-live.
   -------------------------------------------------------------------------- */
function initUtilityBarRotation() {
  const messages = [...document.querySelectorAll('[data-utility-msg]')];
  if (messages.length < 2) return;
  const box = document.getElementById('utility-message');
  const bar = box ? box.closest('.utility-bar') : null;
  const btnPrev = document.querySelector('[data-utility-prev]');
  const btnNext = document.querySelector('[data-utility-next]');
  const btnPause = document.querySelector('[data-utility-pause]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (box) box.setAttribute('aria-live', 'polite');

  let index = Math.max(0, messages.findIndex((el) => el.classList.contains('is-active')));
  let paused = reduced;
  let hovering = false;

  function show(i) {
    messages[index].classList.remove('is-active');
    index = (i + messages.length) % messages.length;
    messages[index].classList.add('is-active');
  }

  if (btnPause) {
    btnPause.setAttribute('aria-pressed', String(paused));
    btnPause.addEventListener('click', () => {
      paused = !paused;
      btnPause.setAttribute('aria-pressed', String(paused));
    });
  }
  if (btnPrev) btnPrev.addEventListener('click', () => show(index - 1));
  if (btnNext) btnNext.addEventListener('click', () => show(index + 1));

  if (bar) {
    bar.addEventListener('mouseenter', () => { hovering = true; });
    bar.addEventListener('mouseleave', () => { hovering = false; });
    bar.addEventListener('focusin', () => { hovering = true; });
    bar.addEventListener('focusout', () => { hovering = false; });
  }

  if (reduced) return;
  setInterval(() => {
    if (paused || hovering || document.hidden) return;
    show(index + 1);
  }, 4500);
}

/* --------------------------------------------------------------------------
   AE-R1 · Cuenta atrás del banner de campaña. La fecha de fin vive solo en
   scripts/offer.js (OFFER.end). Escrito por front en esta copia por
   autorización de Paul (2026-11-15). Hora del cliente (mockup, sin backend).
   -------------------------------------------------------------------------- */
function initPromoCountdown() {
  // Fuente única: scripts/offer.js. Se estampa en todos los [data-countdown-end] (el valor del HTML es solo fallback sin JS).
  const els = [...document.querySelectorAll('[data-countdown-end]')];
  if (!els.length) return;
  els.forEach((el) => { el.dataset.countdownEnd = OFFER.end; el.setAttribute('datetime', OFFER.end); });
  const end = getOfferEnd();
  const pad = (n) => String(n).padStart(2, '0');
  const sets = els.map((el) => ({
    d: el.querySelector('[data-cd="d"]'), h: el.querySelector('[data-cd="h"]'),
    m: el.querySelector('[data-cd="m"]'), s: el.querySelector('[data-cd="s"]'),
  }));
  let timer = null;

  function expire() {
    if (timer) clearInterval(timer);
    const banner = document.getElementById('promo-banner');
    if (banner) banner.hidden = true;
    document.querySelectorAll('[data-offer-block]').forEach((el) => { el.hidden = true; });
    document.dispatchEvent(new CustomEvent('ae:offer-expired'));
  }

  function tick() {
    const left = end - Date.now();
    if (!Number.isFinite(left) || left <= 0) { expire(); return; }
    const s = Math.floor(left / 1000);
    sets.forEach((c) => {
      if (c.d) c.d.textContent = pad(Math.floor(s / 86400));
      if (c.h) c.h.textContent = pad(Math.floor((s % 86400) / 3600));
      if (c.m) c.m.textContent = pad(Math.floor((s % 3600) / 60));
      if (c.s) c.s.textContent = pad(s % 60);
    });
  }

  tick();
  if (Number.isFinite(end) && end > Date.now()) timer = setInterval(tick, 1000);
}

/* --------------------------------------------------------------------------
   Newsletter (footer) — sin integración de email marketing todavía (copy
   deck AE-F7). Mismo criterio que #btn-checkout: feedback inline honesto,
   nunca simular un éxito que no ocurrió.
   -------------------------------------------------------------------------- */
function initNewsletterForm() {
  const form = document.getElementById('newsletter-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let note = form.querySelector('.newsletter-note');
    if (!note) {
      note = document.createElement('p');
      note.className = 'newsletter-note';
      form.appendChild(note);
    }
    note.textContent = 'Newsletter en configuración — escríbenos por WhatsApp si querés que te avisemos del próximo live.';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initFooterYear();
  initMobileMenu();
  initCatalogDropdown();
  initCartDrawer();
  initCartRendering();
  initCartCount();
  initCartActions();
  initCarousels();
  initCatalogFilter();
  initProductPage();
  initHomePage();
  initReels();
  initUrgency();
  initMetrics();
  initPendingLinks();
  initCheckout();
  initConfirmacionEstado();
  initUtilityBarRotation();
  initPromoCountdown();
  initNewsletterForm();
  initScrollReveals();
});

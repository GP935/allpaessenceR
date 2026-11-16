// main.js — Allpa Essence (AE-J1). Contrato completo: header/menú móvil, dropdown de
// catálogo, carrito (drawer + página), carrusel genérico ×3, filtro de catálogo por
// familia, plantilla de producto por ?id=, estado de confirmación por ?estado=.
// Checkout: sin credenciales de Mercado Pago todavía (ver allpaessence.txt) — el Brick
// real se monta cuando existan, mismo patrón que AP-J2 de AP Beauty.

import { cartStore } from './scripts/cart.js';
import { OFFER, getOfferEnd, computeCartTotals } from './scripts/offer.js';

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
          node.querySelector('.cart-upsell__price').textContent = p.precioDisplay;
          const btn = node.querySelector('.add-to-cart');
          btn.dataset.id = p.id; btn.dataset.name = p.nombre; btn.dataset.price = String(p.precio); btn.dataset.image = p.imagen;
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
      // AE-R2: en la ficha el botón principal respeta el selector de cantidad (1-99)
      const qtyInput = addBtn.id === 'btn-add-to-cart' ? document.getElementById('product-qty') : null;
      const times = qtyInput ? Math.min(99, Math.max(1, parseInt(qtyInput.value, 10) || 1)) : 1;
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
      if (line) cartStore.updateQty(line.dataset.id, qtyBtn.dataset.action === 'inc' ? 1 : -1);
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
   Carrusel genérico (handoff front AE-F4) — reutilizado por trending/nuevo/
   familias. Flechas: prev/next miden un slide+gap y hacen scrollBy. Contador
   (solo familia-carousel, AE-C17 — reemplaza los dots que había antes):
   IntersectionObserver detecta el slide visible y actualiza el numerador
   "n/total"; ya no hay click-to-jump por punto, la navegación queda solo en
   las flechas. Trending/nuevo llegan con flechas [hidden] desde el HTML
   (mockup sin overflow en desktop) — un ResizeObserver las revela solo si el
   track realmente desborda el viewport.
   -------------------------------------------------------------------------- */
function setUpCarousel(root) {
  const viewport = root.querySelector('.carousel__viewport');
  const track = root.querySelector('.carousel__track');
  if (!viewport || !track) return;
  const prevBtn = root.querySelector('[data-carousel-prev]');
  const nextBtn = root.querySelector('[data-carousel-next]');
  const counter = root.querySelector('[data-carousel-counter]');
  const isPeek = root.classList.contains('carousel--peek');

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

  const slides = track.querySelectorAll('.carousel__slide');

  if (counter) {
    const currentEl = counter.querySelector('[data-carousel-counter-current]');
    const totalEl = counter.querySelector('[data-carousel-counter-total]');
    if (totalEl) totalEl.textContent = String(slides.length);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const index = Array.from(slides).indexOf(entry.target);
          if (index === -1 || !currentEl) return;
          currentEl.textContent = String(index + 1);
        });
      },
      { root: viewport, threshold: 0.6 }
    );
    slides.forEach((slide) => observer.observe(slide));
  }

  if (!isPeek && (prevBtn || nextBtn)) {
    const updateArrows = () => {
      const overflow = track.scrollWidth > viewport.clientWidth + 2;
      if (prevBtn) prevBtn.hidden = !overflow;
      if (nextBtn) nextBtn.hidden = !overflow;
    };
    updateArrows();
    new ResizeObserver(updateArrows).observe(viewport);
  }
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
    p._tok = searchTokens(`${p.nombre} ${p.ref || ''} ${(p.familiasLabel || []).join(' ')}`);
  });
}
function matchesSearch(p, qTokens) {
  if (!qTokens.length) return true;
  const hay = p._tok || [];
  return qTokens.every((q) => hay.some((t) => t.startsWith(q)));
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
  li.querySelector('.product-item__price').textContent = p.precioDisplay;
  const btn = li.querySelector('.add-to-cart');
  btn.dataset.id = p.id; btn.dataset.name = p.nombre; btn.dataset.price = String(p.precio); btn.dataset.image = p.imagen;
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

  const sorted = (list) => {
    const v = sortSel ? sortSel.value : 'destacados';
    const arr = list.map((p, i) => [p, i]);
    const rank = (p) => (p.flag === 'bestseller' ? 0 : p.flag === 'trending' ? 1 : p.nuevo ? 2 : 3);
    if (v === 'nuevos') arr.sort((a, b) => (Number(b[0].nuevo) - Number(a[0].nuevo)) || b[0].id.localeCompare(a[0].id));
    else if (v === 'precio-asc') arr.sort((a, b) => a[0].precio - b[0].precio || a[1] - b[1]);
    else if (v === 'precio-desc') arr.sort((a, b) => b[0].precio - a[0].precio || a[1] - b[1]);
    else arr.sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]);
    return arr.map((x) => x[0]);
  };

  const render = () => {
    const qTokens = searchTokens(state.q);
    const list = sorted(productos.filter((p) =>
      (!state.familia || (p.familias || [p.familia]).includes(state.familia)) &&
      (!state.genero || p.genero === state.genero) &&
      matchesSearch(p, qTokens)));
    grid.replaceChildren(...list.slice(0, state.shown).map(buildCatalogItem));
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

  const renderTamano = (isMuestra) => {
    setText('product-titulo', isMuestra ? `${producto.nombre} — Muestra` : producto.nombre);
    setText('product-precio', isMuestra ? producto.precioMuestraDisplay : producto.precioDisplay);
    if (addBtn) {
      addBtn.dataset.id = isMuestra ? `${producto.id}-muestra` : producto.id;
      addBtn.dataset.name = isMuestra ? `${producto.nombre} — Muestra` : producto.nombre;
      addBtn.dataset.price = String(isMuestra ? producto.precioMuestra : producto.precio);
      addBtn.dataset.image = producto.imagen;
    }
    // AE-R2: la barra sticky refleja nombre/precio vigentes (mismo texto que la ficha)
    setText('buy-bar-name', document.getElementById('product-titulo')?.textContent || '');
    setText('buy-bar-price', document.getElementById('product-precio')?.textContent || '');
  };

  renderTamano(initialIsMuestra);
  initProductExtras(producto, productos);

  // Copy deck AE-F7: el radio "Elige tu tamaño" reemplaza el link "Probar en muestra
  // antes" (#link-muestra) que ya no existe en el DOM — recalcula precio/id/nombre sin
  // recargar, mismo dato que antes leía de ?variant=muestra en la URL.
  const sizeOptions = document.querySelectorAll('[data-size-option]');
  const initialSize = initialIsMuestra ? 'muestra' : 'completo';
  sizeOptions.forEach((input) => {
    input.checked = input.value === initialSize;
    input.addEventListener('change', () => {
      if (input.checked) renderTamano(input.value === 'muestra');
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
  const clampQty = () => { qty.value = String(Math.min(99, Math.max(1, parseInt(qty.value, 10) || 1))); };
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
      node.querySelector('.related-card__price').textContent = p.precioDisplay;
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

async function initProductReviews(producto) {
  const lists = [...document.querySelectorAll('#reviews-list, [data-reviews-list], [data-reviews-all]')];
  const tpl = document.getElementById('review-card-tpl');
  if (!lists.length || !tpl) return;
  let items;
  try {
    const res = await fetch('data/resenas.json');
    if (!res.ok) return;
    items = await res.json();
  } catch { return; }
  if (!Array.isArray(items) || !items.length) return;

  const own = producto ? items.filter((r) => !r.productos || r.productos.includes(producto.id)) : items;
  const pool = own.length ? own : items;
  lists.forEach((list) => {
    if (list.hasAttribute('data-reviews-all')) { fillReviewList(list, tpl, items); return; }
    const offset = parseInt(list.dataset.reviewsOffset, 10) || 0;
    const count = parseInt(list.dataset.reviewsCount, 10) || 6;
    const slice = pool.slice(offset, offset + count);
    fillReviewList(list, tpl, slice.length ? slice : pool.slice(0, count));
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
    document.querySelectorAll('[data-placeholder-cifra]').forEach((el) => el.removeAttribute('data-placeholder-cifra'));
  }
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
  node.querySelector('.product-card__price').textContent = p.precioDisplay;
  const badge = node.querySelector('.product-card__badge');
  if (badgeText) { badge.textContent = badgeText; badge.hidden = false; }
  const btn = node.querySelector('.add-to-cart');
  btn.dataset.id = p.id; btn.dataset.name = p.nombre; btn.dataset.price = String(p.precio); btn.dataset.image = p.imagen;
  return node;
}

/* --------------------------------------------------------------------------
   AE-R5 · URGENCIA en perfumes (decisión de Paul 2026-11-15: "buscamos la urgencia y la
   necesidad de comprar"). Etiquetas "Quedan N unidades" / "Últimas unidades" en las tarjetas
   y "N personas viendo" + stock en la ficha, desde data/urgencia.json. Con "placeholder": true
   las cifras son de MUESTRA (se marcan data-placeholder-cifra): NO publicar así; con datos
   reales poner placeholder:false y el stock real por SKU. Si el JSON falla, no se muestra nada.
   -------------------------------------------------------------------------- */
let urgenciaCache = null;
async function loadUrgenciaOnce() {
  if (urgenciaCache !== null) return urgenciaCache;
  try {
    const res = await fetch('data/urgencia.json');
    urgenciaCache = res.ok ? await res.json() : false;
  } catch {
    urgenciaCache = false;
  }
  return urgenciaCache;
}

function stockLabel(n, data) {
  if (n <= 0) return 'Agotado';
  if (n <= (data.umbralUltimas ?? 5)) return n === 1 ? 'Última unidad' : `Últimas unidades · quedan ${n}`;
  return `Quedan ${n} unidades`;
}

async function applyStockTags(root = document) {
  const data = await loadUrgenciaOnce();
  if (!data || !data.stock) return;
  const visible = data.umbralVisible ?? 10;
  root.querySelectorAll('.product-card, .product-item').forEach((card) => {
    if (card.querySelector('.stock-tag')) return;
    const btn = card.querySelector('.add-to-cart');
    const id = btn?.dataset.id;
    const n = id ? data.stock[id] : undefined;
    if (!btn || typeof n !== 'number' || n > visible) return;
    const tag = document.createElement('p');
    tag.className = `stock-tag${n <= (data.umbralUltimas ?? 5) ? ' stock-tag--low' : ''}`;
    tag.textContent = stockLabel(n, data);
    if (data.placeholder) tag.setAttribute('data-placeholder-cifra', '');
    btn.before(tag);
  });
}

async function initUrgency() {
  await applyStockTags();
  // Ficha: slots de stock y "personas viendo"
  const stockSlot = document.querySelector('[data-stock-slot]');
  const viewersSlot = document.querySelector('[data-viewers-slot]');
  if (!stockSlot && !viewersSlot) return;
  const data = await loadUrgenciaOnce();
  if (!data) return;
  const id = new URLSearchParams(window.location.search).get('id') || document.querySelector('.product-detail')?.dataset.defaultId;
  const n = id && data.stock ? data.stock[id] : undefined;
  if (stockSlot && typeof n === 'number' && n <= (data.umbralVisible ?? 10)) {
    stockSlot.textContent = stockLabel(n, data);
    stockSlot.hidden = false;
    if (data.placeholder) stockSlot.setAttribute('data-placeholder-cifra', '');
  }
  if (viewersSlot && data.viewers) {
    const { min, max } = data.viewers;
    const v = Math.floor(min + Math.random() * (max - min + 1));
    viewersSlot.textContent = `${v} personas viendo este producto`;
    viewersSlot.hidden = false;
    if (data.placeholder) viewersSlot.setAttribute('data-placeholder-cifra', '');
  }
}
/* Destinos aún sin confirmar (data-cta-pendiente): no navegar a un 404 mientras no exista la URL real. */
function initPendingLinks() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-cta-pendiente]');
    if (link) e.preventDefault();
  });
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
      if (tab === 'favoritos') return productos.filter((p) => p.flag === 'bestseller' || p.flag === 'trending').slice(0, 4);
      return productos.filter((p) => p.genero === tab).slice(0, 4);
    };
    const renderTab = (tab) => {
      if (!track) return;
      track.replaceChildren(...pick(tab).map((p) => buildHomeCard(p, p.flag === 'bestseller' ? 'Bestseller' : p.flag === 'trending' ? 'Trending' : '')));
      applyStockTags(track);
      tabs.forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
    };
    if (track && tabs.length) {
      renderTab('favoritos');
      tabs.forEach((b) => b.addEventListener('click', () => renderTab(b.dataset.tab)));
    }

    // Recién llegados
    const nuevosGrid = document.getElementById('nuevos-grid');
    const nuevos = productos.filter((p) => p.nuevo).slice(0, 8);
    if (nuevosGrid && nuevos.length) {
      nuevosGrid.replaceChildren(...nuevos.map((p) => buildHomeCard(p, 'Nuevo')));
      applyStockTags(nuevosGrid);
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
}
/* --------------------------------------------------------------------------
   Catálogo — búsqueda ?q= (desde el buscador del home). Normaliza acentos.
   -------------------------------------------------------------------------- */
const normalizeText = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* --------------------------------------------------------------------------
   Checkout (carrito.html) — sin credenciales Mercado Pago todavía (ver
   "Pendiente de Paul" en allpaessence.txt). El Brick real (mismo patrón
   AP-J2 de AP Beauty) se monta acá cuando existan; mientras tanto, feedback
   inline en vez de redirigir a un checkout que no existe.
   -------------------------------------------------------------------------- */
function initCheckout() {
  const btn = document.getElementById('btn-checkout');
  if (!btn) return;

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
  initPendingLinks();
  initCheckout();
  initConfirmacionEstado();
  initUtilityBarRotation();
  initPromoCountdown();
  initNewsletterForm();
  initScrollReveals();
});

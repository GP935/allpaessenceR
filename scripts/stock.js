// stock.js — Stock por SKU/tamaño (AE-J5). Única fuente de disponibilidad para tarjetas, ficha y carrito.
//
// Fuentes (en orden):
//  1. GET /api/stock (mismo origen, no-store) — contrato de AP Beauty (AB-B10):
//       { "<sku>": { "disponible": N, "agotado": bool } }
//     Un SKU ausente = no controlado (sin contador ni bloqueo). 503/fallo -> se pasa a la fuente 2.
//  2. data/urgencia.json — CIFRAS DE MUESTRA mientras "placeholder" sea true (no publicar así).
//  Si ambas fallan: sin contadores y sin bloqueo (la compra nunca se bloquea por no saber el stock).
//
// Claves: se busca primero el id exacto del artículo (p. ej. "ae-001-50ml") y luego el SKU base
// ("ae-001", id de 30 ml). Así hay stock por tamaño cuando el dato lo trae, y por SKU base si no.
// Las muestras ("-muestra") no están controladas.

const DEFAULTS = { umbralVisible: 10, umbralUltimas: 5 };
let state = null; // { map, placeholder, meta, source }
let inflight = null;

export function baseId(id) {
  return String(id || '').replace(/-(\d+ml|muestra)$/i, '');
}

function normalizeApi(json) {
  const map = {};
  Object.keys(json || {}).forEach((sku) => {
    const v = json[sku];
    if (typeof v === 'number') map[sku] = v;
    else if (v && typeof v === 'object') map[sku] = v.agotado ? 0 : Number(v.disponible);
  });
  return map;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function load() {
  let meta = { ...DEFAULTS };
  let mock = null;
  try { mock = await fetchJson('data/urgencia.json'); } catch { mock = null; }
  if (mock) meta = { ...meta, ...mock };
  try {
    const api = await fetchJson('/api/stock');
    if (api && typeof api === 'object' && !Array.isArray(api)) {
      return { map: normalizeApi(api), placeholder: false, meta, source: 'api' };
    }
  } catch { /* sin backend: cae al JSON */ }
  if (mock && mock.stock) return { map: mock.stock, placeholder: !!mock.placeholder, meta, source: 'json' };
  return null;
}

export function loadStock(force = false) {
  if (force) { state = null; inflight = null; }
  if (state) return Promise.resolve(state);
  if (!inflight) {
    inflight = load().then((s) => {
      state = s || { map: {}, placeholder: false, meta: { ...DEFAULTS }, source: 'none' };
      return state;
    });
  }
  return inflight;
}

// undefined = no controlado. Síncrono: devuelve undefined hasta que loadStock() haya resuelto.
export function availableFor(id) {
  if (!state || /-muestra$/i.test(id)) return undefined;
  const m = state.map;
  const v = Object.prototype.hasOwnProperty.call(m, id) ? m[id] : m[baseId(id)];
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : undefined;
}

export function stockLabel(n) {
  const meta = state ? state.meta : DEFAULTS;
  if (n <= 0) return 'Agotado';
  if (n <= meta.umbralUltimas) return n === 1 ? 'Última unidad' : `Últimas unidades · quedan ${n}`;
  return `Quedan ${n} unidades`;
}

export function isLowEnoughToShow(n) {
  const meta = state ? state.meta : DEFAULTS;
  return n <= meta.umbralVisible;
}

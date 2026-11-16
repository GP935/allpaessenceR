// offer.js — Oferta "3 por S/ 99" (AE-R3). Única fuente de la regla y de la fecha de fin.
// Supuestos pendientes de confirmar con Paul: aplica a ids ae-NN (no muestras ni skincare);
// en cada grupo entran las unidades más caras; solo vive mientras corre la cuenta atrás.
// Cálculo SOLO de presentación: el cobro real lo valida el backend.

export const OFFER = {
  qty: 3,
  price: 99,
  was: 150,
  end: '2026-11-18T23:59:59-05:00',
};

const ELIGIBLE_ID = /^ae-\d+$/;

export function getOfferEnd() {
  return Date.parse(OFFER.end);
}

export function isOfferActive(now = Date.now()) {
  const end = getOfferEnd();
  return Number.isFinite(end) && now < end;
}

export function isOfferEligible(item) {
  return ELIGIBLE_ID.test(item.id);
}

export function computeCartTotals(items, now = Date.now()) {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const prices = [];
  items.filter(isOfferEligible).forEach((i) => {
    for (let n = 0; n < i.qty; n += 1) prices.push(i.price);
  });
  prices.sort((a, b) => b - a);
  const active = isOfferActive(now);
  const groups = active ? Math.floor(prices.length / OFFER.qty) : 0;
  const bundled = prices.slice(0, groups * OFFER.qty).reduce((s, p) => s + p, 0);
  const discount = Math.max(0, bundled - groups * OFFER.price);
  return { subtotal, discount, total: subtotal - discount, eligible: prices.length, groups, active };
}

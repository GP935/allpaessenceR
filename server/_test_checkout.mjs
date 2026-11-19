// Test de integración — backend de pagos Allpa Essence (MP mockeado vía globalThis.fetch).
//   node server/_test_checkout.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = 3479;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'secreto-de-prueba';
const realFetch = globalThis.fetch.bind(globalThis);

let lastMP = null;
const mpCalls = [];
let mpStatus = 'approved';
let mpRechazaExtra = false;
let paymentGet = null; // respuesta de GET /v1/payments/:id (webhook)
const logs = [];
for (const k of ['log', 'info', 'warn', 'error']) {
  const orig = console[k];
  console[k] = (...a) => { logs.push(a.join(' ')); if (k === 'error' && process.env.DEBUG_TEST) orig(...a); };
}

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith(BASE)) return realFetch(url, opts);
  if (u.endsWith('/v1/payments') && opts.method === 'POST') {
    lastMP = { headers: opts.headers || {}, body: JSON.parse(opts.body || '{}') };
    mpCalls.push(lastMP);
    if (mpRechazaExtra && lastMP.body.additional_info) {
      return new Response(JSON.stringify({ message: 'invalid additional_info', status: 400, cause: [{ code: 4012, description: 'x' }] }), { status: 400 });
    }
    return new Response(JSON.stringify({
      id: 900100 + mpCalls.length, status: mpStatus,
      status_detail: mpStatus === 'approved' ? 'accredited' : 'cc_rejected_high_risk',
      payer: { email: 'x@example.com' },
    }), { status: 201 });
  }
  if (u.includes('/v1/payments/')) return new Response(JSON.stringify(paymentGet), { status: 200 });
  throw new Error(`fetch no mockeado: ${u}`);
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'allpa-test-'));
process.env.CHECKOUT_GATEWAY = 'mercadopago';
process.env.MP_ACCESS_TOKEN = 'TEST-token-falso-no-loguear';
process.env.MP_WEBHOOK_SECRET = SECRET;
process.env.PORT = String(PORT);
process.env.LOGS_DIR = tmp;
process.env.MP_RATE_LIMIT = '1000';

const srv = await import(new URL('./server.js', import.meta.url).href);
const offer = await import(pathToFileURL(path.resolve(import.meta.dirname, '..', 'scripts', 'offer.js')).href);
await new Promise((r) => setTimeout(r, 300));

let pass = 0;
const check = (c, m) => { assert.ok(c, m); process.stdout.write(`  ok  ${m}\n`); pass++; };
const post = async (url, body, headers = {}) => {
  const r = await realFetch(BASE + url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { http: r.status, data: await r.json().catch(() => ({})) };
};
const SHIPPING = {
  name: 'María Pérez López', phone: '987 654 321',
  address: { line: 'Av. Pardo 123', reference: 'Dpto 4', district: 'Miraflores', province: 'Lima', department: 'Lima', zip: '15074', country: 'PE' },
};
const crear = (items) => post('/api/mp/create-order', { items });
const pagar = (orderId, extra = {}) => post('/api/mp/process-payment', {
  orderId, token: 'tok_secreto', issuer_id: '1', payment_method_id: 'visa',
  payer: { email: 'clienta@example.com', identification: { type: 'DNI', number: '12345678' } },
  shipping: SHIPPING, device_id: 'armor.abc', ...extra,
});
const ofertaVigente = Date.now() < Date.parse('2026-11-30T23:59:59-05:00');

{ // 1 — precios del catálogo del servidor
  const a = await crear([{ id: 'ae-001', quantity: 1 }]);
  check(a.http === 200 && a.data.amount === 45, '30 ml = S/ 45 desde data/productos.json');
  const b = await crear([{ id: 'ae-001-50ml', quantity: 1 }]);
  check(b.data.amount === 65, '50 ml = S/ 65');
  const c = await crear([{ id: 'ae-001-100ml', quantity: 2 }]);
  check(c.data.amount === 190, '100 ml ×2 = S/ 190');
  const h = await post('/api/mp/create-order', { items: [{ id: 'ae-001', quantity: 1, price: 0.01, unit_price: 0.01 }], total: 1, amount: 1 });
  check(h.data.amount === 45, 'body hostil (price/total/amount) ignorado: sigue S/ 45');
}
{ // 1b — muestras: precio fijo del servidor, sin oferta
  const m5 = await crear([{ id: 'ae-001-muestra-5ml', quantity: 2 }]);
  check(m5.http === 200 && m5.data.amount === 30, 'muestra 5 ml ×2 = S/ 30');
  const m10 = await crear([{ id: 'ae-001-muestra-10ml', quantity: 1 }]);
  check(m10.data.amount === 25, 'muestra 10 ml = S/ 25');
  const mix = await crear([{ id: 'ae-001', quantity: 2 }, { id: 'ae-002-muestra-5ml', quantity: 3 }]);
  check(mix.data.amount === 90 + 45, '2 × 30 ml + 3 muestras 5 ml: las muestras no entran en la oferta 3×99');
}
{ // 2 — rechazos de entrada
  check((await crear([{ id: 'ae-001-muestra', quantity: 1 }])).http === 400, 'id viejo de muestra sin tamaño → 400');
  check((await crear([{ id: 'ae-001-muestra-7ml', quantity: 1 }])).http === 400, 'muestra de tamaño inexistente → 400');
  check((await crear([{ id: 'ae-9999-muestra-5ml', quantity: 1 }])).http === 400, 'muestra de producto inexistente → 400');
  check((await crear([{ id: 'ae-9999', quantity: 1 }])).http === 400, 'id inexistente → 400');
  check((await crear([{ id: 'ae-001', quantity: 0 }])).http === 400, 'cantidad 0 → 400');
  check((await crear([{ id: 'ae-001', quantity: 100 }])).http === 400, 'cantidad 100 → 400');
  check((await crear([])).http === 400, 'carrito vacío → 400');
  check((await crear([{ id: 'ae-001-30ml', quantity: 1 }])).http === 400, 'formato de id no canónico → 400');
}
{ // 3 — oferta 3 por S/ 99 en el servidor
  const t = await crear([{ id: 'ae-001', quantity: 3 }]);
  check(t.data.amount === (ofertaVigente ? 99 : 135), `3 × 30 ml → ${ofertaVigente ? 'S/ 99 (oferta vigente)' : 'S/ 135 (oferta vencida)'}`);
  const m = await crear([{ id: 'ae-001', quantity: 2 }, { id: 'ae-002', quantity: 1 }, { id: 'ae-003-50ml', quantity: 1 }]);
  check(m.data.amount === (ofertaVigente ? 99 + 65 : 135 + 65), '3 de 30 ml + 1 de 50 ml: la de 50 ml no entra en la oferta');
}
{ // 4 — paridad con scripts/offer.js (lo que ve el cliente == lo que cobra el servidor)
  const antes = Date.parse('2026-11-17T12:00:00-05:00');
  const despues = Date.parse('2026-12-01T00:30:00-05:00');
  const catalogo = [['ae-001', 45, 30], ['ae-001-50ml', 65, 50], ['ae-001-100ml', 95, 100]];
  let comparados = 0;
  for (let i = 0; i < 300; i++) {
    const lineas = []; const front = [];
    const n = 1 + Math.floor(Math.random() * 4);
    const usados = new Set();
    for (let k = 0; k < n; k++) {
      const [id, p, ml] = catalogo[Math.floor(Math.random() * 3)];
      if (usados.has(id)) continue; usados.add(id);
      const q = 1 + Math.floor(Math.random() * 5);
      lineas.push({ id, ml, price: p * 100, cantidad: q });
      front.push({ id, price: p, qty: q });
    }
    for (const now of [antes, despues]) {
      const s = srv.calcularTotales(lineas, now);
      const f = offer.computeCartTotals(front, now);
      assert.equal(s.total / 100, f.total, `total ${JSON.stringify(front)} @${now}`);
      assert.equal(s.descuento / 100, f.discount, 'descuento');
      comparados++;
    }
  }
  check(comparados >= 300, `servidor == scripts/offer.js en ${comparados} carritos aleatorios (antes y después del fin)`);
}
let ordenOk;
{ // 5 — payload completo a MP
  const o = await crear([{ id: 'ae-001', quantity: 1 }, { id: 'ae-002-50ml', quantity: 2 }]);
  const r = await pagar(o.data.orderId, { transaction_amount: 0.01, amount: 0.01 });
  const b = lastMP.body;
  check(r.http === 200 && r.data.status === 'approved' && r.data.status_detail === 'accredited', 'process-payment → approved/accredited con status_detail');
  check(b.transaction_amount === o.data.amount && b.transaction_amount !== 0.01, 'transaction_amount sale del pedido, no del body');
  check(b.statement_descriptor === 'ALLPAESSENCE', 'statement_descriptor');
  check(b.external_reference === o.data.orderId && b.installments === 1, 'external_reference = orderId, installments 1');
  check(b.payer.email === 'clienta@example.com' && b.payer.first_name === 'María' && b.payer.last_name === 'Pérez López', 'payer.email + first/last_name');
  check(b.payer.identification.type === 'DNI' && b.payer.identification.number === '12345678', 'payer.identification (DNI)');
  const it = b.additional_info.items;
  check(it.length === 2 && it.every((x) => x.id && x.title && x.description && x.category_id === 'fashion' && x.quantity >= 1 && x.unit_price > 0), 'additional_info.items: id, title, description, category_id, quantity, unit_price');
  check(it[1].unit_price === 65 && it[1].quantity === 2, 'unit_price del catálogo (50 ml = 65)');
  check(b.additional_info.payer.first_name === 'María' && b.additional_info.payer.phone.number === '987654321', 'additional_info.payer: nombre + teléfono');
  const ra = b.additional_info.shipments.receiver_address;
  check(ra.street_name === 'Av. Pardo' && ra.street_number === '123' && ra.zip_code === '15074' && ra.city_name === 'Lima' && ra.state_name === 'Lima', 'additional_info.shipments.receiver_address');
  check(hdr(lastMP.headers, 'x-meli-session-id') === 'armor.abc', 'header X-meli-session-id = device_id');
  check(!!hdr(lastMP.headers, 'x-idempotency-key'), 'header X-Idempotency-Key');
  check(!JSON.stringify(b).includes('Carolina') && !JSON.stringify(b).includes('Herrera'), 'el payload no filtra la fragancia original (campo ref)');
  ordenOk = o.data.orderId;
}
{ // 6 — validaciones del pago
  const o = await crear([{ id: 'ae-001', quantity: 1 }]);
  const r = await pagar(o.data.orderId, { shipping: { ...SHIPPING, name: 'María' } });
  check(r.http === 400 && r.data.field === 'shipping.name', 'nombre sin apellido → 400 shipping.name (sin tocar el pedido)');
  const ok = await pagar(o.data.orderId);
  check(ok.http === 200 && ok.data.status === 'approved', 'el mismo pedido se paga tras corregir el nombre');
  const dup = await pagar(o.data.orderId);
  check(dup.http === 409, 'pedido ya pagado → 409 (no se cobra dos veces)');
  check((await pagar('no-existe')).http === 400, 'orderId inexistente → 400');
  const o2 = await crear([{ id: 'ae-001', quantity: 1 }]);
  check((await post('/api/mp/process-payment', { orderId: o2.data.orderId, shipping: SHIPPING })).http === 400, 'sin token de tarjeta → 400');
}
{ // 7 — rechazo + reintentos (máx. 3) + fallback de 400
  mpStatus = 'rejected';
  const o = await crear([{ id: 'ae-001', quantity: 1 }]);
  const r1 = await pagar(o.data.orderId);
  check(r1.data.status === 'rejected' && r1.data.status_detail === 'cc_rejected_high_risk', 'rechazo devuelve status_detail');
  const k1 = hdr(lastMP.headers, 'x-idempotency-key');
  await pagar(o.data.orderId);
  const k2 = hdr(lastMP.headers, 'x-idempotency-key');
  check(k1 !== k2, 'clave de idempotencia distinta por intento');
  await pagar(o.data.orderId);
  const r4 = await pagar(o.data.orderId);
  check(r4.http === 409, 'el 4º intento → 409 con mensaje claro');
  mpStatus = 'approved';
  mpRechazaExtra = true;
  const o3 = await crear([{ id: 'ae-001', quantity: 1 }]);
  mpCalls.length = 0;
  const f = await pagar(o3.data.orderId);
  check(f.data.status === 'approved' && mpCalls.length === 2 && !mpCalls[1].body.additional_info && !mpCalls[1].body.payer.first_name, 'MP 400 → un reintento con payload mínimo');
  check(mpCalls[1].body.statement_descriptor === 'ALLPAESSENCE' && hdr(mpCalls[1].headers, 'x-meli-session-id') === 'armor.abc', 'el mínimo conserva descriptor y Device ID');
  mpRechazaExtra = false;
}
{ // 8 — webhook
  const firmar = (id, secret = SECRET, requestId = 'req-1') => {
    const ts = String(Date.now());
    const v1 = crypto.createHmac('sha256', secret).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex');
    return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId };
  };
  const hook = (id, notif, headers) => realFetch(`${BASE}/api/mp/webhook?data.id=${id}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ id: notif, type: 'payment', action: 'payment.updated', data: { id } }),
  });

  const o = await crear([{ id: 'ae-001', quantity: 1 }]);
  check((await hook(777, 'n-0', { 'x-signature': 'ts=1,v1=00', 'x-request-id': 'r' })).status === 400, 'firma inválida → 400');
  check((await hook(777, 'n-0b', firmar(777, 'otro-secreto'))).status === 400, 'firma con otro secreto → 400');
  check((await realFetch(`${BASE}/api/mp/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status === 400, 'sin firma → 400');

  paymentGet = { id: 777, status: 'approved', external_reference: o.data.orderId, transaction_amount: 0.5 };
  const mm = await (await hook(777, 'n-1', firmar(777))).json();
  check(mm.mismatch === true, 'importe distinto al del servidor → no se confirma');
  const st = await post('/api/mp/process-payment', { orderId: o.data.orderId, token: 't', shipping: SHIPPING, device_id: 'd' });
  check(st.http === 200, 'el pedido no quedó pagado por el webhook con importe falso (sigue pendiente)');

  const o2 = await crear([{ id: 'ae-005', quantity: 1 }]);
  paymentGet = { id: 778, status: 'approved', external_reference: o2.data.orderId, transaction_amount: o2.data.amount };
  const ok1 = await (await hook(778, 'n-2', firmar(778))).json();
  check(ok1.received === true && !ok1.duplicate, 'webhook válido y con importe correcto → aceptado');
  const dup = await (await hook(778, 'n-2', firmar(778))).json();
  check(dup.duplicate === true, 'misma notificación repetida → idempotente');
  await new Promise((r) => setTimeout(r, 150));
  const ventas = fs.readFileSync(path.join(tmp, 'ventas.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  check(ventas.filter((v) => v.paymentId === 778).length === 1, 'la venta se registra UNA vez por payment_id');
  check(ventas.every((v) => v.total > 0 && v.items.length >= 1), 'ventas.jsonl: cada línea con total e ítems');
}
{ // 9 — secretos
  const todo = logs.join('\n');
  check(!todo.includes('TEST-token-falso-no-loguear') && !todo.includes('tok_secreto') && !todo.includes(SECRET), 'ni el access token, ni el token de tarjeta, ni el secreto del webhook aparecen en logs');
  const m = await (await realFetch(`${BASE}/api/market`)).json();
  check(m.gateway === 'mercadopago' && m.currency === 'PEN', '/api/market → mercadopago / PEN');
}

function hdr(h, n) { return Object.entries(h).find(([k]) => k.toLowerCase() === n.toLowerCase())?.[1]; }
console.log(`\n${pass}/${pass} PASS`);
process.stdout.write(`\n${pass} PASS\n`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(0);

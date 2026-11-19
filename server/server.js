// Backend de pagos — Allpa Essence. Mercado Pago Card Payment Brick, moneda PEN.
// Mismo contrato y mismas invariantes que otro proyecto:
//   1. Precios SIEMPRE del catálogo del servidor (data/productos.json), nunca del cliente.
//   2. Webhook validado con HMAC-SHA256 (x-signature) ANTES de tocar datos.
//   3. Webhook idempotente (por id de notificación; post-pago una vez por payment_id).
//   4. transaction_amount del pago == total calculado en servidor (tolerancia 0.01).
//   5. Un pedido se confirma SOLO por webhook o por la respuesta servidor→servidor de MP.
//   6. Secretos solo de process.env; nunca se loguean.
import express from 'express';
import crypto from 'crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const {
  CHECKOUT_GATEWAY = 'none',
  MP_ACCESS_TOKEN,
  MP_WEBHOOK_SECRET,
  PUBLIC_BASE_URL = 'https://allpaessence.com',
  PORT = 3000,
  THREEDS_ENABLED = '0', // '1' → 3DS 2.0 (three_d_secure_mode optional) en process-payment
  LOGS_DIR,
  CATALOGO_FILE,
} = process.env;

const AQUI = dirname(fileURLToPath(import.meta.url));
const GATEWAY = ['none', 'mercadopago'].includes(CHECKOUT_GATEWAY) ? CHECKOUT_GATEWAY : 'none';
const MONEDA = 'PEN';

console.log(`Pasarela activa (CHECKOUT_GATEWAY): ${GATEWAY}`);
if (GATEWAY === 'mercadopago' && !MP_ACCESS_TOKEN) {
  console.error('CHECKOUT_GATEWAY=mercadopago pero falta MP_ACCESS_TOKEN. Abortando.');
  process.exit(1);
}
if (GATEWAY === 'mercadopago' && !MP_WEBHOOK_SECRET) {
  console.warn('AVISO: MP_WEBHOOK_SECRET no configurado — el webhook rechazará TODA notificación.');
}

// ─────────────────────────────────────────────────────────────
// CATÁLOGO — fuente de verdad: data/productos.json (el mismo que pinta el sitio).
// Ids de carrito: `ae-001` (30 ml), `ae-001-50ml`, `ae-001-100ml`. La muestra
// (`ae-001-muestra`) no tiene precio definido todavía → se rechaza.
// El precio sale de `tamanos[ml].precio` (soles) y se maneja en CÉNTIMOS enteros.
// ─────────────────────────────────────────────────────────────
const productos = JSON.parse(readFileSync(CATALOGO_FILE || resolve(AQUI, '..', 'data', 'productos.json'), 'utf8'));
const CATALOGO = new Map(productos.map((p) => [p.id, p]));
const ID_RE = /^(ae-\d{1,4})(?:-(50|100)ml)?$/;

function resolverItem(rawId) {
  const m = ID_RE.exec(String(rawId || ''));
  if (!m) return null;
  const producto = CATALOGO.get(m[1]);
  if (!producto) return null;
  const ml = m[2] ? Number(m[2]) : 30;
  const tam = (producto.tamanos || []).find((t) => t.ml === ml);
  const cents = tam ? Math.round(Number(tam.precio) * 100) : NaN;
  if (!Number.isInteger(cents) || cents <= 0) return null;
  return {
    id: m[2] ? `${producto.id}-${ml}ml` : producto.id,
    ml,
    title: `${producto.nombre} · ${ml} ml`,
    description: `${producto.nombre} ${ml} ml — ${producto.desc || 'Fragancia'}`,
    price: cents,
  };
}

// ─────────────────────────────────────────────────────────────
// OFERTA "3 por S/ 99" — misma regla que `scripts/offer.js` del frontend (que solo
// la PINTA). Aquí se calcula el cobro real. Aplica solo a 30 ml (ids `ae-NNN`),
// las unidades más caras primero, y solo hasta la fecha de fin. Un test compara
// ambas implementaciones (`_test_checkout.mjs`). DEUDA: una única fuente de datos.
// ─────────────────────────────────────────────────────────────
const OFERTA = { qty: 3, price: 9900, end: Date.parse('2026-11-18T23:59:59-05:00') };

export function calcularTotales(lineas, ahora = Date.now()) {
  const subtotal = lineas.reduce((s, l) => s + l.price * l.cantidad, 0);
  const elegibles = [];
  for (const l of lineas) {
    if (l.ml === 30) for (let n = 0; n < l.cantidad; n += 1) elegibles.push(l.price);
  }
  elegibles.sort((a, b) => b - a);
  const activa = Number.isFinite(OFERTA.end) && ahora < OFERTA.end;
  const grupos = activa ? Math.floor(elegibles.length / OFERTA.qty) : 0;
  const agrupado = elegibles.slice(0, grupos * OFERTA.qty).reduce((s, p) => s + p, 0);
  const descuento = Math.max(0, agrupado - grupos * OFERTA.price);
  return { subtotal, descuento, total: subtotal - descuento };
}

// Pedidos en memoria (idempotencia + verificación de importe). DEUDA CONOCIDA: por
// proceso → PM2 en modo fork con `instances: 1` hasta migrar a DB/KV.
const pedidosMP = new Map(); // orderId → { amountExpected, estado, items, paymentId, intentos, shipping, creado }
const notificacionesMP = new Set();
const pagosRegistrados = new Set(); // payment_id ya escrito en el log de ventas
const MAX_INTENTOS_PAGO = 3;
const TTL_PEDIDO_MS = 2 * 60 * 60 * 1000;

setInterval(() => {
  const limite = Date.now() - TTL_PEDIDO_MS;
  for (const [id, p] of pedidosMP) {
    if (p.estado !== 'pagado' && p.creado < limite) pedidosMP.delete(id);
  }
}, 10 * 60 * 1000).unref();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Cloudflare → Nginx: req.ip real para el rate-limit
app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use(express.json({ limit: '10kb' }));

function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || 'desconocida';
    const e = hits.get(ip);
    if (!e || now > e.reset) {
      hits.set(ip, { count: 1, reset: now + windowMs });
      return next();
    }
    if (e.count >= max) return res.status(429).json({ error: 'demasiadas peticiones, prueba en un momento' });
    e.count += 1;
    return next();
  };
}
const mpLimiter = rateLimit({ windowMs: 60_000, max: Number(process.env.MP_RATE_LIMIT) || 20 });

// GET /api/market — el frontend decide con esto si monta el Brick o mantiene el modo mockup.
app.get('/api/market', (_req, res) => res.json({ gateway: GATEWAY, currency: MONEDA }));

// ─────────────────────────────────────────────────────────────
// POST /api/mp/create-order   Body: { items: [{ id, quantity }] }
// Respuesta: { orderId, amount, subtotal, discount } (soles) — `amount` alimenta el Brick.
// ─────────────────────────────────────────────────────────────
app.post('/api/mp/create-order', mpLimiter, (req, res) => {
  if (GATEWAY !== 'mercadopago') return res.status(503).json({ error: 'checkout no disponible todavía' });

  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0 || items.length > 60) {
    return res.status(400).json({ error: 'carrito vacío o inválido' });
  }

  const porId = new Map();
  for (const item of items) {
    const q = item?.quantity;
    const cantidad = typeof q === 'number' ? q : (typeof q === 'string' && /^\d{1,3}$/.test(q) ? Number(q) : NaN);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99) {
      return res.status(400).json({ error: `cantidad inválida para ${cap(item?.id, 40)}` });
    }
    const linea = resolverItem(item?.id);
    if (!linea) return res.status(400).json({ error: `producto no disponible: ${cap(item?.id, 40)}` });
    const previa = porId.get(linea.id);
    if (previa) previa.cantidad += cantidad;
    else porId.set(linea.id, { ...linea, cantidad });
  }
  const lineas = [...porId.values()];
  if (lineas.some((l) => l.cantidad > 99)) return res.status(400).json({ error: 'cantidad inválida' });

  const { subtotal, descuento, total } = calcularTotales(lineas);
  const orderId = crypto.randomUUID();
  pedidosMP.set(orderId, {
    amountExpected: total / 100, estado: 'pendiente', items: lineas, paymentId: null, intentos: 0, creado: Date.now(),
  });
  return res.json({ orderId, amount: total / 100, subtotal: subtotal / 100, discount: descuento / 100 });
});

// ─────────────────────────────────────────────────────────────
// Sanitizado de lo que manda el cliente (nunca se confía en el body).
// ─────────────────────────────────────────────────────────────
const cap = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const dedupNumero = (l) => l.replace(/(^|\s)(N?[°º.]{0,2}\d{1,6}[A-Za-z]?)\s+\2$/i, '$1$2');
const EMAIL_RE = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,255}\.[A-Za-z]{2,24}$/;
const CATEGORIA_MP = 'fashion'; // MP no tiene "perfumería"; fashion es la más cercana
const DESCRIPTOR_TARJETA = 'ALLPAESSENCE'; // aparece en el resumen de la tarjeta (máx. 22)

function sanearShipping(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw.address && typeof raw.address === 'object' ? raw.address : {};
  const envio = {
    name: cap(raw.name, 120),
    phone: cap(raw.phone, 20),
    line: dedupNumero(cap(a.line, 160)),
    reference: cap(a.reference, 160),
    district: cap(a.district, 60),
    province: cap(a.province, 60),
    department: cap(a.department, 60),
    zip: cap(a.zip, 12),
    country: /^[A-Za-z]{2}$/.test(String(a.country || '')) ? String(a.country).toUpperCase() : 'PE',
  };
  if (!envio.name || !envio.line || !envio.district) return null;
  return envio;
}

function partirNombre(nombre) {
  const p = cap(nombre, 120).split(/\s+/).filter(Boolean);
  if (p.length <= 1) return { first_name: p[0] || '', last_name: '' };
  if (p.length === 2 || p.length === 3) return { first_name: p[0], last_name: p.slice(1).join(' ') };
  return { first_name: p.slice(0, 2).join(' '), last_name: p.slice(2).join(' ') };
}

// "Av. Pardo 123" → { street_name: "Av. Pardo", street_number: "123" }; sin número claro → solo street_name.
function partirCalle(line) {
  const l = cap(line, 160);
  const principal = l.split(/,|\s(?=(?:dpto|depto|int|interior|of|oficina|piso)\b)/i)[0].trim();
  const m = principal.match(/^(.+?)\s+(?:N[°º.]{0,2}\s*)?(\d{1,6})[A-Za-z]?$/i);
  if (!m || /\b(?:mz|mza|manzana|lt|lote)\.?$/i.test(m[1])) return { street_name: l };
  return { street_name: m[1].trim(), street_number: m[2] };
}

function construirPayloadMP({ pedido, orderId, token, issuer_id, payment_method_id, payer, envio }) {
  const email = EMAIL_RE.test(cap(payer?.email, 254)) ? cap(payer.email, 254) : undefined;
  const nombre = envio ? partirNombre(envio.name) : { first_name: '', last_name: '' };
  const telefono = envio?.phone ? envio.phone.replace(/[^\d+]/g, '') : '';
  const ident = payer?.identification;
  const identification = ident?.number && /^[\w-]{5,20}$/.test(String(ident.number))
    ? {
        type: ['DNI', 'CE', 'RUC', 'PAS'].includes(String(ident.type).toUpperCase()) ? String(ident.type).toUpperCase() : 'DNI',
        number: String(ident.number),
      }
    : undefined;

  // Datos del producto: todo sale del pedido (catálogo del servidor), nunca del body.
  const items = pedido.items.map((i) => ({
    id: i.id,
    title: i.title,
    description: i.description,
    category_id: CATEGORIA_MP,
    quantity: i.cantidad,
    unit_price: i.price / 100,
  }));

  const ap = { items };
  if (nombre.first_name || telefono) {
    ap.payer = {
      ...(nombre.first_name ? { first_name: nombre.first_name } : {}),
      ...(nombre.last_name ? { last_name: nombre.last_name } : {}),
      ...(telefono ? { phone: { number: telefono } } : {}),
    };
  }
  if (envio?.line) {
    ap.shipments = {
      receiver_address: {
        ...partirCalle(envio.line),
        ...(envio.zip ? { zip_code: envio.zip } : {}),
        ...(envio.province ? { city_name: envio.province } : {}),
        ...(envio.department ? { state_name: envio.department } : {}),
      },
    };
  }

  return {
    token,
    issuer_id,
    payment_method_id,
    installments: 1,
    transaction_amount: pedido.amountExpected, // Invariante 1/4: del servidor
    description: items.map((i) => `${i.id}x${i.quantity}`).join(', '),
    external_reference: orderId,
    statement_descriptor: DESCRIPTOR_TARJETA,
    ...(envio ? { metadata: shippingParaMetadata(envio) } : {}),
    additional_info: ap,
    ...(THREEDS_ENABLED === '1' ? { three_d_secure_mode: 'optional' } : {}),
    payer: {
      email,
      ...(nombre.first_name ? { first_name: nombre.first_name } : {}),
      ...(nombre.last_name ? { last_name: nombre.last_name } : {}),
      ...(identification ? { identification } : {}),
    },
  };
}

function shippingParaMetadata(envio) {
  return {
    ship_name: envio.name, ship_phone: envio.phone, ship_line: envio.line, ship_reference: envio.reference,
    ship_district: envio.district, ship_province: envio.province, ship_department: envio.department,
    ship_zip: envio.zip, ship_country: envio.country,
  };
}

// Si MP rechaza con 400 los datos extra, UN reintento sin additional_info ni nombre.
function payloadMinimoMP(full) {
  const { additional_info: _ai, three_d_secure_mode: _3ds, ...resto } = full;
  const { first_name: _f, last_name: _l, ...payer } = full.payer;
  return { ...resto, payer };
}

// ─────────────────────────────────────────────────────────────
// Registro de ventas: sin correo transaccional todavía, el log es lo único (junto
// con el panel de MP) que guarda a dónde enviar cada pedido. Una línea por pago
// aprobado, idempotente por payment_id.
// ─────────────────────────────────────────────────────────────
async function registrarVenta(orderId, pedido, payment) {
  if (pagosRegistrados.has(payment.id)) return;
  pagosRegistrados.add(payment.id);
  try {
    const dir = LOGS_DIR || resolve(AQUI, 'logs');
    await mkdir(dir, { recursive: true });
    const linea = {
      fecha: new Date().toISOString(),
      orderId,
      paymentId: payment.id,
      total: pedido.amountExpected,
      items: pedido.items.map((i) => ({ id: i.id, title: i.title, cantidad: i.cantidad, precio: i.price / 100 })),
      email: pedido.payerEmail || payment.payer?.email || null,
      envio: pedido.shipping || null,
    };
    await appendFile(resolve(dir, 'ventas.jsonl'), `${JSON.stringify(linea)}\n`);
    console.info(`VENTA ${orderId} payment=${payment.id} total=${pedido.amountExpected} ${MONEDA} → registrada`);
  } catch (err) {
    pagosRegistrados.delete(payment.id);
    console.error(`No se pudo registrar la venta ${orderId}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/mp/process-payment — onSubmit del Card Payment Brick.
// Body: { orderId, token, issuer_id, payment_method_id, payer:{email,identification}, shipping, device_id }
// Respuesta: { status, status_detail, id }
// ─────────────────────────────────────────────────────────────
app.post('/api/mp/process-payment', mpLimiter, async (req, res) => {
  if (GATEWAY !== 'mercadopago' || !MP_ACCESS_TOKEN) {
    return res.status(503).json({ error: 'checkout no disponible todavía' });
  }
  try {
    const { orderId, token, issuer_id, payment_method_id, payer, shipping, device_id } = req.body || {};
    const pedido = pedidosMP.get(orderId);
    if (!pedido) return res.status(400).json({ error: 'pedido no encontrado o expirado' });

    // Un pago rechazado no cobró nada: se puede reintentar con otra tarjeta (máx. 3).
    if (pedido.estado === 'rechazado' && pedido.intentos < MAX_INTENTOS_PAGO) pedido.estado = 'pendiente';
    if (pedido.estado === 'rechazado') {
      return res.status(409).json({ error: 'Superaste los intentos de pago de este pedido. Preparamos un pago nuevo: vuelve a introducir los datos de tu tarjeta.' });
    }
    if (pedido.estado !== 'pendiente') return res.status(409).json({ error: 'pedido ya procesado' });

    if (!token || typeof token !== 'string') return res.status(400).json({ error: 'token de tarjeta ausente' });
    if (payer?.email) pedido.payerEmail = cap(payer.email, 254);

    const envio = sanearShipping(shipping);
    // MP puntúa más riesgo a un comprador con nombre incompleto: se exige nombre y apellido.
    if (envio && envio.name.split(/\s+/).filter(Boolean).length < 2) {
      return res.status(400).json({ error: 'Escribe tu nombre y apellido', field: 'shipping.name' });
    }
    if (envio) pedido.shipping = envio;

    // Device ID: lo recoge el SDK de MP en el navegador y se reenvía como X-meli-session-id.
    const deviceId = /^[\w.\-]{1,300}$/.test(String(device_id || '')) ? String(device_id) : '';
    if (!deviceId) console.warn(`process-payment ${orderId}: sin device_id — riesgo de rechazo antifraude de MP.`);

    const payloadMP = construirPayloadMP({ pedido, orderId, token, issuer_id, payment_method_id, payer, envio });
    console.info(`process-payment ${orderId}: payer.email=${payloadMP.payer.email ? 'ok' : 'AUSENTE'} nombre=${payloadMP.payer.first_name ? 'ok' : 'ausente'} dirección=${payloadMP.additional_info.shipments ? 'ok' : 'ausente'} doc=${payloadMP.payer.identification ? 'ok' : 'ausente'}`);

    const llamarMP = (body, idemKey) => fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idemKey, // por intento: con la misma clave MP devolvería el rechazo cacheado
        ...(deviceId ? { 'X-meli-session-id': deviceId } : {}),
      },
      body: JSON.stringify(body),
    });

    pedido.intentos += 1;
    const idemKey = pedido.intentos === 1 ? orderId : `${orderId}-a${pedido.intentos}`;

    let response = await llamarMP(payloadMP, idemKey);
    let payment = await response.json();

    // 400 = no se creó ningún pago → un reintento con el payload mínimo no duplica el cobro.
    if (response.status === 400) {
      const causa = (Array.isArray(payment.cause) ? payment.cause : [])
        .map((c) => `${c?.code}:${cap(c?.description, 120)}`).join(' | ');
      console.warn(`process-payment ${orderId}: MP 400 con datos extra → reintento con payload mínimo. message=${cap(payment.message, 160)} cause=${causa}`);
      response = await llamarMP(payloadMinimoMP(payloadMP), `${idemKey}-min`);
      payment = await response.json();
    }

    if (!response.ok) {
      console.error(`Error de la API de Mercado Pago (${orderId}): http=${response.status} message=${cap(payment?.message, 200)} error=${cap(payment?.error, 80)}`);
      return res.status(502).json({ error: 'no se pudo procesar el pago' });
    }
    if (!['approved', 'in_process', 'pending'].includes(payment.status)) {
      console.warn(`pago rechazado ${orderId}: payment_id=${payment.id} status=${payment.status} status_detail=${payment.status_detail}`);
    }

    pedido.paymentId = payment.id;
    if (payment.status === 'approved') {
      pedido.estado = 'pagado';
      pedido.paidAt = new Date().toISOString();
      registrarVenta(orderId, pedido, payment); // fire-and-forget
    } else if (payment.status === 'in_process' || payment.status === 'pending') {
      pedido.estado = 'pendiente_confirmacion'; // el webhook lo resuelve
    } else {
      pedido.estado = 'rechazado';
    }
    pedidosMP.set(orderId, pedido);

    const respuesta = { status: payment.status, status_detail: payment.status_detail ?? null, id: payment.id };
    // 3DS 2.0: MP pide verificar con el banco. El frontend monta el Status Screen Brick con estos
    // dos valores; el resultado final llega por webhook (→ /api/mp/order-status).
    if (payment.status === 'pending' && payment.status_detail === 'pending_challenge' && payment.three_ds_info?.external_resource_url) {
      respuesta.three_ds_info = {
        external_resource_url: String(payment.three_ds_info.external_resource_url),
        creq: String(payment.three_ds_info.creq || ''),
      };
    }
    return res.json(respuesta);
  } catch (err) {
    console.error('Error procesando pago Mercado Pago:', err.message);
    return res.status(500).json({ error: 'no se pudo procesar el pago' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/mp/order-status/:orderId — el frontend lo consulta mientras el cliente completa el
// desafío 3DS. Solo LEE el estado que fija el webhook (nunca se confirma desde el navegador).
// orderId = UUID aleatorio; no expone datos personales.
// ─────────────────────────────────────────────────────────────
const orderStatusLimiter = rateLimit({ windowMs: 60_000, max: Number(process.env.MP_RATE_LIMIT) || 60 });
app.get('/api/mp/order-status/:orderId', orderStatusLimiter, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const pedido = pedidosMP.get(req.params.orderId);
  if (!pedido) return res.status(404).json({ error: 'pedido no encontrado o expirado' });
  const estado = pedido.estado === 'pagado' ? 'approved' : pedido.estado === 'rechazado' ? 'rejected' : 'pending';
  return res.json({ estado });
});

// ─────────────────────────────────────────────────────────────
// POST /api/mp/webhook — notificación de MP.
// Firma x-signature = HMAC-SHA256 de "id:{data.id};request-id:{x-request-id};ts:{ts};"
// ─────────────────────────────────────────────────────────────
function firmaMPValida(req) {
  if (!MP_WEBHOOK_SECRET) return false;
  const firma = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];
  const dataId = req.query?.['data.id'] || req.body?.data?.id;
  if (!firma || !dataId) return false;

  const partes = Object.fromEntries(
    String(firma).split(',').map((p) => p.trim().split('=').map((s) => s.trim())),
  );
  const { ts, v1 } = partes;
  if (!ts || !v1) return false;

  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId || ''};ts:${ts};`;
  const hash = crypto.createHmac('sha256', MP_WEBHOOK_SECRET).update(manifest).digest('hex');
  const a = Buffer.from(hash, 'utf8');
  const b = Buffer.from(v1, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.post('/api/mp/webhook', async (req, res) => {
  if (!firmaMPValida(req)) {
    console.warn('Firma de webhook Mercado Pago inválida o ausente.');
    return res.status(400).send('firma inválida');
  }

  const dataId = req.query?.['data.id'] || req.body?.data?.id;
  const notifId = req.body?.id ?? `${dataId}:${req.body?.action}`;
  if (notificacionesMP.has(notifId)) return res.status(200).json({ received: true, duplicate: true });
  notificacionesMP.add(notifId);

  if (req.body?.type !== 'payment' || !dataId || !MP_ACCESS_TOKEN) {
    return res.status(200).json({ received: true, ignored: true });
  }

  try {
    // Importe y estado nunca del cuerpo del webhook: se pide el pago a la API de MP.
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    const payment = await r.json();
    const orderId = payment.external_reference;
    const pedido = orderId ? pedidosMP.get(orderId) : null;

    if (!pedido) {
      console.warn(`Webhook MP: pago ${payment.id} sin pedido en memoria (¿reinicio del servidor?). Revisar en el panel de MP.`);
    } else {
      const diff = Math.abs(payment.transaction_amount - pedido.amountExpected);
      if (diff > 0.01) {
        console.error(`IMPORTE NO COINCIDE orderId=${orderId} esperado=${pedido.amountExpected} cobrado=${payment.transaction_amount}. Pedido NO confirmado.`);
        return res.status(200).json({ received: true, mismatch: true });
      }
      pedido.paymentId = payment.id;
      if (payment.status === 'approved') {
        pedido.estado = 'pagado';
        pedido.paidAt = pedido.paidAt || new Date().toISOString();
        registrarVenta(orderId, pedido, payment); // idempotente por payment_id
      } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
        pedido.estado = 'rechazado';
      }
      pedidosMP.set(orderId, pedido);
      console.log(`Webhook MP: pedido ${orderId} → ${pedido.estado} (payment ${payment.id})`);
    }
  } catch (err) {
    console.error('Error consultando pago en webhook MP:', err.message);
  }
  return res.status(200).json({ received: true });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const server = app.listen(PORT, () => console.log(`Allpa Essence backend escuchando en :${PORT} · moneda ${MONEDA} · pasarela ${GATEWAY} · ${PUBLIC_BASE_URL}`));

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`${sig} recibido, cerrando servidor...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}

const STORAGE_KEY = 'ae_cart';

function readCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCart(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage no disponible (modo privado, cuota llena) — el carrito sigue
    // funcionando en memoria durante la sesión, solo no persiste al recargar.
  }
}

let items = readCart();
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn(items));
}

export const cartStore = {
  subscribe(fn) {
    listeners.add(fn);
    fn(items);
    return () => listeners.delete(fn);
  },
  getItems() {
    return items;
  },
  getCount() {
    return items.reduce((sum, item) => sum + item.qty, 0);
  },
  getSubtotal() {
    return items.reduce((sum, item) => sum + item.price * item.qty, 0);
  },
  addItem({ id, name, price, image }) {
    const existing = items.find((item) => item.id === id);
    if (existing) existing.qty += 1;
    else items.push({ id, name, price, image, qty: 1 });
    writeCart(items);
    notify();
  },
  updateQty(id, delta) {
    const item = items.find((item) => item.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) items = items.filter((i) => i.id !== id);
    writeCart(items);
    notify();
  },
  removeItem(id) {
    items = items.filter((item) => item.id !== id);
    writeCart(items);
    notify();
  },
};

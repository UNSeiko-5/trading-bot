// Stockage local (IndexedDB) : entrées du journal, envies, métadonnées des films et réglages de données.
const STORES = { entries: 'id', watchlist: 'key', meta: 'key', kv: null };
const mem = Object.fromEntries(Object.keys(STORES).map((k) => [k, new Map()]));
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('no idb'));
    const r = indexedDB.open('clap', 1);
    r.onupgradeneeded = () => {
      for (const [name, key] of Object.entries(STORES)) r.result.createObjectStore(name, key ? { keyPath: key } : undefined);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

async function run(store, mode, fn) {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('abort'));
    });
  } catch {
    return undefined;
  }
}

const keyOf = (store, item) => item[STORES[store]];

export async function all(store) {
  const r = await run(store, 'readonly', (s) => s.getAll());
  return r || [...mem[store].values()];
}

export async function putMany(store, items) {
  items.forEach((i) => mem[store].set(keyOf(store, i), i));
  await run(store, 'readwrite', (s) => {
    items.forEach((i) => s.put(i));
  });
}

export async function replaceAll(store, items) {
  mem[store].clear();
  items.forEach((i) => mem[store].set(keyOf(store, i), i));
  await run(store, 'readwrite', (s) => {
    s.clear();
    items.forEach((i) => s.put(i));
  });
}

export async function clear(store) {
  mem[store].clear();
  await run(store, 'readwrite', (s) => s.clear());
}

export async function getKv(key) {
  const r = await run('kv', 'readonly', (s) => s.get(key));
  return r ?? mem.kv.get(key);
}

export async function setKv(key, value) {
  mem.kv.set(key, value);
  await run('kv', 'readwrite', (s) => s.put(value, key));
}

export async function clearAll() {
  for (const s of Object.keys(STORES)) await clear(s);
}

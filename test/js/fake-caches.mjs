// An in-memory stand-in for CacheStorage, enough for the offline tests.
const keyOf = (k) => (typeof k === "string" ? k : k.url);
const bare = (u) => u.split("?")[0];

function makeCache() {
  const entries = new Map();
  return {
    entries,
    async put(k, res) { entries.set(keyOf(k), res); },
    async match(k, { ignoreSearch = false } = {}) {
      const u = keyOf(k);
      for (const [key, res] of entries) if (key === u || (ignoreSearch && bare(key) === bare(u))) return res.clone();
      return undefined;
    },
    async delete(k) { return entries.delete(keyOf(k)); },
    async keys() { return [...entries.keys()].map((url) => ({ url })); },
  };
}

export function fakeCaches() {
  const stores = new Map();
  return {
    stores,
    async open(name) { if (!stores.has(name)) stores.set(name, makeCache()); return stores.get(name); },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async has(name) { return stores.has(name); },
  };
}

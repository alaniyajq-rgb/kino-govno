// Хранилище: Upstash Redis на Vercel, в памяти — для локального запуска.
import { Redis } from "@upstash/redis";

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function memoryStore() {
  const g = globalThis.__kvMem || (globalThis.__kvMem = new Map());
  const h = (k) => { if (!g.has(k)) g.set(k, new Map()); return g.get(k); };
  return {
    async get(k) { const v = g.get(k); return v instanceof Map ? null : v ?? null; },
    async set(k, v) { g.set(k, v); },
    async exists(k) { return g.has(k) ? 1 : 0; },
    async hset(k, obj) { const m = h(k); for (const [f, v] of Object.entries(obj)) m.set(f, v); },
    async hdel(k, ...fs) { const m = h(k); fs.forEach((f) => m.delete(f)); },
    async hget(k, f) { return h(k).get(f) ?? null; },
    async hgetall(k) { const m = g.get(k); return m instanceof Map && m.size ? Object.fromEntries(m) : null; },
  };
}

export const kv = url && token ? new Redis({ url, token }) : memoryStore();
export const usingMemory = !(url && token);

// Upstash сам разбирает JSON при чтении, память — нет. Приводим к одному виду.
export const parse = (v) => {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
};

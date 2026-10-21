import { kv, parse } from "./store.js";

// Без похожих символов (0/O, 1/I/L), чтобы код легко продиктовать
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const newCode = () =>
  Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");

export const cleanCode = (c) => {
  const s = String(c || "").toUpperCase().trim();
  return /^[A-Z2-9]{6}$/.test(s) ? s : null;
};
export const cleanMember = (m) => (/^[a-z0-9]{12,32}$/.test(String(m || "")) ? String(m) : null);
export const cleanName = (n) => String(n || "").replace(/\s+/g, " ").trim().slice(0, 30) || null;
export const cleanItemKey = (k) => (/^(movie|tv)-\d{1,9}$/.test(String(k || "")) ? String(k) : null);

export const roomKey = (code, part) => `room:${code}${part ? ":" + part : ""}`;

const obj = (h) => (h && typeof h === "object" ? h : {});

export async function loadRoom(code) {
  const meta = parse(await kv.get(roomKey(code)));
  if (!meta) return null;
  const [members, items, ratings] = await Promise.all([
    kv.hgetall(roomKey(code, "members")),
    kv.hgetall(roomKey(code, "items")),
    kv.hgetall(roomKey(code, "ratings")),
  ]);
  return {
    code,
    members: Object.entries(obj(members)).map(([id, v]) => ({ id, ...parse(v) })),
    items: Object.values(obj(items)).map(parse).filter(Boolean),
    ratings: Object.entries(obj(ratings)).map(([k, v]) => {
      const [item, member] = k.split("|");
      return { item, member, score: Number(v) };
    }).filter((r) => r.score >= 1 && r.score <= 10),
  };
}

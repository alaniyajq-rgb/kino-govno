// POST /api/rooms — создать комнату. Возвращает её код.
import { kv } from "../lib/store.js";
import { cleanName, cleanMember, newCode, roomKey } from "../lib/room.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Только POST" });
  const body = req.body || {};
  const name = cleanName(body.name);
  const member = cleanMember(body.member);
  if (!name || !member) return res.status(400).json({ error: "Укажите своё имя" });

  let code = "";
  for (let i = 0; i < 8; i++) {
    const c = newCode();
    if (!(await kv.exists(roomKey(c)))) { code = c; break; }
  }
  if (!code) return res.status(500).json({ error: "Не удалось создать комнату, попробуйте ещё раз" });

  await kv.set(roomKey(code), JSON.stringify({ code, createdAt: Date.now() }));
  await kv.hset(roomKey(code, "members"), { [member]: JSON.stringify({ name, joinedAt: Date.now() }) });
  res.status(200).json({ code });
}

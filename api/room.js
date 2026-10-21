// GET  /api/room?code=XXXXXX — всё содержимое комнаты
// POST /api/room?code=XXXXXX — действие: join | add | status | remove | rate
import { kv, parse } from "../lib/store.js";
import { fetchItem, TmdbError } from "../lib/tmdb.js";
import { cleanCode, cleanMember, cleanName, cleanItemKey, roomKey, loadRoom } from "../lib/room.js";

const MAX_ITEMS = 500;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const code = cleanCode(req.query.code);
  if (!code) return res.status(400).json({ error: "Неверный код комнаты" });

  if (req.method === "GET") {
    const room = await loadRoom(code);
    return room ? res.status(200).json(room) : res.status(404).json({ error: "Комната не найдена" });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Метод не поддерживается" });

  if (!(await kv.exists(roomKey(code)))) return res.status(404).json({ error: "Комната не найдена" });
  const b = req.body || {};
  const member = cleanMember(b.member);
  if (!member) return res.status(400).json({ error: "Сначала представьтесь" });

  const membersKey = roomKey(code, "members");
  const itemsKey = roomKey(code, "items");
  const ratingsKey = roomKey(code, "ratings");

  // Все действия, кроме входа, только для участников комнаты
  if (b.action !== "join" && !(await kv.hget(membersKey, member))) {
    return res.status(403).json({ error: "Сначала войдите в комнату" });
  }

  try {
    switch (b.action) {
      case "join": {
        const name = cleanName(b.name);
        if (!name) return res.status(400).json({ error: "Укажите своё имя" });
        const prev = parse(await kv.hget(membersKey, member));
        await kv.hset(membersKey, { [member]: JSON.stringify({ name, joinedAt: prev?.joinedAt || Date.now() }) });
        break;
      }
      case "add": {
        const key = cleanItemKey(b.key);
        if (!key) return res.status(400).json({ error: "Неверный фильм" });
        if (await kv.hget(itemsKey, key)) return res.status(409).json({ error: "Уже в списке" });
        const all = await kv.hgetall(itemsKey);
        if (all && Object.keys(all).length >= MAX_ITEMS) return res.status(400).json({ error: "В комнате уже 500 позиций" });
        const [kind, id] = key.split("-");
        const item = await fetchItem(kind, Number(id));
        await kv.hset(itemsKey, {
          [key]: JSON.stringify({ ...item, status: "queue", addedBy: member, addedAt: Date.now(), watchedAt: null }),
        });
        break;
      }
      case "status": {
        const key = cleanItemKey(b.key);
        const item = key && parse(await kv.hget(itemsKey, key));
        if (!item) return res.status(404).json({ error: "Такого фильма нет в списке" });
        const watched = b.status === "watched";
        await kv.hset(itemsKey, {
          [key]: JSON.stringify({ ...item, status: watched ? "watched" : "queue", watchedAt: watched ? Date.now() : null }),
        });
        break;
      }
      case "remove": {
        const key = cleanItemKey(b.key);
        if (!key) return res.status(400).json({ error: "Неверный фильм" });
        await kv.hdel(itemsKey, key);
        const rs = await kv.hgetall(ratingsKey);
        const mine = Object.keys(rs || {}).filter((k) => k.startsWith(key + "|"));
        if (mine.length) await kv.hdel(ratingsKey, ...mine);
        break;
      }
      case "rate": {
        const key = cleanItemKey(b.key);
        const score = Number(b.score);
        if (!key || !(await kv.hget(itemsKey, key))) return res.status(404).json({ error: "Такого фильма нет в списке" });
        if (score === 0) await kv.hdel(ratingsKey, `${key}|${member}`);
        else if (Number.isInteger(score) && score >= 1 && score <= 10) await kv.hset(ratingsKey, { [`${key}|${member}`]: String(score) });
        else return res.status(400).json({ error: "Оценка от 1 до 10" });
        break;
      }
      default:
        return res.status(400).json({ error: "Неизвестное действие" });
    }
  } catch (e) {
    return res.status(e instanceof TmdbError ? 502 : 500).json({ error: e instanceof TmdbError ? e.message : "Не сохранилось, попробуйте ещё раз" });
  }

  res.status(200).json(await loadRoom(code));
}

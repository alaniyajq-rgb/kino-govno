// Постеры отдаём через свой домен: так они грузятся и там, где image.tmdb.org недоступен.
const SIZES = new Set(["w185", "w342", "w500", "w780"]);

export default async function handler(req, res) {
  const s = String(req.query.s || "w342");
  const p = String(req.query.p || "");
  if (!SIZES.has(s) || !/^\/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$/.test(p)) {
    return res.status(400).json({ error: "Неверный путь к постеру" });
  }
  try {
    const r = await fetch(`https://image.tmdb.org/t/p/${s}${p}`);
    if (!r.ok) return res.status(r.status === 404 ? 404 : 502).end();
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    res.status(200).send(buf);
  } catch {
    res.status(502).end();
  }
}

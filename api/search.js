import { tmdb, toResult, TmdbError } from "../lib/tmdb.js";

export default async function handler(req, res) {
  const q = String(req.query.q || "").trim().slice(0, 100);
  if (q.length < 2) return res.status(200).json({ results: [] });
  try {
    const data = await tmdb("/search/multi", { query: q, include_adult: "false", page: "1" });
    const results = (data.results || [])
      .filter((x) => x.media_type === "movie" || x.media_type === "tv")
      .map(toResult)
      .filter((x) => x.title)
      .slice(0, 12);
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json({ results });
  } catch (e) {
    res.status(e instanceof TmdbError ? 502 : 500).json({ error: e instanceof TmdbError ? e.message : "Поиск сейчас не работает" });
  }
}

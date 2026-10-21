// Обёртка над TMDB API. Ключ живёт только на сервере.
const BASE = "https://api.themoviedb.org/3";

export class TmdbError extends Error {}

export async function tmdb(path, params = {}) {
  const token = process.env.TMDB_TOKEN;   // «API Read Access Token» (длинный, начинается с eyJ)
  const apiKey = process.env.TMDB_API_KEY; // короткий «API Key», если удобнее он
  if (!token && !apiKey) throw new TmdbError("Не задан ключ TMDB: добавьте TMDB_TOKEN в настройках проекта");

  const qs = new URLSearchParams({ language: "ru-RU", ...params });
  if (!token) qs.set("api_key", apiKey);
  const r = await fetch(`${BASE}${path}?${qs}`, {
    headers: { accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  if (r.status === 401) throw new TmdbError("TMDB не принял ключ: проверьте TMDB_TOKEN");
  if (!r.ok) throw new TmdbError(`TMDB ответил ошибкой ${r.status}`);
  return r.json();
}

const year = (d) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);

// Короткая карточка для выдачи поиска
export function toResult(x) {
  const isTv = x.media_type === "tv";
  return {
    key: `${isTv ? "tv" : "movie"}-${x.id}`,
    kind: isTv ? "tv" : "movie",
    title: (isTv ? x.name : x.title) || "",
    original: (isTv ? x.original_name : x.original_title) || "",
    year: year(isTv ? x.first_air_date : x.release_date),
    poster: x.poster_path || null,
    overview: x.overview || "",
    vote: typeof x.vote_average === "number" ? Math.round(x.vote_average * 10) / 10 : null,
    votes: x.vote_count || 0,
  };
}

// Полная карточка для списка: берём из TMDB, а не со слов клиента
export async function fetchItem(kind, id) {
  const d = await tmdb(`/${kind}/${id}`);
  const isTv = kind === "tv";
  let overview = d.overview || "";
  if (!overview) {
    try { overview = (await tmdb(`/${kind}/${id}`, { language: "en-US" })).overview || ""; } catch {}
  }
  return {
    key: `${kind}-${id}`,
    kind,
    tmdbId: id,
    title: (isTv ? d.name : d.title) || "",
    original: (isTv ? d.original_name : d.original_title) || "",
    year: year(isTv ? d.first_air_date : d.release_date),
    poster: d.poster_path || null,
    overview: overview.slice(0, 1200),
    genres: (d.genres || []).slice(0, 3).map((g) => g.name),
    vote: typeof d.vote_average === "number" ? Math.round(d.vote_average * 10) / 10 : null,
    runtime: isTv ? (d.episode_run_time && d.episode_run_time[0]) || null : d.runtime || null,
    seasons: isTv ? d.number_of_seasons || null : null,
    imdbId: d.imdb_id || (d.external_ids && d.external_ids.imdb_id) || null,
  };
}

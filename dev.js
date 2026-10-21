// Локальный запуск без Vercel: node dev.js → http://localhost:3000
// Без переменных Upstash данные живут в памяти до перезапуска.
// Ключ TMDB можно передать так: TMDB_TOKEN=eyJ... node dev.js
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { usingMemory } from "./lib/store.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  // Мини-адаптер под интерфейс Vercel: req.query, req.body, res.status().json()
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(o)); return res; };
  res.send = (b) => { res.end(b); return res; };

  if (url.pathname.startsWith("/api/")) {
    const name = url.pathname.slice(5).replace(/[^a-z]/g, "");
    req.query = Object.fromEntries(url.searchParams);
    let raw = "";
    for await (const c of req) raw += c;
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
    try {
      const mod = await import(`./api/${name}.js`);
      return await mod.default(req, res);
    } catch (e) {
      console.error(e);
      return res.status(404).json({ error: "Нет такого адреса" });
    }
  }

  let p = normalize(url.pathname === "/" ? "/index.html" : url.pathname);
  try {
    const file = await readFile(join(root, "public", p));
    res.setHeader("Content-Type", TYPES[extname(p)] || "application/octet-stream");
    res.end(file);
  } catch {
    res.statusCode = 404; res.end("Not found");
  }
}).listen(PORT, () => {
  console.log(`Киновечер: http://localhost:${PORT}${usingMemory ? "  (данные в памяти)" : ""}`);
});

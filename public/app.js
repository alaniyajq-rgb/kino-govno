// Киновечер — клиент. Без сборки и фреймворков.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- Локальные настройки ----------
const LS = {
  get(k, d = null) { try { return JSON.parse(localStorage.getItem("kv_" + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("kv_" + k, JSON.stringify(v)); } catch {} },
};
function memberId() {
  let id = LS.get("member");
  if (!/^[a-z0-9]{12,32}$/.test(id || "")) {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    id = Array.from(a, (b) => (b % 36).toString(36)).join("") + Date.now().toString(36);
    id = id.slice(0, 24);
    LS.set("member", id);
  }
  return id;
}
const ME = memberId();

// ---------- Состояние ----------
const state = {
  code: null,
  room: null,
  tab: "queue",
  kind: "all",
  sort: LS.get("sort", "added"),
  pick: null,
  openKey: null,
  results: [],
};

// ---------- API ----------
async function api(path, opts = {}) {
  const r = await fetch(path, {
    method: opts.body ? "POST" : "GET",
    headers: opts.body ? { "content-type": "application/json" } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(data.error || "Сервер не ответил, попробуйте ещё раз"); e.status = r.status; throw e; }
  return data;
}
const act = (body) => api(`/api/room?code=${state.code}`, { body: { member: ME, ...body } });

// ---------- Мелочи интерфейса ----------
function toast(t) {
  const el = $("#toast");
  el.textContent = t;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 2400);
}
const img = (p, size = "w342") => (p ? `/api/img?s=${size}&p=${encodeURIComponent(p)}` : null);
const kindLabel = (k) => (k === "tv" ? "Сериал" : "Фильм");
const COLORS = ["#e07a5f", "#5b8def", "#9b6bd6", "#3fa98a", "#d9677f", "#c99a2e"];
const colorFor = (id) => COLORS[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];
const nameOf = (id) => {
  if (id === ME) return "Вы";
  const m = state.room?.members.find((m) => m.id === id);
  return m ? m.name : "Кто-то";
};
function posterHTML(item, size, extra = "") {
  const src = img(item.poster, size);
  return `<div class="poster">${src
    ? `<img src="${src}" alt="Постер: ${esc(item.title)}" loading="lazy" decoding="async">`
    : `<div class="noimg">${esc(item.title)}</div>`}${extra}</div>`;
}
const ratingsOf = (key) => (state.room?.ratings || []).filter((r) => r.item === key);
const avgOf = (key) => {
  const rs = ratingsOf(key);
  return rs.length ? rs.reduce((s, r) => s + r.score, 0) / rs.length : null;
};
const metaLine = (i) => [i.year, kindLabel(i.kind), ...(i.genres || []).slice(0, 2)].filter(Boolean).join(" · ");

// ---------- Экраны ----------
function show(id) {
  for (const s of ["landing", "joinName", "app"]) $("#" + s).hidden = s !== id;
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const fromLink = (params.get("r") || "").toUpperCase();
  const saved = LS.get("room");
  const code = /^[A-Z2-9]{6}$/.test(fromLink) ? fromLink : saved;
  if (!code) return show("landing");

  try {
    const room = await api(`/api/room?code=${code}`);
    state.code = code;
    if (room.members.some((m) => m.id === ME)) return enterRoom(room);
    $("#joinCodeLabel").textContent = code;
    $("#joinNameInput").value = LS.get("name", "");
    show("joinName");
  } catch (e) {
    if (e.status === 404) { LS.set("room", null); toast("Комната не найдена"); }
    else toast(e.message);
    history.replaceState(null, "", "/");
    show("landing");
  }
}

function enterRoom(room) {
  state.room = room;
  state.code = room.code;
  LS.set("room", room.code);
  history.replaceState(null, "", `/?r=${room.code}`);
  $("#roomCode").textContent = room.code;
  $("#sort").value = state.sort;
  show("app");
  render();
  startPolling();
}

// ---------- Отрисовка комнаты ----------
function render() {
  const room = state.room;
  if (!room) return;

  $("#members").innerHTML = room.members
    .map((m) => `<span class="avatar" style="background:${colorFor(m.id)}" title="${esc(m.id === ME ? m.name + " (вы)" : m.name)}">${esc((m.name || "?").slice(0, 1).toUpperCase())}</span>`)
    .join("");

  const queue = room.items.filter((i) => i.status !== "watched");
  const watched = room.items.filter((i) => i.status === "watched");
  $("#cQueue").textContent = queue.length;
  $("#cWatched").textContent = watched.length;
  $("#tabQueue").setAttribute("aria-pressed", state.tab === "queue");
  $("#tabWatched").setAttribute("aria-pressed", state.tab === "watched");
  document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === state.kind));
  $("#randomBtn").hidden = state.tab !== "queue";

  let list = (state.tab === "queue" ? queue : watched).filter((i) => state.kind === "all" || i.kind === state.kind);
  const by = {
    added: (a, b) => (state.tab === "watched" ? (b.watchedAt || 0) - (a.watchedAt || 0) : (b.addedAt || 0) - (a.addedAt || 0)),
    tmdb: (a, b) => (b.vote || 0) - (a.vote || 0),
    ours: (a, b) => (avgOf(b.key) ?? -1) - (avgOf(a.key) ?? -1),
    year: (a, b) => (b.year || 0) - (a.year || 0),
  };
  list.sort(by[state.sort] || by.added);

  const grid = $("#grid");
  const empty = $("#empty");
  if (!list.length) {
    grid.innerHTML = "";
    empty.hidden = false;
    empty.innerHTML = state.tab === "queue"
      ? (queue.length
        ? `<strong>Здесь пусто</strong>Под этот фильтр ничего не подходит.`
        : `<strong>Очередь пока пустая</strong>Найдите фильм или сериал в строке поиска сверху и нажмите «В список». Друг увидит его сразу.`)
      : `<strong>Тут будут просмотренные</strong>Откройте фильм из очереди, нажмите «Посмотрели» и поставьте оценку.`;
    return;
  }
  empty.hidden = true;
  grid.innerHTML = list.map(cardHTML).join("");
}

function cardHTML(i) {
  const avg = avgOf(i.key);
  const watched = i.status === "watched";
  const badges =
    (i.vote ? `<span class="badge" title="Рейтинг TMDB">${i.vote.toFixed(1)}</span>` : "") +
    (watched && avg !== null ? `<span class="badge ours" title="Наша оценка">★ ${avg.toFixed(1)}</span>` : "") +
    `<span class="kind-tag">${kindLabel(i.kind)}</span>`;
  const who = watched
    ? ratingsOf(i.key).map((r) => `<span>${esc(nameOf(r.member))}: <b>${r.score}</b></span>`).join("") || `<span>Оценок ещё нет</span>`
    : `<span>Добавил: ${esc(nameOf(i.addedBy))}</span>`;
  return `<button class="card${state.pick === i.key ? " pick" : ""}" data-open="${i.key}" id="card-${i.key}">
    ${posterHTML(i, "w342", badges)}
    <span class="card-title">${esc(i.title)}</span>
    <span class="card-meta">${esc(metaLine(i))}</span>
    <span class="card-who">${who}</span>
  </button>`;
}

// ---------- Карточка фильма ----------
function openSheet(key) {
  state.openKey = key;
  renderSheet();
  const d = $("#sheet");
  if (!d.open) d.showModal();
}
function renderSheet() {
  const i = state.room?.items.find((x) => x.key === state.openKey);
  if (!i) { if ($("#sheet").open) $("#sheet").close(); return; }
  const watched = i.status === "watched";
  const rs = ratingsOf(i.key);
  const mine = rs.find((r) => r.member === ME)?.score || 0;
  const avg = avgOf(i.key);
  const facts = [
    i.year && `<span>${i.year}</span>`,
    `<span>${kindLabel(i.kind)}</span>`,
    i.seasons && `<span>${i.seasons} ${plural(i.seasons, "сезон", "сезона", "сезонов")}</span>`,
    i.runtime && `<span>${i.runtime} мин${i.kind === "tv" ? " / серия" : ""}</span>`,
    i.vote && `<span class="tmdb">TMDB ${i.vote.toFixed(1)}</span>`,
    ...(i.genres || []).map((g) => `<span>${esc(g)}</span>`),
  ].filter(Boolean).join("");
  const kp = `https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(i.title + (i.year ? " " + i.year : ""))}`;
  const tmdbUrl = `https://www.themoviedb.org/${i.kind}/${i.tmdbId}?language=ru-RU`;

  $("#sheetBody").innerHTML = `
    <button class="sheet-close" data-close aria-label="Закрыть">×</button>
    ${posterHTML(i, "w500")}
    <div>
      <h2 id="sheetTitle">${esc(i.title)}</h2>
      ${i.original && i.original !== i.title ? `<div class="orig">${esc(i.original)}</div>` : ""}
      <div class="facts">${facts}</div>
      <p class="overview">${esc(i.overview || "Описания пока нет.")}</p>
    </div>
    <div class="sheet-full">
      ${watched ? `
      <div class="rating-box">
        <div class="rating-head">
          <h3>Ваша оценка</h3>
          ${avg !== null ? `<span class="avg">★ ${avg.toFixed(1)}</span>` : ""}
        </div>
        <div class="scale" role="group" aria-label="Ваша оценка от 1 до 10">
          ${Array.from({ length: 10 }, (_, n) => n + 1).map((n) => `<button data-rate="${n}" class="${mine === n ? "on" : ""}" aria-pressed="${mine === n}">${n}</button>`).join("")}
        </div>
        <div class="scores">${rs.length ? rs.map((r) => `<span>${esc(nameOf(r.member))}: <b>${r.score}</b></span>`).join("") : "Пока никто не оценил"}
          ${mine ? `<button class="link" data-rate="0">Убрать мою оценку</button>` : ""}</div>
      </div>` : ""}
      <div class="actions">
        ${watched
          ? `<button class="btn small" data-status="queue">Вернуть в очередь</button>`
          : `<button class="btn primary" data-status="watched">Посмотрели</button>`}
        <button class="btn small danger" data-remove>Удалить</button>
        <span class="spacer"></span>
        <a class="ext" href="${kp}" target="_blank" rel="noopener">Кинопоиск ↗</a>
        <a class="ext" href="${tmdbUrl}" target="_blank" rel="noopener">TMDB ↗</a>
      </div>
      <div class="added-by">Добавил: ${esc(nameOf(i.addedBy))}</div>
    </div>`;
}
const plural = (n, a, b, c) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);

$("#sheet").addEventListener("click", async (e) => {
  const d = $("#sheet");
  if (e.target === d || e.target.closest("[data-close]")) return d.close();
  const key = state.openKey;
  const rate = e.target.closest("[data-rate]");
  const status = e.target.closest("[data-status]");
  const remove = e.target.closest("[data-remove]");
  try {
    if (rate) {
      state.room = await act({ action: "rate", key, score: Number(rate.dataset.rate) });
    } else if (status) {
      state.room = await act({ action: "status", key, status: status.dataset.status });
      if (status.dataset.status === "watched") toast("Отмечено. Теперь поставьте оценку");
      else toast("Вернули в очередь");
    } else if (remove) {
      if (!remove.dataset.armed) {
        remove.dataset.armed = "1";
        remove.textContent = "Точно удалить?";
        setTimeout(() => { if (remove.isConnected) { delete remove.dataset.armed; remove.textContent = "Удалить"; } }, 3000);
        return;
      }
      state.room = await act({ action: "remove", key });
      d.close();
      toast("Удалено из списка");
    } else return;
    render();
    if (d.open) renderSheet();
  } catch (err) { toast(err.message); }
});
$("#sheet").addEventListener("close", () => (state.openKey = null));

// ---------- Поиск ----------
let searchTimer = null;
let searchSeq = 0;
$("#q").addEventListener("input", () => {
  const q = $("#q").value.trim();
  $("#clearSearch").hidden = !q;
  clearTimeout(searchTimer);
  if (q.length < 2) { closeResults(); return; }
  searchTimer = setTimeout(() => runSearch(q), 350);
});
$("#searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#q").value.trim();
  if (q.length >= 2) { clearTimeout(searchTimer); runSearch(q); }
});
$("#clearSearch").addEventListener("click", () => { $("#q").value = ""; $("#clearSearch").hidden = true; closeResults(); $("#q").focus(); });
$("#closeResults").addEventListener("click", closeResults);
function closeResults() { $("#resultsWrap").hidden = true; state.results = []; }

async function runSearch(q) {
  const seq = ++searchSeq;
  $("#resultsWrap").hidden = false;
  $("#resultsTitle").textContent = `Ищу «${q}»…`;
  $("#results").innerHTML = Array.from({ length: 6 }, () => `<div class="res"><div class="poster skeleton"></div></div>`).join("");
  try {
    const { results } = await api(`/api/search?q=${encodeURIComponent(q)}`);
    if (seq !== searchSeq) return;
    state.results = results;
    $("#resultsTitle").textContent = results.length ? `Нашлось по «${q}»` : `По «${q}» ничего`;
    renderResults();
  } catch (e) {
    if (seq !== searchSeq) return;
    $("#resultsTitle").textContent = "Поиск не сработал";
    $("#results").innerHTML = `<div class="res-note">${esc(e.message)}</div>`;
  }
}
function renderResults() {
  if (!state.results.length) {
    $("#results").innerHTML = `<div class="res-note">Попробуйте другое написание или оригинальное название.</div>`;
    return;
  }
  const have = new Set(state.room.items.map((i) => i.key));
  $("#results").innerHTML = state.results.map((r) => `
    <div class="res">
      ${posterHTML(r, "w185", r.vote && r.votes > 20 ? `<span class="badge">${r.vote.toFixed(1)}</span>` : "")}
      <span class="res-title">${esc(r.title)}</span>
      <span class="res-meta">${esc([r.year, kindLabel(r.kind)].filter(Boolean).join(" · "))}</span>
      ${have.has(r.key)
        ? `<button class="btn small" disabled>В списке</button>`
        : `<button class="btn small primary" data-add="${r.key}">В список</button>`}
    </div>`).join("");
}
$("#results").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-add]");
  if (!b) return;
  b.disabled = true;
  b.textContent = "Добавляю…";
  try {
    state.room = await act({ action: "add", key: b.dataset.add });
    state.tab = "queue";
    render();
    renderResults();
    toast("Добавлено в очередь");
  } catch (err) {
    toast(err.message);
    b.disabled = false;
    b.textContent = "В список";
  }
});

// ---------- Фильтры и прочее ----------
$("#grid").addEventListener("click", (e) => {
  const c = e.target.closest("[data-open]");
  if (c) openSheet(c.dataset.open);
});
$("#tabQueue").onclick = () => { state.tab = "queue"; render(); };
$("#tabWatched").onclick = () => { state.tab = "watched"; state.pick = null; render(); };
document.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => { state.kind = b.dataset.k; render(); }));
$("#sort").onchange = (e) => { state.sort = e.target.value; LS.set("sort", state.sort); render(); };
$("#randomBtn").onclick = () => {
  const pool = state.room.items.filter((i) => i.status !== "watched" && (state.kind === "all" || i.kind === state.kind));
  if (!pool.length) return toast("В очереди пока нечего выбирать");
  const p = pool[Math.floor(Math.random() * pool.length)];
  state.pick = p.key;
  render();
  const el = document.getElementById("card-" + p.key);
  el?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  toast(`Сегодня смотрим: ${p.title}`);
};
$("#inviteBtn").onclick = async () => {
  const link = `${location.origin}/?r=${state.code}`;
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title: "Киновечер", text: "Заходи в наш список фильмов", url: link });
      return;
    }
    await navigator.clipboard.writeText(link);
    toast("Ссылка скопирована, отправьте её другу");
  } catch (e) {
    if (e?.name !== "AbortError") toast(`Код комнаты: ${state.code}`);
  }
};
$("#homeLink").onclick = (e) => {
  e.preventDefault();
  if (!confirm("Выйти из комнаты? Вернуться можно по коду " + state.code)) return;
  LS.set("room", null);
  stopPolling();
  state.room = null;
  history.replaceState(null, "", "/");
  show("landing");
};

// ---------- Вход ----------
$("#nameInput").value = LS.get("name", "");
$("#createForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#nameInput").value.trim();
  if (!name) return;
  LS.set("name", name);
  const btn = e.submitter || e.target.querySelector("button");
  btn.disabled = true;
  try {
    const { code } = await api("/api/rooms", { body: { name, member: ME } });
    enterRoom(await api(`/api/room?code=${code}`));
    toast("Комната создана. Нажмите на код, чтобы пригласить друга");
  } catch (err) { toast(err.message); }
  btn.disabled = false;
});
$("#joinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("#codeInput").value.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) return toast("Код состоит из 6 букв и цифр");
  history.replaceState(null, "", `/?r=${code}`);
  boot();
});
$("#joinNameForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#joinNameInput").value.trim();
  if (!name) return;
  LS.set("name", name);
  try {
    enterRoom(await act({ action: "join", name }));
    toast("Вы в комнате");
  } catch (err) { toast(err.message); }
});

// ---------- Синхронизация с другом ----------
let pollTimer = null;
async function refresh() {
  if (!state.code || document.hidden) return;
  try {
    const room = await api(`/api/room?code=${state.code}`);
    if (JSON.stringify(room) !== JSON.stringify(state.room)) {
      state.room = room;
      render();
      if ($("#sheet").open) renderSheet();
      if (!$("#resultsWrap").hidden && state.results.length) renderResults();
    }
  } catch {}
}
function startPolling() { stopPolling(); pollTimer = setInterval(refresh, 8000); }
function stopPolling() { clearInterval(pollTimer); }
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

boot();

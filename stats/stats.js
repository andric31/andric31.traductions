"use strict";

/* =========================
   Config / helpers (comme viewer)
========================= */

const DEFAULT_URL = "https://raw.githubusercontent.com/andric31/f95list/main/f95list.json";

function getListUrl() {
  try {
    const p = new URLSearchParams(location.search);
    const src = (p.get("src") || "").trim();
    if (src) return src;
  } catch {}
  try {
    return (localStorage.getItem("f95listUrl") || "").trim() || DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

function extractGames(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const candidates = ["games", "list", "items", "data", "rows", "results"];
  for (const k of candidates) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  // fallback : si objet avec valeurs
  const vals = Object.values(raw);
  if (vals.length && vals.every(v => v && typeof v === "object")) return vals;
  return [];
}

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function norm(s) {
  return String(s || "").toLowerCase();
}

function pickTitle(g) {
  return String(g.cleanTitle || g.title || g.name || "").trim();
}

function pickTags(g) {
  const t = g.tags;
  if (Array.isArray(t)) return t.map(x => String(x || "").trim()).filter(Boolean);
  if (typeof t === "string") return t.split(",").map(x => x.trim()).filter(Boolean);
  return [];
}

async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

/* =========================
   Data loading
========================= */

async function loadAll() {
  const listUrl = getListUrl();

  // 1) f95list
  const raw = await fetchJson(listUrl);
  const games = extractGames(raw)
    .filter(g => g && (g.id || g.uid))
    .map(g => ({
      id: String(g.id || "").trim(),
      uid: String(g.uid || "").trim(),
      url: String(g.url || "").trim(),
      title: pickTitle(g),
      tags: pickTags(g),
      raw: g,
    }));

  // 2) stats D1
  const ids = games.map(g => g.id).filter(Boolean);

  // chunk côté client (évite requête trop grosse)
  const CHUNK = 500;
  const statsMap = {};
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = ids.slice(i, i + CHUNK);
    const resp = await fetch("/api/counters", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: batch }),
    });
    const data = await resp.json().catch(() => ({}));
    if (data && data.ok && data.stats) {
      Object.assign(statsMap, data.stats);
    }
  }

  // merge
  const rows = games.map(g => {
    const s = statsMap[g.id] || { views: 0, mega: 0, likes: 0 };
    return {
      ...g,
      views: safeNum(s.views),
      mega: safeNum(s.mega),
      likes: safeNum(s.likes),
    };
  });

  return { listUrl, rows };
}

/* =========================
   UI
========================= */

const els = {
  metric: document.getElementById("metric"),
  dir: document.getElementById("dir"),
  topn: document.getElementById("topn"),
  q: document.getElementById("q"),
  refresh: document.getElementById("refresh"),
  csv: document.getElementById("csv"),
  tbody: document.getElementById("rows"),
  canvas: document.getElementById("chart"),
  meta: document.getElementById("meta"),
  status: document.getElementById("status"),
  status2: document.getElementById("status2"),
};

let ALL = [];
let LIST_URL = "";

function setStatus(msg) {
  els.status.innerHTML = `<span class="dot"></span><span>${msg}</span>`;
}
function setStatus2(msg) {
  els.status2.textContent = msg || "";
}

function getMetric() {
  return String(els.metric.value || "views");
}
function getDir() {
  return String(els.dir.value || "desc");
}
function getTopN() {
  const n = parseInt(els.topn.value || "20", 10);
  return Number.isFinite(n) ? n : 20;
}

function filterRows(rows) {
  const q = norm(els.q.value || "");
  if (!q) return rows;

  return rows.filter(r => {
    const hay = [
      r.title,
      r.id,
      r.uid,
      (r.tags || []).join(" "),
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function sortRows(rows) {
  const key = getMetric();
  const dir = getDir();
  const mul = dir === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    const da = safeNum(a[key]);
    const db = safeNum(b[key]);
    if (db !== da) return (db - da) * mul;
    // fallback stable
    return (a.title || "").localeCompare(b.title || "");
  });
}

function renderTable(rows) {
  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.className = "nameCell";
    const a = document.createElement("a");
    a.className = "rowLink";
    a.href = r.url ? `/game/?id=${encodeURIComponent(r.id)}&src=${encodeURIComponent(LIST_URL)}` : "#";
    a.textContent = r.title || `(id ${r.id})`;
    a.title = r.tags?.length ? r.tags.join(", ") : "";
    tdName.appendChild(a);

    const tdV = document.createElement("td");
    tdV.className = "num";
    tdV.textContent = String(r.views);

    const tdM = document.createElement("td");
    tdM.className = "num";
    tdM.textContent = String(r.mega);

    const tdL = document.createElement("td");
    tdL.className = "num";
    tdL.textContent = String(r.likes);

    tr.appendChild(tdName);
    tr.appendChild(tdV);
    tr.appendChild(tdM);
    tr.appendChild(tdL);

    frag.appendChild(tr);
  }

  els.tbody.innerHTML = "";
  els.tbody.appendChild(frag);
}

function renderMeta(filteredCount) {
  const total = ALL.length;
  const key = getMetric();
  const topN = getTopN();
  const dir = getDir() === "asc" ? "croissant" : "décroissant";

  const sumViews = ALL.reduce((a, r) => a + r.views, 0);
  const sumMega  = ALL.reduce((a, r) => a + r.mega, 0);
  const sumLikes = ALL.reduce((a, r) => a + r.likes, 0);

  els.meta.innerHTML = `
    <span>Source: <b>${escapeHtml(shortUrl(LIST_URL))}</b></span>
    <span>•</span>
    <span>Jeux: <b>${filteredCount}</b> / ${total}</span>
    <span>•</span>
    <span>Tri: <b>${labelMetric(key)}</b> (${dir})</span>
    <span>•</span>
    <span>Top: <b>${topN}</b></span>
    <span>•</span>
    <span>Total vues: <b>${sumViews}</b></span>
    <span>•</span>
    <span>Total MEGA: <b>${sumMega}</b></span>
    <span>•</span>
    <span>Total likes: <b>${sumLikes}</b></span>
  `;
}

function labelMetric(k){
  if (k === "mega") return "MEGA";
  if (k === "likes") return "Likes";
  return "Vues";
}

function shortUrl(u){
  try{
    const url = new URL(u);
    if (url.hostname.includes("raw.githubusercontent.com")) return "GitHub raw";
    return url.hostname;
  }catch{
    return u || "";
  }
}

function escapeHtml(s){
  return String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* =========================
   Simple bar chart (canvas)
========================= */

function drawChart(rows) {
  const canvas = els.canvas;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // adapt DPI
  const cssW = canvas.clientWidth || 900;
  const cssH = canvas.clientHeight || 320;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // clear
  ctx.clearRect(0, 0, cssW, cssH);

  const key = getMetric();
  const topN = getTopN();
  const data = rows.slice(0, topN);

  // padding
  const pad = { l: 54, r: 12, t: 12, b: 30 };
  const w = cssW - pad.l - pad.r;
  const h = cssH - pad.t - pad.b;

  // max
  const maxV = Math.max(1, ...data.map(r => safeNum(r[key])));

  // grid lines
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;

  const gridN = 4;
  ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted") || "#aab2c8";
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--border") || "#23283b";

  for (let i = 0; i <= gridN; i++) {
    const y = pad.t + (h * i / gridN);
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + w, y);
    ctx.stroke();

    const val = Math.round(maxV * (1 - i / gridN));
    ctx.fillText(String(val), 8, y + 4);
  }

  // bars
  const gap = 4;
  const bw = Math.max(6, (w - gap * (data.length - 1)) / Math.max(1, data.length));
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--primary") || "#5aa2ff";

  data.forEach((r, i) => {
    const v = safeNum(r[key]);
    const bh = Math.round((v / maxV) * h);
    const x = pad.l + i * (bw + gap);
    const y = pad.t + (h - bh);
    ctx.fillRect(x, y, bw, bh);
  });

  // labels (x) : on n'affiche pas tous, sinon illisible
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted") || "#aab2c8";
  const step = data.length <= 20 ? 2 : data.length <= 50 ? 5 : 10;

  for (let i = 0; i < data.length; i += step) {
    const r = data[i];
    const x = pad.l + i * (bw + gap) + 2;
    const label = (r.title || "").slice(0, 12);
    ctx.save();
    ctx.translate(x, pad.t + h + 18);
    ctx.rotate(-0.35);
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  // title
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--fg") || "#e8eaf0";
  ctx.font = "700 13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText(`${labelMetric(key)} — Top ${topN}`, pad.l, 14);
}

/* =========================
   Export CSV
========================= */

function downloadCSV(rows) {
  const header = ["id", "title", "views", "mega", "likes", "url", "tags"].join(";");
  const lines = rows.map(r => [
    csvCell(r.id),
    csvCell(r.title),
    csvCell(r.views),
    csvCell(r.mega),
    csvCell(r.likes),
    csvCell(r.url),
    csvCell((r.tags || []).join(",")),
  ].join(";"));

  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "stats_f95list.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

function csvCell(v) {
  const s = String(v ?? "");
  // on évite les ; et les retours ligne
  return '"' + s.replaceAll('"', '""').replaceAll("\n", " ").replaceAll("\r", " ").replaceAll(";", ",") + '"';
}

/* =========================
   Main
========================= */

function rerender() {
  const filtered = filterRows(ALL);
  const sorted = sortRows(filtered);

  renderMeta(filtered.length);
  renderTable(sorted);
  drawChart(sorted);

  setStatus2(`${filtered.length} jeu(x) affiché(s)`);
}

async function refresh() {
  setStatus("Chargement…");
  setStatus2("");

  try {
    const { listUrl, rows } = await loadAll();
    LIST_URL = listUrl;
    ALL = rows;

    setStatus("OK");
    rerender();
  } catch (e) {
    console.error(e);
    setStatus(`Erreur: ${String(e?.message || e)}`);
  }
}

els.metric.addEventListener("change", rerender);
els.dir.addEventListener("change", rerender);
els.topn.addEventListener("change", rerender);
els.q.addEventListener("input", () => {
  // petit debounce
  window.clearTimeout(window.__q_t);
  window.__q_t = window.setTimeout(rerender, 80);
});
els.refresh.addEventListener("click", refresh);
els.csv.addEventListener("click", () => downloadCSV(sortRows(filterRows(ALL))));

window.addEventListener("resize", () => {
  window.clearTimeout(window.__rs_t);
  window.__rs_t = window.setTimeout(() => drawChart(sortRows(filterRows(ALL))), 120);
});

refresh();

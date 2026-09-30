import { DEMO_HITS, UNDER_FIVE, summarizeStats } from "./stats-report.js";

const TOKEN_KEY = "advent2026.goatcounterToken";
const root = document.querySelector("#stats-root");

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function table(title, items, nameOf) {
  const body = items.length
    ? items
        .map(
          (item) => `<tr><td>${esc(nameOf(item))}</td><td>${esc(item.label)}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="2">沒有數字</td></tr>`;
  return `<section><h2>${esc(title)}</h2><table><tbody>${body}</tbody></table></section>`;
}

function renderReport(report, names, note) {
  root.querySelector("[data-report]").innerHTML = `
    <p class="stats-note">${esc(note)}</p>
    ${table("每日打開", report.opens, (item) => item.key)}
    ${table("每日完成讀經", report.completes, (item) => item.key)}
    ${table("核心情緒", report.cores, (item) => names.cores.get(item.key) || item.key)}
    ${table("細分感受", report.feelings, (item) => names.feelings.get(item.key) || item.key)}
    ${table("強度", report.intensities, (item) => `強度 ${item.key}`)}
    <p class="stats-note">細分感受或強度少於 5 時顯示「${UNDER_FIVE}」。核心情緒、打開次數和完成次數仍顯示數字。</p>
  `;
}

async function namesFromFeelings() {
  const cores = new Map();
  const feelings = new Map();
  try {
    const response = await fetch("./data/feelings.json");
    const data = await response.json();
    for (const core of data.cores || []) {
      cores.set(core.id, core.zh);
      for (const feeling of core.feelings || []) {
        const slug = String(feeling.en || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_]/g, "");
        if (slug) feelings.set(slug, feeling.zh);
      }
    }
  } catch {
    /* names fall back to the stored slug */
  }
  return { cores, feelings };
}

async function loadHits(token, site) {
  const hits = [];
  const excluded = [];
  for (let page = 0; page < 30; page += 1) {
    const url = new URL(`https://${site}.goatcounter.com/api/v0/stats/hits`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("path_by_name", "true");
    url.searchParams.set("start", "2026-11-01T00:00:00Z");
    url.searchParams.set("end", "2026-12-31T23:00:00Z");
    for (const path of excluded) url.searchParams.append("exclude_paths", path);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `GoatCounter 回應 ${response.status}`);
    }
    const batch = data.hits || [];
    hits.push(...batch);
    if (!data.more || !batch.length) break;
    for (const hit of batch) excluded.push(String(hit.path || "").replace(/^\/+/, ""));
  }
  return hits;
}

const names = await namesFromFeelings();
const demo = new URLSearchParams(location.search).get("demo") === "1";
const tokenInput = root.querySelector("[data-token]");
const status = root.querySelector("[data-status]");
try {
  tokenInput.value = localStorage.getItem(TOKEN_KEY) || "";
} catch {
  /* private mode */
}

async function showDemo() {
  status.textContent = "以下是示例數字，不是教會的真實統計。";
  renderReport(summarizeStats(DEMO_HITS), names, "示例");
}

async function showLive() {
  const token = tokenInput.value.trim();
  const site = String(window.ADVENT_CONFIG?.goatcounter || "").trim();
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode */
  }
  if (!token) {
    status.textContent = "請先貼上 GoatCounter API token。Token 只存在這部裝置。";
    return;
  }
  if (!site || site.startsWith("http")) {
    status.textContent = "config.js 的 goatcounter 需要是網站代碼，例如 lohasshek。";
    return;
  }
  status.textContent = "正在讀取……";
  try {
    const hits = await loadHits(token, site);
    status.textContent = "已從 GoatCounter 讀取。";
    renderReport(summarizeStats(hits), names, "GoatCounter");
  } catch (error) {
    status.textContent = error?.message || "讀取失敗";
  }
}

root.querySelector("[data-demo]").addEventListener("click", showDemo);
root.querySelector("[data-load]").addEventListener("click", showLive);
if (demo) showDemo();

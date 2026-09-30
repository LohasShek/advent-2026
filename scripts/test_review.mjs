import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright";
import { passageHtml } from "../js/logic.js";

const root = new URL("..", import.meta.url).pathname;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".webmanifest": "application/manifest+json",
};
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^\/+/, "");
  if (relative.includes("..")) {
    response.writeHead(400);
    response.end();
    return;
  }
  try {
    const body = readFileSync(join(root, relative));
    response.writeHead(200, { "content-type": types[extname(relative)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;
const plan = JSON.parse(readFileSync(new URL("../data/plan.json", import.meta.url), "utf8"));
const sections = [];
for (const edition of ["shen", "shangdi"]) {
  for (const day of plan.days) {
    sections.push(
      `<section data-day="${day.day}" data-edition="${edition}">${passageHtml(day.passage[edition], day.segments[edition], [], edition)}</section>`
    );
  }
}
const markup = `<!DOCTYPE html><html lang="zh-Hant"><head><link rel="stylesheet" href="${base}/css/styles.css"></head><body><div class="app"><main><article class="day"><div class="card reading">${sections.join("")}</div></article></main></div></body></html>`;

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const widths = [390, 360, 412];
const failures = [];
const heightChanges = [];
let measured = 0;
const page = await browser.newPage();
await page.route(/goatcounter\.com|zgo\.at/i, (route) => route.abort());

for (const width of widths) {
  await page.setViewportSize({ width, height: 844 });
  await page.setContent(markup, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const verse = document.querySelector(".verse");
    if (!verse) return false;
    return parseFloat(getComputedStyle(verse).lineHeight) > 20;
  });
  await page.evaluate(() => document.fonts?.ready);
  const result = await page.evaluate(() => {
    const linesOf = (verse) => {
      const visual = verse.querySelector(".verse-visual") || verse;
      const range = document.createRange();
      range.selectNodeContents(visual);
      const tops = [];
      for (const rect of range.getClientRects()) {
        if (rect.height < 2) continue;
        if (!tops.some((top) => Math.abs(top - rect.top) < 3)) tops.push(rect.top);
      }
      return tops.length;
    };
    const bad = [];
    let count = 0;
    let heightChanged = 0;
    let linesChanged = 0;
    for (const verse of document.querySelectorAll("p.verse")) {
      const beforeHeight = verse.getBoundingClientRect().height;
      const beforeLines = linesOf(verse);
      verse.classList.add("is-speaking");
      const afterHeight = verse.getBoundingClientRect().height;
      const afterLines = linesOf(verse);
      if (Math.abs(afterHeight - beforeHeight) >= 0.5) heightChanged += 1;
      if (afterLines !== beforeLines) linesChanged += 1;
      const num = verse.querySelector(".vnum");
      if (!num) {
        bad.push("missing vnum");
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(num);
      const ink = range.getBoundingClientRect();
      const box = ink.width > 0 && ink.height > 0 ? ink : num.getBoundingClientRect();
      const frame = verse.getBoundingClientRect();
      count += 1;
      const clearOfBar = box.left >= frame.left + 3 - 0.4;
      const inside =
        box.top >= frame.top - 0.4 &&
        box.bottom <= frame.bottom + 0.4 &&
        box.right <= frame.right + 0.4 &&
        clearOfBar;
      if (!inside) {
        bad.push({
          verse: verse.dataset.verse,
          day: verse.closest("section")?.dataset.day,
          edition: verse.closest("section")?.dataset.edition,
          top: Math.round((box.top - frame.top) * 10) / 10,
          left: Math.round((box.left - frame.left) * 10) / 10,
          right: Math.round((frame.right - box.right) * 10) / 10,
          bottom: Math.round((frame.bottom - box.bottom) * 10) / 10,
        });
      }
    }
    return { count, bad, heightChanged, linesChanged };
  });
  measured = result.count;
  heightChanges.push({ width, heightChanged: result.heightChanged, linesChanged: result.linesChanged });
  assert.equal(result.heightChanged, 0, `${width}px height changes`);
  assert.equal(result.linesChanged, 0, `${width}px line changes`);
  if (result.bad.length) failures.push({ width, bad: result.bad.slice(0, 8), total: result.bad.length });
  if (width === 390) {
    const day19 = await page.evaluate(() => {
      const section = document.querySelector("section[data-day='19'][data-edition='shen']");
      return {
        tabs: section.querySelectorAll("[tabindex='0']").length,
        verses: section.querySelectorAll("p.verse").length,
        wordButtons: section.querySelectorAll("[role='button']").length,
        unread: section.innerText.includes("未圈選"),
      };
    });
    assert.equal(day19.tabs, day19.verses);
    assert.equal(day19.wordButtons, 0);
    assert.equal(day19.unread, false);
    assert.ok(day19.verses < 40 && day19.verses > 0);
  }
  const shot = `/tmp/verse-highlight-day1-v2-${width}.png`;
  const verse = page.locator("section[data-day='1'][data-edition='shen'] [data-verse='2']");
  await verse.screenshot({ path: shot });
  await mkdir("/opt/cursor/artifacts/screenshots", { recursive: true });
  await copyFile(shot, `/opt/cursor/artifacts/screenshots/verse-highlight-day1-v2-${width}.png`);
}
assert.equal(measured, 492);
assert.deepEqual(failures, []);

await page.setViewportSize({ width: 390, height: 844 });
await page.addInitScript(() => {
  localStorage.setItem(
    "advent2026.v1",
    JSON.stringify({
      edition: "shen",
      shareFeelings: false,
      days: { 1: { reached: "before", words: [], before: null, after: null } },
    })
  );
});
await page.goto(`${base}/?asof=2026-11-29#/day/1/before`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("article h1");
await page.locator("[data-action='pick-core']").first().click();
await page.waitForSelector("[data-action='pick-feeling']");
assert.equal(await page.evaluate(() => document.activeElement?.dataset?.action), "pick-feeling");
await page.locator("[data-action='pick-feeling']").first().click();
assert.equal(await page.evaluate(() => document.activeElement?.dataset?.action), "pick-intensity");
const level = await page.evaluate(() => document.querySelector("[data-action='pick-intensity']")?.dataset.level);
await page.locator(`[data-action='pick-intensity'][data-level='${level}']`).click();
const stayed = await page.evaluate(() => ({
  action: document.activeElement?.dataset?.action,
  level: document.activeElement?.dataset?.level,
}));
assert.equal(stayed.action, "pick-intensity");
assert.equal(stayed.level, level);

await page.locator("[data-action='bgm-panel']").click();
const bgmName = await page.locator("[data-setting='bgm']").getAttribute("aria-label");
assert.match(bgmName, /背景音樂/);
await page.locator("[data-setting='bgm']").click({ force: true });
assert.equal(await page.evaluate(() => document.activeElement?.dataset?.setting), "bgm");
await page.keyboard.press("Escape");
assert.equal(await page.evaluate(() => document.activeElement?.dataset?.action), "bgm-panel");
assert.equal(await page.locator("#bgm-panel").getAttribute("hidden"), "");

await page.addInitScript(() => {
  const synth = window.speechSynthesis;
  if (!synth) return;
  const voices = () => [{ name: "Cantonese", lang: "zh-HK", default: true, localService: true, voiceURI: "zh-HK" }];
  try {
    Object.defineProperty(synth, "getVoices", { configurable: true, value: voices });
  } catch {
    synth.getVoices = voices;
  }
  synth.addEventListener = (type, listener, options) => {
    if (type === "voiceschanged") return undefined;
    return EventTarget.prototype.addEventListener.call(synth, type, listener, options);
  };
});
await page.goto(`${base}/?asof=2026-12-24&week=4#/about`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#music-credit");
const cardText = await page.locator("#music-credit").innerText();
assert.doesNotMatch(cardText, /https?:\/\//);
assert.doesNotMatch(cardText, /\.wav|07 /);
assert.equal(await page.locator("#music-credit dd, #music-credit dt").count(), 0);
const night = page.locator("#music-credit .bgm-credit", { hasText: "Silent Night" });
const nightText = (await night.innerText()).replace(/\s+/g, " ");
assert.match(nightText, /音樂：Silent Night，Kevin MacLeod（incompetech\.com）。已剪輯。來源頁 CC BY 3\.0/);
assert.equal((nightText.match(/CC BY 3\.0/g) || []).length, 1);
const nightLinks = night.locator("a");
assert.equal(await nightLinks.nth(0).innerText(), "來源頁");
assert.equal(await nightLinks.nth(0).getAttribute("href"), "https://commons.wikimedia.org/wiki/File:Silent_Night_(ISRC_USUAN1100075).mp3");
assert.equal(await nightLinks.nth(1).innerText(), "CC BY 3.0");
assert.equal(await nightLinks.nth(1).getAttribute("href"), "https://creativecommons.org/licenses/by/3.0/");
const cc0 = page.locator("#music-credit .bgm-credit", { hasText: "Worms Cathedral organ practice" });
const cc0Text = (await cc0.innerText()).replace(/\s+/g, " ");
assert.match(cc0Text, /音樂：Worms Cathedral organ practice，blaukreuz。來源頁 CC0 授權/);
assert.equal((cc0Text.match(/CC0/g) || []).length, 1);
assert.equal(await cc0.locator("a").nth(0).innerText(), "來源頁");
assert.equal(await cc0.locator("a").nth(1).innerText(), "CC0 授權");
assert.equal(await cc0.locator("a").nth(1).getAttribute("href"), "http://creativecommons.org/publicdomain/zero/1.0/");
assert.equal(await page.locator("#music-credit .bgm-credit").count(), 6);
const editionName = await page.locator("[data-edition='shen']").getAttribute("aria-label");
assert.equal(editionName, "神版");
assert.doesNotMatch(editionName, /✓/);
for (const width of [360, 390, 412]) {
  await page.setViewportSize({ width, height: 844 });
  const broken = await page.evaluate(() => {
    const bad = [];
    const blocks = document.querySelectorAll("#music-credit .bgm-credit");
    if (blocks.length !== 6) bad.push({ blocks: blocks.length });
    for (const link of document.querySelectorAll("#music-credit .bgm-credit a")) {
      const tops = [];
      for (const rect of link.getClientRects()) {
        if (rect.width < 1 || rect.height < 1) continue;
        if (!tops.some((top) => Math.abs(top - rect.top) < 2)) tops.push(rect.top);
      }
      if (tops.length !== 1) bad.push({ text: link.textContent, lines: tops.length });
    }
    return bad;
  });
  assert.deepEqual(broken, [], `${width}px ${JSON.stringify(broken)}`);
}
await page.setViewportSize({ width: 390, height: 844 });
await night.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
const nightBox = await night.boundingBox();
assert.ok(nightBox.y >= 0 && nightBox.y + nightBox.height <= 844);
await page.screenshot({ path: "/tmp/about-music-credits-390.png" });
await copyFile("/tmp/about-music-credits-390.png", "/opt/cursor/artifacts/screenshots/about-music-credits-390.png");

await page.locator("[data-action='bgm-panel']").click();
const volume = page.locator("[data-setting='bgm-volume']");
assert.equal(await volume.getAttribute("aria-label"), "背景音樂音量 20%");
assert.equal(await volume.getAttribute("aria-valuetext"), "背景音樂音量 20%");
const panelText = (await page.locator("#bgm-panel .bgm-credit").innerText()).replace(/\s+/g, " ");
assert.match(panelText, /音樂：Silent Night，Kevin MacLeod（incompetech\.com）。已剪輯。來源頁 CC BY 3\.0/);
assert.doesNotMatch(await page.locator("#bgm-panel").innerText(), /\.wav|07 /);
await page.locator("#bgm-panel").screenshot({ path: "/tmp/bgm-panel-390.png" });
await copyFile("/tmp/bgm-panel-390.png", "/opt/cursor/artifacts/screenshots/bgm-panel-390.png");

const bare = await browser.newPage();
await bare.addInitScript(() => {
  localStorage.setItem(
    "advent2026.v1",
    JSON.stringify({ edition: "shen", shareFeelings: false, days: { 1: { reached: "read", words: [] } } })
  );
  const synth = window.speechSynthesis;
  const voices = () => [{ name: "English", lang: "en-US", default: true, localService: true, voiceURI: "en-US" }];
  if (synth) {
    try {
      Object.defineProperty(synth, "getVoices", { configurable: true, value: voices });
    } catch {
      synth.getVoices = voices;
    }
  }
});
await bare.setViewportSize({ width: 390, height: 844 });
await bare.goto(`${base}/?asof=2026-11-29#/day/1/read`, { waitUntil: "domcontentloaded" });
await bare.waitForSelector("article h1");
assert.equal(await bare.locator("[data-speak-bar]").count(), 0);
assert.equal(await bare.locator(".speak-note").count(), 0);

await browser.close();
server.close();
console.log(`verse height unchanged: ${heightChanges.map((row) => `${row.width}px height ${row.heightChanged}, lines ${row.linesChanged}`).join("; ")}`);
console.log(`review tests passed: ${measured} verses at ${widths.join(", ")}`);

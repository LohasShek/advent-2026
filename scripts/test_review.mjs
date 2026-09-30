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
const markup = `<!DOCTYPE html><html lang="zh-Hant"><head><link rel="stylesheet" href="${base}/css/styles.css"></head><body><main>${sections.join("")}</main></body></html>`;

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const widths = [390, 360, 412];
const failures = [];
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
    const bad = [];
    let count = 0;
    for (const verse of document.querySelectorAll("p.verse")) {
      verse.classList.add("is-speaking");
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
    return { count, bad };
  });
  measured = result.count;
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

await browser.close();
server.close();
console.log(`review tests passed: ${measured} verses at ${widths.join(", ")}`);

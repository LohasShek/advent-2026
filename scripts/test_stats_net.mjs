import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium } from "playwright";

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

function watched(url) {
  return /goatcounter\.com|gc\.zgo\.at/i.test(url);
}

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(() => {
  localStorage.clear();
});
const page = await context.newPage();
const hits = [];
page.on("request", (request) => {
  if (watched(request.url())) hits.push(request.url());
});
await page.goto(`${base}/?asof=2026-11-29&week=2&bgm=b&stats=optin#/about`, { waitUntil: "domcontentloaded" });
await page.evaluate(async () => {
  const regs = await navigator.serviceWorker?.getRegistrations?.();
  for (const reg of regs || []) await reg.unregister();
});
await page.waitForSelector("article.about h1");
await page.waitForSelector("[data-setting='statsOptIn']");
await page.waitForTimeout(500);
assert.equal(hits.length, 0, `opt-in off still requested ${hits.join(" ")}`);
await page.locator("label.toggle").filter({ has: page.locator("[data-setting='shareFeelings']") }).locator("strong").click();
await page.waitForTimeout(300);
assert.equal(hits.length, 0, `share switch requested ${hits.join(" ")}`);
assert.equal(await page.locator("[data-setting='statsOptIn']").isChecked(), false);
await page.locator("label.toggle").filter({ has: page.locator("[data-setting='statsOptIn']") }).locator("strong").click();
await page.waitForTimeout(800);
assert.ok(hits.some((url) => url.includes("gc.zgo.at/count.js")), `count.js missing after opt-in: ${hits.join(" ")}`);
assert.equal(hits.some((url) => /goatcounter\.com/i.test(url)), false, `count host ${hits.join(" ")}`);
assert.equal(hits.some((url) => /feeling|asof|because|week=|bgm/i.test(url)), false);

const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
const blocked = await fresh.newPage();
const blockedHits = [];
blocked.on("request", (request) => {
  if (watched(request.url())) blockedHits.push(request.url());
});
await blocked.goto(`${base}/?stats=optin#/`, { waitUntil: "domcontentloaded" });
await blocked.waitForSelector("article h1");
await blocked.waitForTimeout(500);
assert.equal(blockedHits.length, 0, `home opt-in requested ${blockedHits.join(" ")}`);

const statsPage = await context.newPage();
await statsPage.goto(`${base}/stats.html`, { waitUntil: "domcontentloaded" });
await statsPage.waitForSelector("[data-clear]");
await statsPage.fill("[data-token]", "not-a-real-token");
await statsPage.evaluate(() => localStorage.setItem("advent2026.goatcounterToken", "not-a-real-token"));
await statsPage.click("[data-clear]");
assert.equal(await statsPage.inputValue("[data-token]"), "");
assert.equal(await statsPage.evaluate(() => localStorage.getItem("advent2026.goatcounterToken")), null);

await fresh.close();
await browser.close();
server.close();
console.log("stats network tests passed");

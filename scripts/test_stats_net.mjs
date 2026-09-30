import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
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
const journal = {
  edition: "shen",
  shareFeelings: false,
  careDismissedOn: "2026-11-29",
  days: {
    1: {
      before: { coreId: "sad", feelingZh: "孤單", feelingEn: "Lonely", intensity: 4, because: "因為不想被送出" },
      after: { coreId: "peace", feelingZh: "沉靜", feelingEn: "Content", intensity: 2, because: "寫了字句" },
      reflect1: "反思不應送出",
      reflect2: "",
      words: ["嫩枝"],
      reached: "prayer",
      completed: false,
      feelingShared: false,
      completionSent: false,
    },
  },
};

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const hits = [];
await context.route(/goatcounter\.com|zgo\.at/i, (route) => {
  const request = route.request();
  hits.push({ url: request.url(), referer: request.headers().referer || "" });
  return route.fulfill({ status: 204, body: "" });
});
await context.addInitScript((state) => {
  localStorage.setItem("advent2026.v1", JSON.stringify(state));
}, journal);
const page = await context.newPage();
page.on("dialog", (dialog) => dialog.dismiss());
await page.goto(`${base}/?asof=2026-11-29&week=2&bgm=b#/day/1/prayer`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("article h1");
const complete = page.getByRole("button", { name: "完成今天的讀經" });
await complete.click();
await page.waitForTimeout(400);
assert.equal(hits.some((hit) => /zgo\.at/i.test(hit.url)), false, hits.map((hit) => hit.url).join(" "));
const counts = hits.filter((hit) => /\/count\?/.test(hit.url));
const paths = counts.map((hit) => new URL(hit.url).searchParams.get("p"));
assert.ok(paths.includes("open"), `missing open in ${paths.join(", ")}`);
assert.ok(paths.includes("day-1-done"), `missing day-1-done in ${paths.join(", ")}`);
for (const hit of counts) {
  const params = new URL(hit.url).searchParams;
  assert.deepEqual([...params.keys()], ["p", "t", "e", "rnd"]);
  assert.match(params.get("p"), /^(open|day-(?:[1-9]|1\d|2[0-7])-done)$/);
  assert.equal(params.get("t"), params.get("p"));
  assert.match(params.get("rnd"), /^[a-z0-9]+$/);
  assert.equal(hit.referer, "", hit.url);
  assert.equal(/asof|week|bgm|because|孤單|因為|反思|嫩枝/.test(hit.url), false, hit.url);
}
assert.equal(paths.some((path) => path.startsWith("feeling")), false, paths.join(", "));
assert.equal(await page.locator("[data-setting='shareFeelings']").count(), 0);

await page.goto(`${base}/?asof=2026-11-29#/about`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("article.about h1");
const about = await page.locator("article.about").innerText();
assert.match(about, /我們只計算打開頁面和完成讀經的次數，不會收集或儲存你的個人資料。/);
const share = page.locator("[data-setting='shareFeelings']");
assert.equal(await share.isChecked(), false);
const more = hits.filter((hit) => /\/count\?/.test(hit.url)).map((hit) => new URL(hit.url).searchParams.get("p"));
assert.equal(more.some((path) => String(path).startsWith("feeling")), false);
await page.locator("article.about .card", { hasText: "匿名統計" }).screenshot({
  path: "/tmp/about-stats-plain-390.png",
});
await mkdir("/opt/cursor/artifacts/screenshots", { recursive: true });
await copyFile("/tmp/about-stats-plain-390.png", "/opt/cursor/artifacts/screenshots/about-stats-plain-390.png");

const statsPage = await context.newPage();
await statsPage.goto(`${base}/stats.html`, { waitUntil: "domcontentloaded" });
await statsPage.fill("[data-token]", "not-a-real-token");
await statsPage.evaluate(() => localStorage.setItem("advent2026.goatcounterToken", "not-a-real-token"));
await statsPage.click("[data-clear]");
assert.equal(await statsPage.inputValue("[data-token]"), "");
assert.equal(await statsPage.evaluate(() => localStorage.getItem("advent2026.goatcounterToken")), null);

assert.equal(hits.some((hit) => /zgo\.at/i.test(hit.url)), false);
for (const hit of hits) {
  const params = new URL(hit.url).searchParams;
  assert.deepEqual([...params.keys()].sort(), ["e", "p", "rnd", "t"]);
  assert.equal(hit.referer, "", hit.url);
}
await browser.close();
server.close();
console.log(`stats network example: ${counts[0]?.url}`);
console.log(`stats network tests passed: ${paths.join(", ")}`);

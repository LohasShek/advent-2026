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

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.route(/goatcounter\.com|zgo\.at/i, (route) => route.abort());
await page.addInitScript(() => {
  localStorage.setItem(
    "advent2026.v1",
    JSON.stringify({ edition: "shen", shareFeelings: false, careDismissedOn: "2026-11-29", days: {} })
  );
});

const screens = [
  ["home", "/?asof=2026-11-01#/"],
  ["quiet", "/?asof=2026-11-29#/day/1/quiet"],
  ["read", "/?asof=2026-11-29#/day/1/read"],
  ["about", "/?asof=2026-11-29#/about"],
  ["before", "/?asof=2026-11-29#/day/1/before"],
];

function scan() {
  const parse = (value) => {
    const match = String(value || "").match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(",").map((part) => Number(part.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const channel = (value) => {
    const x = value / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const lum = (color) => 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
  const over = (fg, bg) => {
    const alpha = fg.a + bg.a * (1 - fg.a);
    if (alpha <= 0) return bg;
    const mix = (a, b) => (a * fg.a + b * bg.a * (1 - fg.a)) / alpha;
    return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: alpha };
  };
  const backgroundOf = (el) => {
    const chain = [];
    for (let node = el; node; node = node.parentElement) chain.push(node);
    let bg = { r: 250, g: 246, b: 239, a: 1 };
    for (const node of chain.reverse()) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (color && color.a > 0) bg = over(color, bg);
    }
    return bg;
  };
  const failures = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const text = [...el.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join("").trim();
    if (!text) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    let opacity = 1;
    for (let node = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity || 1);
    const fg = parse(style.color);
    if (!fg) continue;
    const bg = backgroundOf(el);
    const visible = over({ r: fg.r, g: fg.g, b: fg.b, a: fg.a * opacity }, bg);
    const ratio = (Math.max(lum(visible), lum(bg)) + 0.05) / (Math.min(lum(visible), lum(bg)) + 0.05);
    const key = `${style.color}|${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)}|${text.slice(0, 24)}`;
    if (ratio < 4.5 - 0.02 && !seen.has(key)) {
      seen.add(key);
      failures.push({
        ratio: Math.round(ratio * 100) / 100,
        text: text.slice(0, 40),
        color: style.color,
        background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
      });
    }
  }
  return failures;
}

const all = [];
let quietButton = null;
for (const [name, path] of screens) {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("article h1");
  if (name === "quiet") {
    quietButton = await page.evaluate(() => {
      const probe = document.createElement("button");
      probe.type = "button";
      probe.className = "btn ghost";
      probe.disabled = true;
      probe.textContent = "略過";
      probe.dataset.contrastProbe = "ghost";
      document.querySelector("article").append(probe);
      const parse = (value) => {
        const match = String(value || "").match(/rgba?\(([^)]+)\)/);
        const parts = match[1].split(",").map((part) => Number(part.trim()));
        return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
      };
      const channel = (value) => {
        const x = value / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      const lum = (color) => 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
      const paper = { r: 250, g: 246, b: 239, a: 1 };
      const ratioOf = (el) => {
        const style = getComputedStyle(el);
        const fg = parse(style.color);
        const raw = parse(style.backgroundColor);
        const bg = raw && raw.a > 0.9 ? raw : paper;
        return (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05);
      };
      return {
        solid: Math.round(ratioOf(document.querySelector("#quiet-next")) * 100) / 100,
        ghost: Math.round(ratioOf(probe) * 100) / 100,
      };
    });
  }
  const found = await page.evaluate(scan);
  if (found.length) all.push({ name, found });
}
assert.ok(quietButton.solid >= 4.5, `disabled button ${quietButton.solid}`);
assert.ok(quietButton.ghost >= 4.5, `ghost disabled ${quietButton.ghost}`);
assert.deepEqual(all, []);

await browser.close();
server.close();
console.log(`contrast tests passed: disabled ${quietButton.solid}:1, ghost disabled ${quietButton.ghost}:1`);

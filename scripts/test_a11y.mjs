import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const plan = JSON.parse(readFileSync(new URL("../data/plan.json", import.meta.url), "utf8"));
const root = new URL("..", import.meta.url).pathname;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
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

const journal = { edition: "shen", shareFeelings: false, careDismissedOn: "", days: {} };
for (const day of plan.days) {
  journal.days[String(day.day)] = {
    before: null,
    after: null,
    draftBefore: null,
    draftAfter: null,
    reflect1: "",
    reflect2: "",
    completed: false,
    reached: "prayer",
    feelingShared: false,
    completionSent: false,
    words: [],
  };
}

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
await context.addInitScript(() => {
  const voice = { name: "Cantonese", lang: "zh-HK", localService: true, default: true, voiceURI: "zh-HK" };
  const synth = window.speechSynthesis;
  if (!synth) return;
  const voices = () => [voice];
  try {
    Object.defineProperty(synth, "getVoices", { configurable: true, value: voices });
  } catch {
    synth.getVoices = voices;
  }
  synth.speak = (utter) => utter?.onstart?.();
  synth.cancel = () => {};
  synth.pause = () => {};
  synth.resume = () => {};
});

async function openScreen(path, asof) {
  await page.goto(`${base}/?boot=${encodeURIComponent(path)}&asof=${asof}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async (state) => {
    localStorage.setItem("advent2026.v1", JSON.stringify(state));
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  }, journal);
  await page.goto(`${base}/?asof=${asof}#${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("article h1", { timeout: 15000 });
}

const screens = [
  { name: "home", path: "/", asof: "2026-11-01" },
  { name: "plan", path: "/plan", asof: "2026-11-29" },
  { name: "about", path: "/about", asof: "2026-11-29" },
];
for (const day of plan.days) {
  screens.push({ name: `day-${day.day}-read`, path: `/day/${day.day}/read`, asof: day.date });
}
screens.push(
  { name: "day-1-quiet", path: "/day/1/quiet", asof: "2026-11-29" },
  { name: "day-1-before", path: "/day/1/before", asof: "2026-11-29" },
  { name: "day-1-reflect", path: "/day/1/reflect", asof: "2026-11-29" },
  { name: "day-1-prayer", path: "/day/1/prayer", asof: "2026-11-29" },
  { name: "day-8-review", path: "/day/8/review", asof: "2026-12-06" },
  { name: "day-27-review", path: "/day/27/review", asof: "2026-12-25" }
);

const failures = [];
for (const screen of screens) {
  await openScreen(screen.path, screen.asof);
  const result = await new AxeBuilder({ page }).analyze();
  const bad = result.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
  if (bad.length) failures.push({ name: screen.name, bad });
  console.log(`${screen.name}: ${bad.length} serious/critical`);
}

await browser.close();
server.close();

const lines = failures.flatMap((screen) =>
  screen.bad.flatMap((item) => [
    `${screen.name} [${item.impact}] ${item.id}: ${item.help}`,
    ...item.nodes.slice(0, 3).map((node) => `  ${node.target.join(" ")} ${node.html.slice(0, 180)}`),
  ])
);
const summary = lines.length ? lines.join("\n") : `已檢查 ${screens.length} 個畫面，沒有 serious 或 critical。`;
await mkdir("/opt/cursor/artifacts", { recursive: true });
await writeFile("/opt/cursor/artifacts/axe-summary.txt", summary);
console.log(summary);
assert.equal(failures.length, 0, summary);

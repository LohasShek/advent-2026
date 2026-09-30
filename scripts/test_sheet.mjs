import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseCsv } from "../js/csv.js";
import {
  SHEET_CACHE_KEY,
  SHEET_TABS,
  applySheetCache,
  gvizUrl,
  loadSheetCache,
  parseFeelingsCsv,
  parseGuideCsv,
  parsePrayerCsv,
  parseScriptureCsv,
  refreshFromSheet,
  saveSheetCache,
} from "../js/sheet.js";

const root = new URL("../", import.meta.url);
const scriptureCsv = readFileSync(new URL("content/將臨期每日經文_v2.csv", root), "utf8");
const guideCsv = readFileSync(new URL("content/將臨期每日情感引導_v2.csv", root), "utf8");
const feelingsCsv = readFileSync(new URL("content/感受之輪詞彙_v2.csv", root), "utf8");
const plan = JSON.parse(readFileSync(new URL("data/plan.json", root), "utf8"));
const feelings = JSON.parse(readFileSync(new URL("data/feelings.json", root), "utf8"));
const config = readFileSync(new URL("config.js", root), "utf8");
const pages = readFileSync(new URL(".github/workflows/pages.yml", root), "utf8");
const syncWorkflow = readFileSync(new URL(".github/workflows/sync-sheet.yml", root), "utf8");

function memoryStorage(seed) {
  const data = { ...seed };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
  };
}

function responseFor(body, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    async text() {
      return body;
    },
  };
}

function fetchByTab(bodies) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const tab = decodeURIComponent(new URL(url).searchParams.get("sheet"));
    const body = bodies[tab];
    if (body instanceof Error) throw body;
    if (body && body.httpError) return responseFor(body.text || "", false);
    return responseFor(body);
  };
  return { fetchImpl, calls };
}

const quoted = parseCsv('欄,內容\n"你好，世界\n第二行","甲,乙"\n');
assert.deepEqual(quoted, [
  ["欄", "內容"],
  ["你好，世界\n第二行", "甲,乙"],
]);

const parsedDays = parseScriptureCsv(scriptureCsv);
assert.equal(parsedDays.length, 27);
for (const day of plan.days) {
  const parsed = parsedDays.find((item) => item.day === day.day);
  assert.equal(parsed.date, day.date);
  assert.equal(parsed.title, day.title);
  assert.equal(parsed.reference, day.reference);
  assert.equal(parsed.passage.shen, day.passage.shen);
  assert.equal(parsed.passage.shangdi, day.passage.shangdi);
  assert.equal(parsed.segments.shen, day.segments.shen);
  assert.equal(parsed.segments.shangdi, day.segments.shangdi);
}

const segmentRows = parseCsv(scriptureCsv);
segmentRows[0].push("分詞（神版）", "分詞（上帝版）");
segmentRows[1].push("不｜相符", "不｜相符");
const segmentCsv = segmentRows
  .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
  .join("\n");
const withSegments = parseScriptureCsv(segmentCsv);
assert.equal(withSegments[0].segments.shen, "不｜相符");
assert.equal(withSegments[1].segments.shen, "");
assert.equal(withSegments[0].passage.shen, parsedDays[0].passage.shen);

const prayerCsv = readFileSync(new URL("content/禱文框架.csv", root), "utf8");
const prayerFrames = parsePrayerCsv(prayerCsv);
assert.deepEqual(plan.prayerFrames, prayerFrames);
const sheetPrayers = prayerCsv.replace("字詞觸動", "字詞觸動試");

const parsedGuide = parseGuideCsv(guideCsv);
assert.equal(parsedGuide[1].openingPrayer, plan.days[1].openingPrayer);
assert.deepEqual(
  parsedGuide.filter((day) => day.experience).map((day) => day.day),
  plan.days.filter((day) => day.experience).map((day) => day.day)
);
assert.equal(parsedGuide[3].experience, plan.days[3].experience);
assert.equal(parsedGuide[7].review.scope, "week");
assert.equal(parsedGuide[26].review.scope, "season");

const parsedFeelings = parseFeelingsCsv(feelingsCsv);
assert.equal(parsedFeelings.cores.length, 6);
assert.deepEqual(
  parsedFeelings.cores.map((core) => core.id),
  feelings.cores.map((core) => core.id)
);
assert.equal(parsedFeelings.cores[0].feelings[0].zh, "興奮");
assert.equal(parsedFeelings.care.template, feelings.care.template);
assert.equal(parsedFeelings.care.contact, "歡迎聯絡石守賢傳道");
assert.equal(parsedFeelings.care.consecutiveDays, 3);
assert.match(parsedFeelings.care.template, /\{churchContact\}/);
assert.match(parsedFeelings.care.template, /18288/);
assert.equal(parsedFeelings.care.template.includes("如有即時"), false);

assert.equal(
  gvizUrl("abc", "經文"),
  "https://docs.google.com/spreadsheets/d/abc/gviz/tq?tqx=out:csv&sheet=%E7%B6%93%E6%96%87"
);
assert.match(gvizUrl("a/b", "每日引導"), /\/a%2Fb\/gviz/);

const idle = await refreshFromSheet({
  sheetId: "",
  bundledPlan: plan,
  bundledFeelings: feelings,
  fetchImpl: () => {
    throw new Error("不應下載");
  },
});
assert.equal(idle.fetched, false);
assert.equal(idle.plan.days[1].title, "願你破天而降");

const titled = scriptureCsv.replace('"願你破天而降","經文"', '"願你破天而降（試算表）","經文"');
const labeled = feelingsCsv.replace('"喜樂","Joyful","興奮","Excited","1"', '"喜樂","Joyful","興奮試","Excited","1"');
const successFetch = fetchByTab({
  [SHEET_TABS.scripture]: titled,
  [SHEET_TABS.guide]: guideCsv,
  [SHEET_TABS.feelings]: labeled,
  [SHEET_TABS.prayers]: sheetPrayers,
});
const successStorage = memoryStorage();
const success = await refreshFromSheet({
  sheetId: "fixture",
  bundledPlan: plan,
  bundledFeelings: feelings,
  fetchImpl: successFetch.fetchImpl,
  warn: () => {
    throw new Error("成功時不應警告");
  },
});
assert.equal(success.fetched, true);
assert.equal(successFetch.calls.length, 4);
assert.equal(success.plan.days[1].title, "願你破天而降（試算表）");
assert.equal(success.plan.days[1].passage.shen, plan.days[1].passage.shen);
assert.equal(success.plan.days[0].openingPrayer, plan.days[0].openingPrayer);
assert.equal(success.feelings.cores[0].feelings[0].zh, "興奮試");
assert.equal(success.plan.prayerFrames[0].name, "字詞觸動試");
assert.equal(success.feelings.care.contact, "歡迎聯絡石守賢傳道");
saveSheetCache(success.cache, successStorage);
assert.equal(JSON.parse(successStorage.getItem(SHEET_CACHE_KEY)).scripture[1].title, "願你破天而降（試算表）");

const offlineWarnings = [];
const offline = await refreshFromSheet({
  sheetId: "fixture",
  bundledPlan: plan,
  bundledFeelings: feelings,
  fetchImpl: async () => {
    throw new Error("offline");
  },
  warn: (message) => offlineWarnings.push(message),
});
assert.equal(offline.plan.days[1].title, "願你破天而降");
assert.equal(offline.plan.days[1].passage.shen.length > 0, true);
assert.equal(offlineWarnings.length, 4);
assert.equal(offline.plan.prayerFrames[0].name, "字詞觸動");
assert.match(offlineWarnings.join("\n"), /經文/);
assert.match(offlineWarnings.join("\n"), /內建/);

const cachedScripture = parseScriptureCsv(scriptureCsv).map((day) =>
  day.day === 2 ? { ...day, title: "快取標題" } : day
);
const cachedWarnings = [];
const cached = await refreshFromSheet({
  sheetId: "fixture",
  bundledPlan: plan,
  bundledFeelings: feelings,
  cache: { scripture: cachedScripture, guide: null, feelings: null },
  fetchImpl: async (url) => {
    const tab = decodeURIComponent(new URL(url).searchParams.get("sheet"));
    if (tab === SHEET_TABS.scripture) throw new Error("offline");
    if (tab === SHEET_TABS.guide) return responseFor(guideCsv);
    return responseFor(feelingsCsv);
  },
  warn: (message) => cachedWarnings.push(message),
});
assert.equal(cached.plan.days[1].title, "快取標題");
assert.match(cachedWarnings.join("\n"), /繼續用上次成功下載的內容/);
assert.equal(cached.cache.scripture[1].title, "快取標題");

const staleWarnings = [];
const stale = await refreshFromSheet({
  sheetId: "fixture",
  bundledPlan: plan,
  bundledFeelings: feelings,
  cache: { scripture: cachedScripture, guide: null, feelings: null },
  fetchImpl: async (url) => {
    const tab = decodeURIComponent(new URL(url).searchParams.get("sheet"));
    if (tab === SHEET_TABS.scripture) return responseFor("<html>登入</html>");
    if (tab === SHEET_TABS.guide) return responseFor("日序,日期\n1,2026-11-29\n");
    return responseFor(feelingsCsv);
  },
  warn: (message) => staleWarnings.push(message),
});
assert.equal(stale.plan.days[1].title, "願你破天而降");
assert.equal(stale.plan.days[1].title.includes("快取標題"), false);
assert.equal(stale.plan.days[1].openingPrayer, plan.days[1].openingPrayer);
assert.match(staleWarnings.join("\n"), /內建/);
assert.equal(stale.cache.scripture[1].title, "快取標題");
assert.equal(stale.feelings.cores.length, 6);

const partialWarnings = [];
const partial = await refreshFromSheet({
  sheetId: "fixture",
  bundledPlan: plan,
  bundledFeelings: feelings,
  fetchImpl: fetchByTab({
    [SHEET_TABS.scripture]: titled,
    [SHEET_TABS.guide]: new Error("guide down"),
    [SHEET_TABS.feelings]: labeled,
  }).fetchImpl,
  warn: (message) => partialWarnings.push(message),
});
assert.equal(partial.plan.days[1].title, "願你破天而降（試算表）");
assert.equal(partial.plan.days[1].openingPrayer, plan.days[1].openingPrayer);
assert.equal(partial.feelings.cores[0].feelings[0].zh, "興奮試");
assert.match(partialWarnings.join("\n"), /每日引導/);
assert.equal(partial.cache.guide, null);

const painted = applySheetCache(plan, feelings, { scripture: cachedScripture });
assert.equal(painted.plan.days[1].title, "快取標題");
assert.equal(painted.plan.days[0].title, plan.days[0].title);
const reloaded = loadSheetCache(successStorage);
assert.equal(reloaded.scripture[1].title, "願你破天而降（試算表）");

assert.match(config, /sheetId:\s*"1KpW6fsjUaHnj17MiKtIjLS7ybe4geqMr-rkPkSqB-DU"/);
assert.match(pages, /test_sheet\.mjs/);
assert.match(syncWorkflow, /workflow_dispatch/);
assert.match(syncWorkflow, /sheet_id/);
assert.match(syncWorkflow, /create-pull-request/);
assert.match(readFileSync(new URL("scripts/sync-from-sheet.mjs", root), "utf8"), /禱文框架/);
assert.match(readFileSync(new URL("README.md", root), "utf8"), /分詞（神版）/);
assert.match(readFileSync(new URL("README.md", root), "utf8"), /分詞（上帝版）/);
assert.equal(readFileSync(new URL("README.md", root), "utf8").includes("stats.html"), false);

console.log("sheet tests passed");

/**
 * Google Sheet content. sheetId empty = off.
 * A failed tab never blanks a day: network errors keep the last good
 * cache for that tab, and invalid sheets fall back to the bundled JSON.
 */

import { addDays } from "./logic.js";
import { parseCsv, rowsToRecords } from "./csv.js";

export const SHEET_CACHE_KEY = "advent2026.sheet.v1";

export const SHEET_TABS = {
  scripture: "經文",
  guide: "每日引導",
  feelings: "感受詞彙",
};

const SEASON_START = "2026-11-29";
const SEASON_END = "2026-12-25";

const WEEK_INDEX = { 第一週: 1, 第二週: 2, 第三週: 3, 第四週: 4 };

const CORE_META = {
  joyful: ["joy", "seg-joy", "#F3D98B"],
  peaceful: ["peace", "seg-peace", "#BFD8B8"],
  powerful: ["powerful", "seg-powerful", "#A9C4DE"],
  sad: ["sad", "seg-sad", "#B8BCC8"],
  scared: ["scared", "seg-scared", "#C9B8DC"],
  mad: ["mad", "seg-mad", "#EDB98A"],
};

const CORE_ZH_TO_ID = {
  喜樂: "joy",
  平安: "peace",
  有力: "powerful",
  悲傷: "sad",
  懼怕: "scared",
  憤怒: "mad",
};

const SCRIPTURE_HEADERS = [
  "日序",
  "日期",
  "星期",
  "週次",
  "週主題",
  "經文（和合本修訂版）",
  "標題",
  "類型",
  "經文全文（神版）",
  "經文全文（上帝版）",
];

const GUIDE_HEADERS = [
  "日序",
  "日期",
  "星期",
  "週次",
  "週主題",
  "經文（和合本修訂版）",
  "標題",
  "類型",
  "情感焦點",
  "開場禱文",
  "反思一（觀察經文）",
  "反思二（連繫自己）",
  "示範禱文",
  "一週感受回顧提示",
];

const FEELING_HEADERS = ["核心情緒", "Core (EN)", "細分感受", "Feeling (EN)", "序號"];

const SCRIPTURE_KEYS = [
  "date",
  "weekday",
  "week",
  "weekLabel",
  "weekTheme",
  "reference",
  "title",
  "kind",
  "passage",
];

const GUIDE_KEYS = ["focus", "openingPrayer", "reflect1", "reflect2", "samplePrayer", "review"];

export class SheetError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "SheetError";
    this.code = code;
  }
}

export function gvizUrl(sheetId, tabName) {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(String(sheetId).trim())}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
}

export function emptySheetCache() {
  return { scripture: null, guide: null, feelings: null };
}

function seasonDates() {
  const dates = [];
  let cursor = SEASON_START;
  while (cursor <= SEASON_END) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function requireHeaders(header, required, tab) {
  const missing = required.filter((name) => !header.includes(name));
  if (missing.length) {
    throw new SheetError(`「${tab}」缺少欄位：${missing.join("、")}`, "invalid");
  }
}

function cleanPassage(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function assertSeasonDays(records, tab) {
  if (records.length !== 27) {
    throw new SheetError(`「${tab}」應有 27 日，實際 ${records.length} 日`, "invalid");
  }
  const expected = seasonDates();
  const seen = new Set();
  records.forEach((record, index) => {
    const day = Number(record["日序"]);
    if (day !== index + 1 || seen.has(day)) {
      throw new SheetError(`「${tab}」的日序必須是 1 到 27`, "invalid");
    }
    seen.add(day);
    if (record["日期"] !== expected[index]) {
      throw new SheetError(`「${tab}」第 ${day} 日的日期應為 ${expected[index]}`, "invalid");
    }
  });
}

export function parseScriptureCsv(text) {
  const { header, records } = rowsToRecords(parseCsv(text));
  requireHeaders(header, SCRIPTURE_HEADERS, SHEET_TABS.scripture);
  assertSeasonDays(records, SHEET_TABS.scripture);
  return records.map((record) => {
    const weekLabel = record["週次"];
    if (!WEEK_INDEX[weekLabel]) {
      throw new SheetError(`「${SHEET_TABS.scripture}」有未知週次：${weekLabel}`, "invalid");
    }
    const shen = cleanPassage(record["經文全文（神版）"]);
    const shangdi = cleanPassage(record["經文全文（上帝版）"]);
    if (!shen || !shangdi) {
      throw new SheetError(`「${SHEET_TABS.scripture}」第 ${record["日序"]} 日的神版或上帝版是空的`, "invalid");
    }
    if (!record["標題"] || !record["經文（和合本修訂版）"]) {
      throw new SheetError(`「${SHEET_TABS.scripture}」第 ${record["日序"]} 日缺少標題或出處`, "invalid");
    }
    return {
      day: Number(record["日序"]),
      date: record["日期"],
      weekday: record["星期"],
      week: WEEK_INDEX[weekLabel],
      weekLabel,
      weekTheme: record["週主題"],
      reference: record["經文（和合本修訂版）"],
      title: record["標題"],
      kind: record["類型"],
      passage: { shen, shangdi },
    };
  });
}

export function parseGuideCsv(text) {
  const { header, records } = rowsToRecords(parseCsv(text));
  requireHeaders(header, GUIDE_HEADERS, SHEET_TABS.guide);
  assertSeasonDays(records, SHEET_TABS.guide);
  return records.map((record) => {
    const day = Number(record["日序"]);
    for (const name of ["開場禱文", "反思一（觀察經文）", "反思二（連繫自己）", "示範禱文"]) {
      if (!record[name]) throw new SheetError(`「${SHEET_TABS.guide}」第 ${day} 日缺少${name}`, "invalid");
    }
    const prompt = record["一週感受回顧提示"] || "";
    const review = prompt
      ? { scope: day === 27 || prompt.includes("總回顧") ? "season" : "week", prompt }
      : null;
    return {
      day,
      date: record["日期"],
      focus: record["情感焦點"] || "",
      openingPrayer: record["開場禱文"],
      reflect1: record["反思一（觀察經文）"],
      reflect2: record["反思二（連繫自己）"],
      samplePrayer: record["示範禱文"],
      review,
    };
  });
}

function parseCare(rows) {
  let header = "";
  let message = "";
  for (let index = 0; index < rows.length; index += 1) {
    const first = (rows[index][0] || "").trim();
    if (first.startsWith("關懷提示")) {
      header = first;
      message = (rows[index + 1]?.[0] || "").trim();
      break;
    }
  }
  if (!message) throw new SheetError("「感受詞彙」缺少關懷提示", "invalid");
  const daysMatch = header.match(/連續\s*(\d+)\s*日/);
  const levelMatch = header.match(/強度\s*(\d+)/);
  const coreIds = ["悲傷", "懼怕"].filter((name) => header.includes(name)).map((name) => CORE_ZH_TO_ID[name]);
  const contactMatch = message.match(/^(.*?傾談。)(.*?)(如有即時危險，請致電 999。)\s*$/);
  if (!contactMatch) {
    return {
      consecutiveDays: daysMatch ? Number(daysMatch[1]) : 3,
      minIntensity: levelMatch ? Number(levelMatch[1]) : 4,
      coreIds: coreIds.length ? coreIds : ["sad", "scared"],
      template: message,
      contact: "",
    };
  }
  return {
    consecutiveDays: daysMatch ? Number(daysMatch[1]) : 3,
    minIntensity: levelMatch ? Number(levelMatch[1]) : 4,
    coreIds: coreIds.length ? coreIds : ["sad", "scared"],
    template: `${contactMatch[1]}{churchContact}${contactMatch[3]}`,
    contact: contactMatch[2].trim().replace(/。$/, ""),
  };
}

export function parseFeelingsCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new SheetError("「感受詞彙」是空的", "invalid");
  const header = rows[0].map((cell) => cell.trim());
  requireHeaders(header, FEELING_HEADERS, SHEET_TABS.feelings);
  const column = Object.fromEntries(header.map((name, index) => [name, index]));
  const cores = [];
  const byZh = new Map();
  const intensities = [];
  let mode = "feelings";
  for (const row of rows.slice(1)) {
    const first = (row[0] || "").trim();
    if (!first) continue;
    if (first.startsWith("強度")) {
      mode = "intensity";
      continue;
    }
    if (first.startsWith("關懷提示")) break;
    if (mode === "intensity") {
      if (!/^\d+$/.test(first)) continue;
      intensities.push({ level: Number(first), label: (row[1] || "").trim() });
      continue;
    }
    const zh = (row[column["核心情緒"]] || "").trim();
    const en = (row[column["Core (EN)"]] || "").trim();
    const meta = CORE_META[en.toLowerCase()];
    if (!meta) throw new SheetError(`「感受詞彙」有未知核心情緒：${zh || en}`, "invalid");
    if (!byZh.has(zh)) {
      const core = { id: meta[0], zh, en, color: meta[2], segment: meta[1], feelings: [] };
      byZh.set(zh, core);
      cores.push(core);
    }
    byZh.get(zh).feelings.push({
      order: Number(row[column["序號"]]),
      zh: (row[column["細分感受"]] || "").trim(),
      en: (row[column["Feeling (EN)"]] || "").trim(),
    });
  }
  if (cores.length !== 6) {
    throw new SheetError(`「感受詞彙」應有 6 種核心情緒，實際 ${cores.length} 種`, "invalid");
  }
  if (cores.some((core) => core.feelings.length < 1 || core.feelings.some((item) => !item.zh))) {
    throw new SheetError("「感受詞彙」有核心情緒缺少細分感受", "invalid");
  }
  if (intensities.map((item) => item.level).join(",") !== "1,2,3,4,5") {
    throw new SheetError("「感受詞彙」的強度應為 1 到 5", "invalid");
  }
  return { cores, intensities, care: parseCare(rows) };
}

function assertScripture(days) {
  if (!Array.isArray(days) || days.length !== 27) throw new SheetError("經文快取無效", "invalid");
  const expected = seasonDates();
  days.forEach((day, index) => {
    if (day?.day !== index + 1 || day.date !== expected[index]) throw new SheetError("經文快取日期無效", "invalid");
    if (!day.passage?.shen || !day.passage?.shangdi || !day.title) throw new SheetError("經文快取內容無效", "invalid");
  });
}

function assertGuide(days) {
  if (!Array.isArray(days) || days.length !== 27) throw new SheetError("引導快取無效", "invalid");
  days.forEach((day, index) => {
    if (day?.day !== index + 1 || !day.openingPrayer || !day.reflect1 || !day.reflect2 || !day.samplePrayer) {
      throw new SheetError("引導快取內容無效", "invalid");
    }
  });
}

function assertFeelings(data) {
  if (!data || !Array.isArray(data.cores) || data.cores.length !== 6) {
    throw new SheetError("感受詞彙快取無效", "invalid");
  }
}

export function sanitizeSheetCache(raw) {
  const cache = emptySheetCache();
  if (!raw || typeof raw !== "object") return cache;
  try {
    assertScripture(raw.scripture);
    cache.scripture = raw.scripture;
  } catch {
    cache.scripture = null;
  }
  try {
    assertGuide(raw.guide);
    cache.guide = raw.guide;
  } catch {
    cache.guide = null;
  }
  try {
    assertFeelings(raw.feelings);
    cache.feelings = raw.feelings;
  } catch {
    cache.feelings = null;
  }
  return cache;
}

export function loadSheetCache(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(SHEET_CACHE_KEY);
    if (!raw) return emptySheetCache();
    return sanitizeSheetCache(JSON.parse(raw));
  } catch {
    return emptySheetCache();
  }
}

export function saveSheetCache(cache, storage = globalThis.localStorage) {
  if (!storage?.setItem) return;
  storage.setItem(SHEET_CACHE_KEY, JSON.stringify(sanitizeSheetCache(cache)));
}

export function mergeSheetContent(bundledPlan, bundledFeelings, parts) {
  const plan = structuredClone(bundledPlan);
  const feelings = structuredClone(bundledFeelings);
  if (parts?.scripture) {
    for (const day of plan.days) {
      const source = parts.scripture.find((item) => item.day === day.day);
      if (!source) continue;
      for (const key of SCRIPTURE_KEYS) day[key] = source[key];
    }
  }
  if (parts?.guide) {
    for (const day of plan.days) {
      const source = parts.guide.find((item) => item.day === day.day);
      if (!source) continue;
      for (const key of GUIDE_KEYS) day[key] = source[key];
    }
  }
  if (parts?.feelings) {
    feelings.cores = parts.feelings.cores;
    feelings.intensities = parts.feelings.intensities;
    feelings.care = parts.feelings.care;
  }
  return { plan, feelings };
}

export function applySheetCache(bundledPlan, bundledFeelings, cache) {
  const safe = sanitizeSheetCache(cache);
  return mergeSheetContent(bundledPlan, bundledFeelings, safe);
}

const TAB_JOBS = [
  { key: "scripture", sheet: SHEET_TABS.scripture, parse: parseScriptureCsv },
  { key: "guide", sheet: SHEET_TABS.guide, parse: parseGuideCsv },
  { key: "feelings", sheet: SHEET_TABS.feelings, parse: parseFeelingsCsv },
];

/**
 * Fetch the three tabs. Does not touch the network when sheetId is empty.
 * `cache` is the last good parsed tabs, used only when a download fails.
 */
export async function refreshFromSheet({
  sheetId,
  bundledPlan,
  bundledFeelings,
  cache = null,
  fetchImpl = globalThis.fetch,
  warn = () => {},
}) {
  const safeCache = sanitizeSheetCache(cache);
  const id = String(sheetId || "").trim();
  if (!id) {
    return {
      ...mergeSheetContent(bundledPlan, bundledFeelings, safeCache),
      cache: safeCache,
      fetched: false,
    };
  }

  const parts = { scripture: null, guide: null, feelings: null };
  const nextCache = { ...safeCache };

  await Promise.all(TAB_JOBS.map(async (job) => {
    try {
      const response = await fetchImpl(gvizUrl(id, job.sheet));
      if (!response || response.ok === false) {
        throw new SheetError(response ? `HTTP ${response.status}` : "沒有回應", "network");
      }
      const text = await response.text();
      if (!text || /^\s*</.test(text)) {
        throw new SheetError("回應不是 CSV", "invalid");
      }
      const parsed = job.parse(text);
      parts[job.key] = parsed;
      nextCache[job.key] = parsed;
    } catch (error) {
      const invalid = error instanceof SheetError && error.code === "invalid";
      const detail = error?.message || "未知錯誤";
      if (!invalid && safeCache[job.key]) {
        parts[job.key] = safeCache[job.key];
        warn(`[advent] 試算表分頁「${job.sheet}」下載失敗（${detail}），繼續用上次成功下載的內容。`);
        return;
      }
      parts[job.key] = null;
      warn(`[advent] 試算表分頁「${job.sheet}」未能使用（${detail}），這頁改用內建資料。`);
    }
  }));

  return {
    ...mergeSheetContent(bundledPlan, bundledFeelings, parts),
    cache: sanitizeSheetCache(nextCache),
    fetched: true,
  };
}

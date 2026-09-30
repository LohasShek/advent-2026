#!/usr/bin/env node
/**
 * Download the content tabs and regenerate the bundled JSON.
 * 經文, 每日引導 and 感受詞彙 are required.
 * 禱文框架 is optional: if that tab is missing, the bundled file stays.
 *
 *   node scripts/sync-from-sheet.mjs --sheet-id SHEET_ID
 *
 * The id can also come from SHEET_ID or config.js. This does not write
 * sheetId into config.js. The three required tabs must validate before any file changes.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SHEET_TABS,
  gvizUrl,
  parseFeelingsCsv,
  parseGuideCsv,
  parsePrayerCsv,
  parseScriptureCsv,
} from "../js/sheet.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function sheetIdFromArgs() {
  const args = process.argv.slice(2);
  const flag = args.indexOf("--sheet-id");
  if (flag >= 0 && args[flag + 1]) return args[flag + 1].trim();
  if (process.env.SHEET_ID && process.env.SHEET_ID.trim()) return process.env.SHEET_ID.trim();
  const config = readFileSync(resolve(root, "config.js"), "utf8");
  const match = config.match(/sheetId:\s*"([^"]*)"/);
  return match ? match[1].trim() : "";
}

const sheetId = sheetIdFromArgs();
if (!sheetId) {
  console.error("需要試算表 ID。請用 --sheet-id、環境變數 SHEET_ID，或在 config.js 填上 sheetId。");
  process.exit(1);
}

const jobs = [
  { tab: SHEET_TABS.scripture, file: "將臨期每日經文_v2.csv", parse: parseScriptureCsv, optional: false },
  { tab: SHEET_TABS.guide, file: "將臨期每日情感引導_v2.csv", parse: parseGuideCsv, optional: false },
  { tab: SHEET_TABS.feelings, file: "感受之輪詞彙_v2.csv", parse: parseFeelingsCsv, optional: false },
  { tab: SHEET_TABS.prayers, file: "禱文框架.csv", parse: parsePrayerCsv, optional: true },
];

async function downloadTab(job) {
  const url = gvizUrl(sheetId, job.tab);
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    return { ok: false, detail: error?.message || String(error) };
  }
  if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
  const text = await response.text();
  if (!text || /^\s*</.test(text)) return { ok: false, detail: "回應不是 CSV" };
  try {
    job.parse(text);
  } catch (error) {
    return { ok: false, detail: error?.message || String(error) };
  }
  return { ok: true, text };
}

const downloads = [];
for (const job of jobs) {
  const result = await downloadTab(job);
  if (!result.ok) {
    const message = `「${job.tab}」未能使用：${result.detail}`;
    if (job.optional) {
      console.warn(`${message}。繼續使用內建的禱文框架。`);
      continue;
    }
    console.error(`${message}。請確認試算表已設為「知道連結的人可以查看」，而且分頁名稱沒有改過。`);
    process.exit(1);
  }
  downloads.push({ file: job.file, text: result.text });
}

for (const item of downloads) {
  const body = item.text.replace(/^\uFEFF/, "").replace(/\s*$/, "\n");
  writeFileSync(resolve(root, "content", item.file), `\uFEFF${body}`, "utf8");
}

const converted = spawnSync("python3", ["scripts/convert_csv.py"], { cwd: root, stdio: "inherit" });
if (converted.status !== 0) process.exit(converted.status || 1);
console.log("已用試算表更新內建 CSV 和 JSON。");

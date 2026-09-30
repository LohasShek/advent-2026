/** Date, care, and passage helpers. No network and no scripture text. */

import ui from "../ui-strings.json" with { type: "json" };

export const TIMEZONE = "Asia/Hong_Kong";

export function editionGuide(text, edition) {
  const raw = String(text || "").trim();
  if (!raw || edition !== "shangdi") return raw;
  return raw.replace(/上帝|神/g, "上帝");
}

export function fill(template, vars = {}) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] == null ? "" : String(vars[key])
  );
}

const WEEKDAY_LABEL = ui.weekdays;

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function hongKongDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function utcMidnight(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function addDays(iso, amount) {
  const next = new Date(utcMidnight(iso) + amount * 86400000);
  return next.toISOString().slice(0, 10);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((utcMidnight(toIso) - utcMidnight(fromIso)) / 86400000);
}

/** @returns {"before" | "during" | "after"} */
export function seasonPhase(dateIso, startIso, endIso) {
  if (dateIso < startIso) return "before";
  if (dateIso > endIso) return "after";
  return "during";
}

export function formatMonthDay(iso) {
  const [, month, day] = iso.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

export function formatFullDate(iso, weekday) {
  const label = WEEKDAY_LABEL[weekday] || "";
  return label ? `${formatMonthDay(iso)}（${label}）` : formatMonthDay(iso);
}

export function candleAlt(week) {
  return ui.candles[week] || ui.candles[0];
}

export function weeksOf(days) {
  const groups = [];
  for (const day of days) {
    const found = groups.find((item) => item.week === day.week);
    if (!found) {
      groups.push({
        week: day.week,
        label: day.weekLabel,
        theme: day.weekTheme,
        start: day.date,
        end: day.date,
      });
    } else {
      found.end = day.date;
    }
  }
  return groups;
}

export function stepIndex(day, stepId) {
  return flowSteps(day).findIndex((step) => step.id === stepId);
}

export function canOpenStep(day, entry, stepId) {
  const target = stepIndex(day, stepId);
  if (target < 0) return false;
  if (entry?.completed) return true;
  const reached = stepIndex(day, entry?.reached || "quiet");
  return target <= Math.max(reached, 0);
}

export function activeStepId(day, entry, requested) {
  const ids = flowSteps(day).map((step) => step.id);
  const fallback = ids.includes(entry?.reached) ? entry.reached : "quiet";
  if (!requested || !ids.includes(requested)) return fallback;
  if (canOpenStep(day, entry, requested)) return requested;
  return fallback;
}

export function markReached(entry, day, stepId) {
  const reached = stepIndex(day, entry?.reached || "quiet");
  const target = stepIndex(day, stepId);
  if (target > reached) entry.reached = stepId;
}

export function nextStepId(day, stepId) {
  const steps = flowSteps(day);
  const index = stepIndex(day, stepId);
  if (index < 0) return "";
  return steps[index + 1]?.id || "";
}

export function previousStepId(day, stepId) {
  const index = stepIndex(day, stepId);
  return index > 0 ? flowSteps(day)[index - 1].id : "";
}

export function flowSteps(day) {
  const steps = [
    { id: "quiet", label: ui.steps.quiet },
    { id: "before", label: ui.steps.before },
    { id: "read", label: ui.steps.read },
    { id: "reflect", label: ui.steps.reflect },
    { id: "after", label: ui.steps.after },
  ];
  if (day.review) {
    steps.push({
      id: "review",
      label: day.review.scope === "season" ? ui.steps.reviewSeason : ui.steps.reviewWeek,
    });
  }
  steps.push({ id: "prayer", label: ui.steps.prayer });
  return steps;
}

export function reviewBounds(day) {
  if (!day.review) return null;
  if (day.review.scope === "season") {
    return { fromDay: 1, toDay: day.day, scope: "season" };
  }
  return { fromDay: day.day - 7, toDay: day.day - 1, scope: "week" };
}

function verseSpoken(n) {
  if (String(n).includes(":")) {
    const [chapter, verse] = String(n).split(":");
    return fill(ui.passage.chapterVerse, { chapter, verse });
  }
  return fill(ui.passage.verse, { n });
}

export function parseVerses(text) {
  if (!text || !String(text).trim()) return [];
  const verses = [];
  const marker = /(\d+(?::\d+)?)(?=\s)/g;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const marks = [...line.matchAll(marker)];
    if (!marks.length) {
      verses.push({ n: "", text: line });
      continue;
    }
    if (marks[0].index > 0) {
      const lead = line.slice(0, marks[0].index).trim();
      if (lead) verses.push({ n: "", text: lead });
    }
    for (let index = 0; index < marks.length; index += 1) {
      const start = marks[index].index + marks[index][1].length;
      const end = index + 1 < marks.length ? marks[index + 1].index : line.length;
      verses.push({ n: marks[index][1], text: line.slice(start, end).trim() });
    }
  }
  return verses;
}

function verseKey(label) {
  const text = String(label || "");
  if (!text) return null;
  if (text.includes(":")) {
    const [chapter, verse] = text.split(":").map(Number);
    if (!Number.isInteger(chapter) || !Number.isInteger(verse)) return null;
    return { chapter, verse };
  }
  const verse = Number(text);
  if (!Number.isInteger(verse)) return null;
  return { chapter: null, verse };
}

function versesContinue(previous, next) {
  if (!previous || !next) return true;
  if (previous.chapter == null && next.chapter == null) return next.verse === previous.verse + 1;
  if (previous.chapter != null && next.chapter != null) {
    if (previous.chapter === next.chapter) return next.verse === previous.verse + 1;
    return next.chapter === previous.chapter + 1 && next.verse === 1;
  }
  return false;
}

export const WORD_LIMIT = 5;

export function segmentMode(passage, segmented) {
  const raw = String(segmented ?? "");
  if (!raw.trim()) return "empty";
  if (raw.split("｜").join("") !== String(passage ?? "")) return "mismatch";
  return "tokens";
}

function isSelectableWord(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  return /[\u4e00-\u9fff]/.test(trimmed);
}

const CLOSING_CHARS = "！，。？、；：」』）)…";
const OPENING_CHARS = "「『（(";

function expandPiece(piece) {
  const atoms = [];
  let index = 0;
  const source = String(piece);
  while (index < source.length) {
    const verse = /^(\d+(?::\d+)?)(\s*)/.exec(source.slice(index));
    if (verse) {
      atoms.push({ text: verse[1], selectable: false, kind: "verse" });
      index += verse[0].length;
      continue;
    }
    const char = source[index];
    if (CLOSING_CHARS.includes(char)) {
      let end = index + 1;
      while (end < source.length && CLOSING_CHARS.includes(source[end])) end += 1;
      atoms.push({ text: source.slice(index, end), selectable: false, kind: "close" });
      index = end;
      continue;
    }
    if (OPENING_CHARS.includes(char)) {
      let end = index + 1;
      while (end < source.length && OPENING_CHARS.includes(source[end])) end += 1;
      atoms.push({ text: source.slice(index, end), selectable: false, kind: "open" });
      index = end;
      continue;
    }
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < source.length) {
      const next = source[end];
      if (/\s/.test(next) || /\d/.test(next) || CLOSING_CHARS.includes(next) || OPENING_CHARS.includes(next)) break;
      end += 1;
    }
    const text = source.slice(index, end);
    const selectable = isSelectableWord(text);
    atoms.push({ text, selectable, kind: selectable ? "word" : "other" });
    index = end;
  }
  return atoms;
}

export function lineTokens(line) {
  const tokens = [];
  for (const piece of String(line).split("｜")) {
    if (!piece) continue;
    tokens.push(...expandPiece(piece));
  }
  return tokens;
}

export function normalizeWords(words) {
  if (!Array.isArray(words)) return [];
  const list = [];
  for (const word of words) {
    if (typeof word !== "string") continue;
    const clean = word.trim();
    if (!clean || list.includes(clean)) continue;
    list.push(clean);
    if (list.length >= WORD_LIMIT) break;
  }
  return list;
}

export function selectionWord(raw) {
  return String(raw || "")
    .replace(/\s+/g, "")
    .replace(/^\d+(?::\d+)?/, "")
    .trim();
}

export function addWord(words, raw) {
  const list = normalizeWords(words);
  const clean = selectionWord(raw);
  if (!clean) return { words: list, limited: false };
  if (list.includes(clean)) return { words: list, limited: false };
  if (list.length >= WORD_LIMIT) return { words: list, limited: true };
  return { words: [...list, clean], limited: false };
}

export function toggleWord(words, raw) {
  const list = normalizeWords(words);
  const clean = String(raw || "").trim();
  if (!clean || !isSelectableWord(clean)) return { words: list, limited: false };
  const index = list.indexOf(clean);
  if (index >= 0) return { words: list.filter((_, item) => item !== index), limited: false };
  if (list.length >= WORD_LIMIT) return { words: list, limited: true };
  return { words: [...list, clean], limited: false };
}

export function formatMarkedWords(words) {
  return normalizeWords(words)
    .map((word) => `「${word}」`)
    .join("、");
}

export function feelingLabel(pick) {
  if (!pick || typeof pick !== "object") return "";
  const fine = String(pick.feelingZh || "").trim();
  if (fine) return fine;
  return String(pick.coreZh || "").trim();
}

export function fillPrayerFrame(template, context = {}) {
  const words = formatMarkedWords(context.words);
  const before = feelingLabel(context.before);
  const after = feelingLabel(context.after);
  let text = String(template || "");
  if (before && before === after && text.includes("〔讀經前感受〕") && text.includes("〔讀經後感受〕")) {
    const at = text.indexOf("〔字詞〕");
    const opening = `主啊，讀經前後我都感到${before}。`;
    text = at >= 0 ? `${opening}${text.slice(at)}` : opening;
  }
  return text
    .split("〔字詞〕")
    .join(words)
    .split("〔讀經前感受〕")
    .join(before)
    .split("〔讀經後感受〕")
    .join(after);
}

function blankHtml(line) {
  const parts = String(line).split("＿＿");
  return parts
    .map((part, index) => {
      const blank =
        index < parts.length - 1
          ? `<span class="pray-blank" role="img" aria-label="${esc(ui.prayer.blank)}">&nbsp;</span>`
          : "";
      return `${esc(part)}${blank}`;
    })
    .join("");
}

export function prayerFrameHtml(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${blankHtml(line)}</p>`)
    .join("");
}

function verseBodyHtml(verse) {
  const spoken = verse.n ? `<span class="sr-only">${esc(verseSpoken(verse.n))}。</span>` : "";
  const num = verse.n ? `<sup class="vnum">${esc(verse.n)}</sup>` : "";
  return `<p class="verse">${spoken}${num}${esc(verse.text)}</p>`;
}

function tokenPunct(text) {
  return text ? `<span class="token-punct">${esc(text)}</span>` : "";
}

function tokenButton(token, selected, prefix = "", suffix = "") {
  const value = token.text.trim();
  const on = selected.has(value);
  const button = `<span role="button" tabindex="0" class="token${on ? " is-on" : ""}" data-action="toggle-word" data-word="${esc(value)}" aria-pressed="${on ? "true" : "false"}">${esc(token.text)}</span>`;
  if (!prefix && !suffix) return button;
  return `<span class="token-glue">${tokenPunct(prefix)}${button}${tokenPunct(suffix)}</span>`;
}

function versePrefix(n) {
  if (!n) return "";
  return `<span class="sr-only">${esc(verseSpoken(n))}。</span><sup class="vnum">${esc(n)}</sup>`;
}

function atomsHtml(tokens, selected) {
  let html = "";
  for (let cursor = 0; cursor < tokens.length; cursor += 1) {
    const token = tokens[cursor];
    if (token.kind === "verse") {
      html += versePrefix(token.text);
      continue;
    }
    if (token.kind === "close" || token.kind === "other") {
      html += esc(token.text);
      continue;
    }
    if (token.kind === "open") {
      const next = tokens[cursor + 1];
      if (next?.kind === "word") {
        let suffix = "";
        let look = cursor + 2;
        while (look < tokens.length && tokens[look].kind === "close") {
          suffix += tokens[look].text;
          look += 1;
        }
        html += tokenButton(next, selected, token.text, suffix);
        cursor = look - 1;
        continue;
      }
      html += esc(token.text);
      continue;
    }
    let suffix = "";
    let look = cursor + 1;
    while (look < tokens.length && tokens[look].kind === "close") {
      suffix += tokens[look].text;
      look += 1;
    }
    html += tokenButton(token, selected, "", suffix);
    cursor = look - 1;
  }
  return html;
}

function tokenBlocks(line) {
  const blocks = [];
  let current = null;
  const start = (verseText) => {
    current = { key: verseKey(verseText), prefix: versePrefix(verseText), tokens: [] };
    blocks.push(current);
  };
  for (const token of lineTokens(line)) {
    if (token.kind === "verse") {
      start(token.text);
      continue;
    }
    if (!current) start("");
    current.tokens.push(token);
  }
  return blocks;
}

export function passageHtml(text, segmented = "", words = []) {
  const source = String(text || "");
  if (!source.trim()) {
    return `<p class="placeholder">${esc(ui.passage.placeholder)}</p>`;
  }
  const tokens = segmentMode(source, segmented) === "tokens";
  const parts = [];
  let previous = null;
  if (tokens) {
    const selected = new Set(normalizeWords(words));
    for (const line of String(segmented).split("\n")) {
      if (!line.trim()) continue;
      for (const block of tokenBlocks(line)) {
        if (previous && block.key && !versesContinue(previous, block.key)) {
          parts.push(`<p class="verse-gap">${esc(ui.passage.skip)}</p>`);
        }
        if (block.key) previous = block.key;
        parts.push(`<p class="verse">${block.prefix}${atomsHtml(block.tokens, selected)}</p>`);
      }
    }
  } else {
    for (const verse of parseVerses(source)) {
      const key = verseKey(verse.n);
      if (previous && key && !versesContinue(previous, key)) {
        parts.push(`<p class="verse-gap">${esc(ui.passage.skip)}</p>`);
      }
      if (key) previous = key;
      parts.push(verseBodyHtml(verse));
    }
  }
  return `<div class="passage${tokens ? " is-tokens" : " is-selectable"}">${parts.join("")}</div>`;
}

export function paragraphsHtml(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${esc(line)}</p>`)
    .join("");
}

/**
 * A day counts as heavy when a confirmed before or after feeling is one of
 * the care cores at or above the threshold. Missing days break the streak.
 * Today with no entry yet is skipped so yesterday's streak can still show.
 */
export function careStreak(entriesByDate, today, care) {
  const needed = care?.consecutiveDays || 3;
  const minIntensity = care?.minIntensity || 4;
  const cores = new Set(care?.coreIds || ["sad", "scared"]);
  let streak = 0;
  const dates = [];
  for (let offset = 0; offset < 21; offset += 1) {
    const date = addDays(today, -offset);
    const entry = entriesByDate[date];
    const picks = feelingPicks(entry);
    if (!picks.length) {
      if (offset === 0) continue;
      break;
    }
    const heavy = picks.some(
      (pick) => cores.has(pick.coreId) && Number(pick.intensity) >= minIntensity
    );
    if (!heavy) break;
    streak += 1;
    dates.push(date);
  }
  return streak >= needed ? dates : null;
}

export function feelingPicks(entry) {
  if (!entry) return [];
  return [entry.before, entry.after].filter(
    (pick) => pick && pick.coreId && pick.feelingZh && pick.intensity
  );
}

export function careMessage(template, contact) {
  const cleaned = String(contact || "").trim();
  const piece = cleaned ? (cleaned.endsWith("。") ? cleaned : `${cleaned}。`) : "";
  return String(template || "").replace("{churchContact}", piece);
}

export function careHtml(text) {
  return String(text ?? "")
    .split("18288")
    .map((part) => esc(part))
    .join('<a href="tel:18288">18288</a>');
}

export function comparisonNote(before, after) {
  if (!before || !after) return "";
  const sameCore = before.coreId === after.coreId;
  const sameFeeling = before.feelingZh === after.feelingZh;
  const sameLevel = Number(before.intensity) === Number(after.intensity);
  if (sameCore && sameFeeling && sameLevel) return ui.comparison.same;
  if (sameCore) return ui.comparison.sameCore;
  return ui.comparison.different;
}

export function countCores(picks) {
  const map = new Map();
  for (const pick of picks) {
    if (!pick?.coreId) continue;
    const current = map.get(pick.coreId) || {
      id: pick.coreId,
      zh: pick.coreZh,
      n: 0,
    };
    current.n += 1;
    map.set(pick.coreId, current);
  }
  return [...map.values()].sort((a, b) => b.n - a.n || a.zh.localeCompare(b.zh, "zh-Hant"));
}

export function reviewSummary(beforeCounts, afterCounts) {
  const line = (counts, label) => {
    if (!counts.length) return "";
    const top = counts[0].n;
    const names = counts.filter((item) => item.n === top).map((item) => item.zh);
    if (names.length > 1) return fill(ui.review.topMany, { label, names: names.join("、") });
    return fill(ui.review.topOne, { label, name: names[0] });
  };
  const beforeLine = line(beforeCounts, ui.review.beforeLabel);
  const afterLine = line(afterCounts, ui.review.afterLabel);
  if (!beforeLine && !afterLine) {
    return ui.review.empty;
  }
  if (beforeLine && afterLine) return `${beforeLine}；${afterLine}。`;
  return `${beforeLine || afterLine}。`;
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Anonymous feeling event. Callers must not pass notes; this reads only
 * the controlled vocabulary fields and the intensity number.
 */
export function anonymousFeelingEvent(dayNumber, before, after) {
  if (!before?.coreId || !after?.coreId) return null;
  if (!before.feelingEn || !after.feelingEn) return null;
  const intensityOk = (value) => {
    const level = Number(value);
    return Number.isInteger(level) && level >= 1 && level <= 5;
  };
  if (!intensityOk(before.intensity) || !intensityOk(after.intensity)) return null;
  const path = [
    "anon-feeling",
    String(dayNumber),
    slug(before.coreId),
    slug(before.feelingEn),
    String(before.intensity),
    slug(after.coreId),
    slug(after.feelingEn),
    String(after.intensity),
  ].join("/");
  return { path, event: true };
}

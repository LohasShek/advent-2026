/** Date, care, and passage helpers. No network and no scripture text. */

import ui from "../ui-strings.json" with { type: "json" };

export const TIMEZONE = "Asia/Hong_Kong";

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
    { id: "after", label: ui.steps.after },
    { id: "reflect", label: ui.steps.reflect },
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
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+(?::\d+)?)\s*(.*)$/);
      if (!match) return { n: "", text: line };
      return { n: match[1], text: match[2] };
    });
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

export function passageHtml(text) {
  const verses = parseVerses(text);
  if (!verses.length) {
    return `<p class="placeholder">${esc(ui.passage.placeholder)}</p>`;
  }
  const parts = [];
  let previous = null;
  for (const verse of verses) {
    const key = verseKey(verse.n);
    if (previous && key && !versesContinue(previous, key)) {
      parts.push(`<p class="verse-gap">${esc(ui.passage.skip)}</p>`);
    }
    if (key) previous = key;
    const spoken = verse.n
      ? `<span class="sr-only">${esc(verseSpoken(verse.n))}。</span>`
      : "";
    const num = verse.n ? `<sup class="vnum">${esc(verse.n)}</sup>` : "";
    parts.push(`<p class="verse">${num}${spoken}${esc(verse.text)}</p>`);
  }
  return `<div class="passage">${parts.join("")}</div>`;
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

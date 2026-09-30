/** Date, care, and passage helpers. No network and no scripture text. */

import ui from "../ui-strings.json" with { type: "json" };

export const TIMEZONE = "Asia/Hong_Kong";

/** 「神」留在這些詞裏面。不用前後字猜測。清單沒有「神奇」和「天神」。 */
export const SHEN_KEEP_WORDS = Object.freeze([
  "精神",
  "神聖",
  "神蹟",
  "神情",
  "神秘",
  "心神",
  "神采",
  "留神",
  "出神",
  "失神",
  "傳神",
  "神經",
]);

function shieldPhrase(source, phrase, slots) {
  if (!phrase || !source.includes(phrase)) return source;
  let out = "";
  let index = 0;
  while (index < source.length) {
    if (source.startsWith(phrase, index)) {
      out += `\u0000${slots.length}\u0000`;
      slots.push(phrase);
      index += phrase.length;
    } else {
      out += source[index];
      index += 1;
    }
  }
  return out;
}

/**
 * 上帝版把團隊文字裏的「神」轉成「上帝」。神版原樣返回。
 * 先保住已經寫好的「上帝」和排除詞，避免「上上帝」「上帝帝」。
 */
export function editionGuide(text, edition) {
  const raw = text == null ? "" : String(text);
  if (edition !== "shangdi") return raw;
  const slots = [];
  let working = shieldPhrase(raw, "上帝", slots);
  const keeps = [...SHEN_KEEP_WORDS].sort((left, right) => right.length - left.length);
  for (const word of keeps) working = shieldPhrase(working, word, slots);
  working = working.split("神").join("上帝");
  return working.replace(/\u0000(\d+)\u0000/g, (_, index) => slots[Number(index)]);
}

/** 一日裏面要隨版本顯示的團隊文字。經文全文不在這裏。 */
export function teamTextEntries(day) {
  return [
    ["情感焦點", day.focus || ""],
    ["開場禱文", day.openingPrayer || ""],
    ["反思一", day.reflect1 || ""],
    ["反思二", day.reflect2 || ""],
    ["小體驗", day.experience || ""],
    ["示範禱文", day.samplePrayer || ""],
    ["回顧", day.review?.prompt || ""],
    ["標題", day.title || ""],
    ["週主題", day.weekTheme || ""],
  ];
}

/** Saved intensity 1–5, or "" when that side has no number to show. */
export function reviewIntensity(value) {
  const level = Number(value);
  if (!Number.isInteger(level) || level < 1 || level > 5) return "";
  return String(level);
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

/** One screen-reader sentence for a verse, in the edition already chosen. */
export function verseScreenLabel(n, body) {
  const text = String(body || "").replace(/\s+/g, " ").trim();
  if (!n) return text;
  return `${verseSpoken(n)}，${text}`;
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

function verseBlocks(segmented) {
  const blocks = [];
  for (const line of String(segmented || "").split("\n")) {
    if (!line.trim()) continue;
    blocks.push(...tokenBlocks(line));
  }
  return blocks;
}

/** Selectable words in reading order. joinNext is true when the next word is in the same verse with no punctuation between. */
export function passageSlots(passage, segmented) {
  if (segmentMode(passage, segmented) !== "tokens") return [];
  const slots = [];
  for (const block of verseBlocks(segmented)) {
    let previous = -1;
    let wordIndex = 0;
    block.tokens.forEach((token, index) => {
      if (token.kind !== "word") return;
      const text = token.text.trim();
      if (!isSelectableWord(text)) return;
      wordIndex += 1;
      if (previous >= 0) slots[slots.length - 1].joinNext = index === previous + 1;
      slots.push({ text, joinNext: false, verse: block.label || "", index: wordIndex });
      previous = index;
    });
  }
  return slots;
}

function annotateSlots(slots) {
  let verse = null;
  let next = 1;
  return slots.map((slot) => {
    const label = slot.verse != null ? String(slot.verse) : "";
    if (label !== verse) {
      verse = label;
      next = 1;
    }
    const index = Number.isInteger(slot.index) ? slot.index : next;
    next = index + 1;
    return { text: String(slot.text || ""), joinNext: slot.joinNext === true, verse: label, index };
  });
}

function isMark(word) {
  return Boolean(
    word &&
      typeof word === "object" &&
      typeof word.verse === "string" &&
      Number.isInteger(word.from) &&
      Number.isInteger(word.to) &&
      word.from >= 1 &&
      word.to >= word.from
  );
}

function sameMark(left, right) {
  return left.verse === right.verse && left.from === right.from && left.to === right.to;
}

function copyMark(word) {
  const mark = { verse: word.verse, from: word.from, to: word.to };
  if (typeof word.shen === "string" && word.shen) mark.shen = word.shen;
  if (typeof word.shangdi === "string" && word.shangdi) mark.shangdi = word.shangdi;
  return mark;
}

function phraseAt(slots, mark) {
  if (!Array.isArray(slots) || !slots.length || !rangeFits(mark, annotateSlots(slots))) return "";
  return wordLabel(mark, slots);
}

function stampMark(mark, slots, options = {}) {
  const stamped = copyMark(mark);
  const shenSource = options.shen || (!options.shangdi ? slots : null);
  const shangdiSource = options.shangdi || (!options.shen ? slots : null);
  const shen = shenSource ? phraseAt(shenSource, stamped) : "";
  const shangdi = shangdiSource ? phraseAt(shangdiSource, stamped) : "";
  if (shen) stamped.shen = shen;
  if (shangdi) stamped.shangdi = shangdi;
  return stamped;
}

function markCovers(mark, slot) {
  return mark.verse === slot.verse && slot.index >= mark.from && slot.index <= mark.to;
}

function findRuns(slots, word) {
  const runs = [];
  for (let start = 0; start < slots.length; start += 1) {
    let text = "";
    for (let end = start; end < slots.length; end += 1) {
      if (end > start) {
        const previous = slots[end - 1];
        const here = slots[end];
        if (!previous.joinNext || previous.verse !== here.verse || here.index !== previous.index + 1) break;
      }
      text += slots[end].text;
      if (text === word) {
        runs.push({ verse: slots[start].verse, from: slots[start].index, to: slots[end].index });
        break;
      }
      if (!word.startsWith(text)) break;
    }
  }
  return runs;
}

function rangeFits(mark, slots) {
  const matched = slots.filter((slot) => markCovers(mark, slot));
  if (matched.length !== mark.to - mark.from + 1) return false;
  for (let index = 1; index < matched.length; index += 1) {
    const previous = slots.indexOf(matched[index - 1]);
    const here = slots.indexOf(matched[index]);
    if (here !== previous + 1) return false;
    if (!matched[index - 1].joinNext || matched[index].index !== matched[index - 1].index + 1) return false;
  }
  return true;
}

function joinedText(pieces, field) {
  if (!pieces.length || pieces.some((item) => typeof item[field] !== "string" || !item[field])) return "";
  return pieces.map((item) => item[field]).join("");
}

function coalesceMarks(marks, slots) {
  const covered = new Array(slots.length).fill(false);
  const owners = new Array(slots.length).fill(null);
  for (const mark of marks) {
    if (!rangeFits(mark, slots)) continue;
    slots.forEach((slot, index) => {
      if (!markCovers(mark, slot)) return;
      covered[index] = true;
      owners[index] = mark;
    });
  }
  const out = [];
  let start = -1;
  const close = (end) => {
    const pieces = [];
    let previous = null;
    for (let index = start; index <= end; index += 1) {
      const mark = owners[index];
      if (!mark || mark === previous) continue;
      pieces.push(mark);
      previous = mark;
    }
    const mark = { verse: slots[start].verse, from: slots[start].index, to: slots[end].index };
    const shen = joinedText(pieces, "shen");
    const shangdi = joinedText(pieces, "shangdi");
    if (shen) mark.shen = shen;
    if (shangdi) mark.shangdi = shangdi;
    out.push(mark);
    start = -1;
  };
  for (let index = 0; index < slots.length; index += 1) {
    if (!covered[index]) {
      if (start >= 0) close(index - 1);
      continue;
    }
    if (start < 0) {
      start = index;
      continue;
    }
    const previous = slots[index - 1];
    const here = slots[index];
    const joined = previous.joinNext && previous.verse === here.verse && here.index === previous.index + 1;
    if (!joined) {
      close(index - 1);
      start = index;
    }
  }
  if (start >= 0) close(slots.length - 1);
  return out;
}

export function normalizeWords(words) {
  if (!Array.isArray(words)) return [];
  const list = [];
  const seen = new Set();
  for (const word of words) {
    if (typeof word === "string") {
      const clean = word.trim();
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      list.push(clean);
    } else if (isMark(word)) {
      const mark = copyMark(word);
      const key = `${mark.verse}:${mark.from}-${mark.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(mark);
    }
    if (list.length >= WORD_LIMIT) break;
  }
  return list;
}

function recordedPhrases(mark, edition) {
  const preferred = edition === "shangdi" ? mark.shangdi : mark.shen;
  const other = edition === "shangdi" ? mark.shen : mark.shangdi;
  const list = [];
  if (typeof preferred === "string" && preferred) list.push(preferred);
  if (typeof other === "string" && other && other !== preferred) list.push(other);
  return list;
}

function positionAgrees(mark, slots, edition) {
  if (!rangeFits(mark, slots)) return false;
  const current = wordLabel(mark, slots);
  if (!current) return false;
  const known = recordedPhrases(mark, edition);
  if (!known.length) return true;
  if (edition === "shen" || edition === "shangdi") return current === known[0];
  return known.includes(current);
}

function recoverMark(mark, slots, edition) {
  const phrases = recordedPhrases(mark, edition || "shen");
  for (const phrase of phrases) {
    const runs = findRuns(slots, phrase);
    if (runs.length === 1) return copyMark({ ...mark, ...runs[0] });
    if (runs.length > 1) return phrase;
  }
  return phrases[0] || "";
}

/** Turn saved strings into verse positions when each phrase occurs once, then merge neighbours. */
export function resolveWords(words, slots, edition = "") {
  const input = normalizeWords(words);
  if (!Array.isArray(slots) || !slots.length) return input;
  const ready = annotateSlots(slots);
  const marks = [];
  const pending = [];
  for (const item of input) {
    if (isMark(item)) {
      if (positionAgrees(item, ready, edition)) {
        marks.push(copyMark(item));
        continue;
      }
      if (item.shen || item.shangdi) {
        const recovered = recoverMark(item, ready, edition);
        if (isMark(recovered)) marks.push(recovered);
        else if (recovered) pending.push(recovered);
      }
      continue;
    }
    const runs = findRuns(ready, item);
    if (runs.length === 1) marks.push(runs[0]);
    else pending.push(item);
  }
  return normalizeWords([...coalesceMarks(marks, ready), ...pending]);
}

export function wordLabel(word, slots) {
  if (typeof word === "string") return word;
  if (!isMark(word) || !Array.isArray(slots)) return "";
  const ready = annotateSlots(slots);
  const parts = [];
  for (let index = word.from; index <= word.to; index += 1) {
    const slot = ready.find((item) => item.verse === word.verse && item.index === index);
    if (!slot) return "";
    parts.push(slot.text);
  }
  return parts.join("");
}

function bindWordSlots(words, slots, edition = "") {
  const ready = annotateSlots(slots);
  const owners = new Array(ready.length).fill(false);
  for (const item of resolveWords(words, ready, edition)) {
    if (!isMark(item)) continue;
    ready.forEach((slot, index) => {
      if (markCovers(item, slot)) owners[index] = true;
    });
  }
  return owners;
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

export function toggleWord(words, raw, options = {}) {
  const clean = String(raw || "").trim();
  const slots = Array.isArray(options.slots) ? annotateSlots(options.slots) : null;
  const list = slots ? resolveWords(words, slots, options.edition || "") : normalizeWords(words);
  if (!clean || !isSelectableWord(clean)) return { words: list, limited: false };
  const slotIndex = Number(options.slotIndex);
  const slotted =
    slots &&
    Number.isInteger(slotIndex) &&
    slotIndex >= 0 &&
    slotIndex < slots.length &&
    slots[slotIndex].text === clean;
  if (!slotted) {
    const index = list.findIndex((item) => item === clean);
    if (index >= 0) return { words: list.filter((_, item) => item !== index), limited: false };
    if (list.length >= WORD_LIMIT) return { words: list, limited: true };
    return { words: [...list, clean], limited: false };
  }
  const slot = slots[slotIndex];
  const current = list.find((item) => isMark(item) && markCovers(item, slot));
  if (current) return { words: list.filter((item) => item !== current), limited: false };
  const previous = slotIndex > 0 ? slots[slotIndex - 1] : null;
  const nextSlot = slotIndex + 1 < slots.length ? slots[slotIndex + 1] : null;
  const left =
    previous && previous.joinNext && previous.verse === slot.verse && slot.index === previous.index + 1
      ? list.find((item) => isMark(item) && markCovers(item, previous))
      : null;
  const right =
    slot.joinNext && nextSlot && nextSlot.verse === slot.verse && nextSlot.index === slot.index + 1
      ? list.find((item) => isMark(item) && markCovers(item, nextSlot))
      : null;
  if (!left && !right && list.length >= WORD_LIMIT) return { words: list, limited: true };
  const merged = stampMark(
    {
      verse: slot.verse,
      from: left ? left.from : slot.index,
      to: right ? right.to : slot.index,
    },
    slots,
    options
  );
  const drop = new Set([left, right].filter(Boolean));
  const next = [];
  let placed = false;
  for (const item of list) {
    if (drop.has(item)) {
      if (!placed) {
        next.push(merged);
        placed = true;
      }
      continue;
    }
    next.push(item);
  }
  if (!placed) next.push(merged);
  return { words: normalizeWords(next), limited: false };
}

export function removeWord(words, target, slots, edition = "") {
  const list = Array.isArray(slots) && slots.length ? resolveWords(words, slots, edition) : normalizeWords(words);
  if (isMark(target)) {
    return { words: list.filter((item) => !(isMark(item) && sameMark(item, target))), limited: false };
  }
  const clean = String(target || "").trim();
  return { words: list.filter((item) => item !== clean), limited: false };
}

export function formatMarkedWords(words, slots, edition = "") {
  const list = Array.isArray(slots) ? resolveWords(words, slots, edition) : normalizeWords(words);
  return list
    .map((word) => {
      const text = wordLabel(word, slots);
      return text ? `「${text}」` : "";
    })
    .filter(Boolean)
    .join("、");
}

export function feelingLabel(pick) {
  if (!pick || typeof pick !== "object") return "";
  const fine = String(pick.feelingZh || "").trim();
  if (fine) return fine;
  return String(pick.coreZh || "").trim();
}

export function fillPrayerFrame(template, context = {}) {
  const words = formatMarkedWords(context.words, context.slots, context.edition);
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

function verseAttrs(label, speakingVerse) {
  const on = speakingVerse && String(speakingVerse) === String(label);
  const verseAttr = label ? ` data-verse="${esc(label)}"` : "";
  return `<p class="verse${on ? " is-speaking" : ""}"${verseAttr}>`;
}

function verseBodyHtml(verse, speakingVerse) {
  const label = verseScreenLabel(verse.n, verse.text);
  const num = verse.n ? `<sup class="vnum">${esc(verse.n)}</sup>` : "";
  return `${verseAttrs(verse.n, speakingVerse)}<span class="sr-only">${esc(label)}</span><span class="verse-visual" aria-hidden="true">${num}${esc(verse.text)}</span></p>`;
}

function wordSpoken(text, on) {
  return fill(on ? ui.words.spokenOn : ui.words.spokenOff, { word: text });
}

function tokenPunct(text) {
  return text ? `<span class="token-punct">${esc(text)}</span>` : "";
}

function tokenFace(slotIndex, slots, owners) {
  if (!owners[slotIndex]) return "";
  const joinedPrev = slotIndex > 0 && owners[slotIndex - 1] && slots[slotIndex - 1]?.joinNext;
  const joinedNext = Boolean(slots[slotIndex]?.joinNext && owners[slotIndex + 1]);
  let face = "is-on";
  if (!joinedPrev) face += " is-run-start";
  if (!joinedNext) face += " is-run-end";
  return face;
}

function tokenButton(token, face = "", prefix = "", suffix = "", slotIndex = -1, label = "", tabIndex = "0") {
  const value = token.text.trim();
  const slot = slotIndex >= 0 ? ` data-slot="${slotIndex}"` : "";
  const on = face.includes("is-on");
  const spoken = label ? ` aria-label="${esc(label)}"` : "";
  const button = `<span role="button" tabindex="${tabIndex}" class="token${face ? ` ${face}` : ""}" data-action="toggle-word" data-word="${esc(value)}"${slot} aria-pressed="${on ? "true" : "false"}"${spoken}>${esc(token.text)}</span>`;
  if (!prefix && !suffix) return button;
  return `<span class="token-glue">${tokenPunct(prefix)}${button}${tokenPunct(suffix)}</span>`;
}

function versePrefix(n) {
  if (!n) return "";
  return `<span class="sr-only">${esc(verseSpoken(n))}。</span><sup class="vnum">${esc(n)}</sup>`;
}

function renderRun(run, tab) {
  const label = wordSpoken(run.text, run.on);
  if (run.parts.length === 1) {
    const part = run.parts[0];
    return tokenButton({ text: part.raw }, part.face, run.prefix, run.suffix, part.slotIndex, label, tab);
  }
  const inner = run.parts
    .map(
      (part) =>
        `<span class="token${part.face ? ` ${part.face}` : ""}" data-word="${esc(part.text)}" aria-pressed="${run.on ? "true" : "false"}" aria-hidden="true">${esc(part.raw)}</span>`
    )
    .join("");
  const first = run.parts[0];
  const button = `<span role="button" tabindex="${tab}" class="token-run" data-action="toggle-word" data-word="${esc(first.text)}" data-slot="${first.slotIndex}" aria-pressed="${run.on ? "true" : "false"}" aria-label="${esc(label)}">${inner}</span>`;
  if (!run.prefix && !run.suffix) return button;
  return `<span class="token-glue">${tokenPunct(run.prefix)}${button}${tokenPunct(run.suffix)}</span>`;
}

function atomsHtml(tokens, owners, slotState, slots) {
  const items = [];
  const mark = () => {
    const slotIndex = slotState.index;
    slotState.index += 1;
    return { face: tokenFace(slotIndex, slots, owners), slotIndex };
  };
  const pushWord = (token, prefix, suffix) => {
    const selected = mark();
    items.push({
      kind: "word",
      text: token.text.trim(),
      raw: token.text,
      prefix,
      suffix,
      face: selected.face,
      slotIndex: selected.slotIndex,
      on: selected.face.includes("is-on"),
    });
  };
  for (let cursor = 0; cursor < tokens.length; cursor += 1) {
    const token = tokens[cursor];
    if (token.kind === "verse") {
      items.push({ kind: "html", html: versePrefix(token.text) });
      continue;
    }
    if (token.kind === "close" || token.kind === "other") {
      items.push({ kind: "html", html: esc(token.text) });
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
        pushWord(next, token.text, suffix);
        cursor = look - 1;
        continue;
      }
      items.push({ kind: "html", html: esc(token.text) });
      continue;
    }
    let suffix = "";
    let look = cursor + 1;
    while (look < tokens.length && tokens[look].kind === "close") {
      suffix += tokens[look].text;
      look += 1;
    }
    pushWord(token, "", suffix);
    cursor = look - 1;
  }
  const tab = "0";
  let html = "";
  let run = null;
  const flush = () => {
    if (!run) return;
    html += renderRun(run, tab);
    run = null;
  };
  for (const item of items) {
    if (item.kind !== "word") {
      flush();
      html += item.html;
      continue;
    }
    const prevSlot = run ? run.slotIndexes[run.slotIndexes.length - 1] : -1;
    const joined = run && run.on && item.on && !item.prefix && slots[prevSlot]?.joinNext;
    if (joined) {
      run.parts.push(item);
      run.slotIndexes.push(item.slotIndex);
      run.text += item.text;
      run.suffix = item.suffix;
      continue;
    }
    flush();
    run = {
      on: item.on,
      text: item.text,
      prefix: item.prefix,
      suffix: item.suffix,
      parts: [item],
      slotIndexes: [item.slotIndex],
    };
  }
  flush();
  return html;
}

function tokenBlocks(line) {
  const blocks = [];
  let current = null;
  const start = (verseText) => {
    current = { key: verseKey(verseText), label: verseText, prefix: versePrefix(verseText), tokens: [] };
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

export function passageHtml(text, segmented = "", words = [], edition = "", options = {}) {
  const source = String(text || "");
  if (!source.trim()) {
    return `<p class="placeholder">${esc(ui.passage.placeholder)}</p>`;
  }
  const speakingVerse = options?.speakingVerse || "";
  const tokens = segmentMode(source, segmented) === "tokens";
  const parts = [];
  let previous = null;
  if (tokens) {
    const slots = passageSlots(source, segmented);
    const owners = bindWordSlots(words, slots, edition);
    const slotState = { index: 0 };
    for (const line of String(segmented).split("\n")) {
      if (!line.trim()) continue;
      for (const block of tokenBlocks(line)) {
        if (previous && block.key && !versesContinue(previous, block.key)) {
          parts.push(`<p class="verse-gap">${esc(ui.passage.skip)}</p>`);
        }
        if (block.key) previous = block.key;
        const visual = `${block.prefix}${atomsHtml(block.tokens, owners, slotState, slots)}`;
        parts.push(`${verseAttrs(block.label, speakingVerse)}${visual}</p>`);
      }
    }
  } else {
    for (const verse of parseVerses(source)) {
      const key = verseKey(verse.n);
      if (previous && key && !versesContinue(previous, key)) {
        parts.push(`<p class="verse-gap">${esc(ui.passage.skip)}</p>`);
      }
      if (key) previous = key;
      parts.push(verseBodyHtml(verse, speakingVerse));
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

/** English codes only. Chinese labels and free text never become a stats path. */
export const STATS_DAY_MAX = 27;
export const FEELING_CORE_IDS = Object.freeze(["joy", "peace", "powerful", "sad", "scared", "mad"]);
export const FEELING_SLUGS = Object.freeze([
  "excited",
  "expectant",
  "cheerful",
  "energetic",
  "creative",
  "hopeful",
  "cared_for",
  "trusting",
  "loved",
  "close",
  "thoughtful",
  "content",
  "aware",
  "proud",
  "respected",
  "appreciated",
  "valued",
  "faithful",
  "guilty",
  "ashamed",
  "depressed",
  "lonely",
  "bored",
  "tired",
  "rejected",
  "confused",
  "helpless",
  "withdrawn",
  "insecure",
  "anxious",
  "hurt",
  "hostile",
  "angry",
  "jealous",
  "resentful",
  "critical",
]);

function allowedCode(value, list) {
  const code = slug(value);
  return list.includes(code) ? code : "";
}

/**
 * Anonymous feeling event. Callers must not pass notes; this reads only
 * the controlled vocabulary fields and the intensity number.
 * The path is English codes from the whitelist, never the written sentence.
 */
export function anonymousFeelingEvent(dayNumber, before, after) {
  const day = Number(dayNumber);
  if (!Number.isInteger(day) || day < 1 || day > STATS_DAY_MAX) return null;
  const beforeCore = allowedCode(before?.coreId, FEELING_CORE_IDS);
  const afterCore = allowedCode(after?.coreId, FEELING_CORE_IDS);
  const beforeFeeling = allowedCode(before?.feelingEn, FEELING_SLUGS);
  const afterFeeling = allowedCode(after?.feelingEn, FEELING_SLUGS);
  const intensityOk = (value) => {
    const level = Number(value);
    return Number.isInteger(level) && level >= 1 && level <= 5;
  };
  if (!beforeCore || !afterCore || !beforeFeeling || !afterFeeling) return null;
  if (!intensityOk(before?.intensity) || !intensityOk(after?.intensity)) return null;
  const path = [
    "feeling",
    String(day),
    beforeCore,
    beforeFeeling,
    String(before.intensity),
    afterCore,
    afterFeeling,
    String(after.intensity),
  ].join("/");
  return { path, event: true };
}

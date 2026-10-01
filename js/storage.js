import { normalizeWords } from "./logic.js";

const KEY = "advent2026.v1";

export function emptyState() {
  return {
    edition: "shen",
    shareFeelings: false,
    careDismissedOn: "",
    days: {},
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const data = JSON.parse(raw);
    return {
      edition: data.edition === "shangdi" ? "shangdi" : "shen",
      shareFeelings: data.shareFeelings === true,
      careDismissedOn: typeof data.careDismissedOn === "string" ? data.careDismissedOn : "",
      days: normalizeDays(data.days),
    };
  } catch {
    return emptyState();
  }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function blankDay() {
  return {
    before: null,
    after: null,
    draftBefore: null,
    draftAfter: null,
    reflect1: "",
    reflect2: "",
    completed: false,
    reached: "quiet",
    feelingShared: false,
    completionSent: false,
    words: [],
  };
}

const MARK_LOCKS = ["locked", "marking", "markingLocked", "wordsLocked", "markLocked"];

/** Older journals may store a finished-marking flag. It must not block taps. */
export function withoutMarkLock(entry) {
  if (!entry || typeof entry !== "object") return entry;
  for (const key of MARK_LOCKS) delete entry[key];
  return entry;
}

function normalizeDays(days) {
  if (!days || typeof days !== "object") return {};
  const out = {};
  for (const [key, entry] of Object.entries(days)) {
    if (!entry || typeof entry !== "object") continue;
    out[key] = withoutMarkLock({ ...blankDay(), ...entry, words: normalizeWords(entry.words) });
  }
  return out;
}

export function dayState(state, dayNumber) {
  const key = String(dayNumber);
  if (!state.days[key]) state.days[key] = blankDay();
  const entry = state.days[key];
  entry.words = normalizeWords(entry.words);
  return withoutMarkLock(entry);
}

export function clearJournal(state) {
  state.days = {};
  state.careDismissedOn = "";
}

/** Map plan date → saved day record, for streak checks. */
export function entriesByDate(planDays, state) {
  const map = {};
  for (const day of planDays) {
    const entry = state.days[String(day.day)];
    if (entry) map[day.date] = entry;
  }
  return map;
}

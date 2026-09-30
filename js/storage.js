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
    const base = emptyState();
    return {
      edition: data.edition === "shangdi" ? "shangdi" : "shen",
      shareFeelings: data.shareFeelings === true,
      careDismissedOn: typeof data.careDismissedOn === "string" ? data.careDismissedOn : "",
      days: data.days && typeof data.days === "object" ? data.days : base.days,
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
  };
}

export function dayState(state, dayNumber) {
  const key = String(dayNumber);
  if (!state.days[key]) state.days[key] = blankDay();
  return state.days[key];
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

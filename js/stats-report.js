/** Turn GoatCounter hit lists into counts safe to show Lohas. */

export const SMALL_COUNT = 5;
export const UNDER_FIVE = "少於 5";

export function shownCount(count, kind) {
  const n = Math.max(0, Number(count) || 0);
  if ((kind === "feeling" || kind === "intensity") && n < SMALL_COUNT) return UNDER_FIVE;
  return String(n);
}

function add(map, key, amount) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + (Number(amount) || 0));
}

function rows(map, kind, compare) {
  return [...map.entries()]
    .sort(compare)
    .map(([key, count]) => ({ key, count, label: shownCount(count, kind) }));
}

/**
 * hits items look like GoatCounter's /api/v0/stats/hits entries:
 * { path, count, event, stats: [{ day, daily }] }.
 * Core totals stay numeric. Fine feelings and intensity under 5 become「少於 5」.
 */
export function summarizeStats(hits) {
  const opens = new Map();
  const completes = new Map();
  const cores = new Map();
  const feelings = new Map();
  const intensities = new Map();
  for (const hit of hits || []) {
    const path = String(hit?.path || "").replace(/^\/+/, "");
    const count = Number(hit?.count) || 0;
    const days = Array.isArray(hit?.stats) ? hit.stats : [];
    if (path.startsWith("anon-feeling/")) {
      const parts = path.split("/");
      if (parts.length < 8) continue;
      add(cores, parts[2], count);
      add(cores, parts[5], count);
      add(feelings, parts[3], count);
      add(feelings, parts[6], count);
      add(intensities, parts[4], count);
      add(intensities, parts[7], count);
      continue;
    }
    const bucket = path.startsWith("complete-reading/") ? completes : opens;
    if (!days.length) add(bucket, "total", count);
    for (const stat of days) add(bucket, stat.day, Number(stat.daily) || 0);
  }
  const byDay = (left, right) => String(left[0]).localeCompare(String(right[0]));
  const byCount = (left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0]));
  return {
    opens: rows(opens, "day", byDay),
    completes: rows(completes, "day", byDay),
    cores: rows(cores, "core", byCount),
    feelings: rows(feelings, "feeling", byCount),
    intensities: rows(intensities, "intensity", (left, right) => Number(left[0]) - Number(right[0])),
  };
}

export const DEMO_HITS = Object.freeze([
  {
    path: "/",
    count: 12,
    event: false,
    stats: [
      { day: "2026-11-29", daily: 8 },
      { day: "2026-11-30", daily: 4 },
    ],
  },
  {
    path: "/day/1",
    count: 6,
    event: false,
    stats: [{ day: "2026-11-29", daily: 6 }],
  },
  {
    path: "complete-reading/1",
    count: 7,
    event: true,
    stats: [{ day: "2026-11-29", daily: 7 }],
  },
  {
    path: "complete-reading/2",
    count: 3,
    event: true,
    stats: [{ day: "2026-11-30", daily: 3 }],
  },
  { path: "anon-feeling/1/sad/lonely/4/peace/calm/2", count: 6, event: true, stats: [] },
  { path: "anon-feeling/1/joy/hopeful/2/sad/lonely/3", count: 2, event: true, stats: [] },
]);

/**
 * GoatCounter counts use a fixed path and title whitelist.
 * Page views are "open". Completed reading is "day-N-done".
 * Feelings are English codes and are sent only when the reader opts in.
 * The count request is a direct GET to /count with only p, t, e, and rnd.
 */

import { FEELING_CORE_IDS, FEELING_SLUGS, STATS_DAY_MAX } from "./logic.js";

const INTENSITIES = Object.freeze(["1", "2", "3", "4", "5"]);

let configured = false;
let usageAllowed = false;
let endpoint = "";
const queue = [];
let transport = defaultTransport;

export function statsPolicy({ code }) {
  const site = Boolean(String(code || "").trim());
  return { configured: site, usage: site };
}

function endpointFor(code) {
  const site = String(code || "").trim();
  if (!site) return "";
  if (site.startsWith("http://") || site.startsWith("https://")) return site;
  return `https://${site}.goatcounter.com/count`;
}

export function openStatsPath() {
  return "open";
}

export function doneStatsPath(dayNumber) {
  const day = Number(dayNumber);
  if (!Number.isInteger(day) || day < 1 || day > STATS_DAY_MAX) return "";
  return `day-${day}-done`;
}

export function isFeelingStatsPath(path) {
  const parts = String(path || "").split("/");
  if (parts.length !== 8 || parts[0] !== "feeling") return false;
  const [, day, beforeCore, beforeFeeling, beforeIntensity, afterCore, afterFeeling, afterIntensity] = parts;
  const dayNumber = Number(day);
  if (!Number.isInteger(dayNumber) || String(dayNumber) !== day || dayNumber < 1 || dayNumber > STATS_DAY_MAX) {
    return false;
  }
  if (!FEELING_CORE_IDS.includes(beforeCore) || !FEELING_CORE_IDS.includes(afterCore)) return false;
  if (!FEELING_SLUGS.includes(beforeFeeling) || !FEELING_SLUGS.includes(afterFeeling)) return false;
  return INTENSITIES.includes(beforeIntensity) && INTENSITIES.includes(afterIntensity);
}

export function isAllowedStatsPath(path) {
  if (path === "open") return true;
  if (/^day-([1-9]|1\d|2[0-7])-done$/.test(path)) return true;
  return isFeelingStatsPath(path);
}

export function statsTitleFor(path) {
  if (!isAllowedStatsPath(path)) return "";
  return path.startsWith("feeling/") ? "feeling" : path;
}

export function statsPathWhitelist() {
  const opens = ["open"];
  const done = [];
  for (let day = 1; day <= STATS_DAY_MAX; day += 1) done.push(`day-${day}-done`);
  return {
    opens,
    done,
    feelingTitle: "feeling",
    days: Array.from({ length: STATS_DAY_MAX }, (_, index) => index + 1),
    cores: FEELING_CORE_IDS,
    feelings: FEELING_SLUGS,
    intensities: [1, 2, 3, 4, 5],
  };
}

export function statsCountUrl(countEndpoint, hit, randomValue) {
  const rnd = String(randomValue ?? Math.random().toString(36).slice(2, 8)).replace(/[^a-z0-9]/gi, "") || "1";
  const params = new URLSearchParams();
  params.set("p", hit.path);
  params.set("t", hit.title);
  params.set("e", hit.event ? "true" : "false");
  params.set("rnd", rnd);
  return `${countEndpoint}?${params.toString()}`;
}

function defaultTransport(url) {
  if (typeof fetch !== "function") return;
  fetch(url, {
    method: "GET",
    mode: "no-cors",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    keepalive: true,
    cache: "no-store",
  }).catch(() => {});
}

export function useStatsTransport(fn) {
  transport = typeof fn === "function" ? fn : defaultTransport;
}

export function resetStatsState() {
  configured = false;
  usageAllowed = false;
  endpoint = "";
  queue.length = 0;
  transport = defaultTransport;
}

function flush() {
  if (!usageAllowed || !endpoint) return;
  while (queue.length) {
    const hit = queue.shift();
    transport(statsCountUrl(endpoint, hit));
  }
}

function sendHit(path, event, sharing) {
  if (!usageAllowed) return false;
  if (event && sharing !== true) return false;
  const title = statsTitleFor(path);
  if (!title || !isAllowedStatsPath(path)) return false;
  if (event !== isFeelingStatsPath(path)) return false;
  queue.push({ path, title, event, referrer: "" });
  flush();
  return true;
}

export function initStats(code) {
  const policy = statsPolicy({ code });
  usageAllowed = policy.usage;
  endpoint = endpointFor(code);
  configured = policy.configured;
}

export function statsEnabled() {
  return configured;
}

export function trackOpen() {
  return sendHit("open", false, false);
}

export function trackComplete(dayNumber) {
  return sendHit(doneStatsPath(dayNumber), false, false);
}

export function trackFeelings(payload, sharing = false) {
  if (sharing !== true) return false;
  return sendHit(payload?.path || "", true, true);
}

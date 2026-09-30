/**
 * GoatCounter counts use a fixed path and title whitelist.
 * Page views are "open". Completed reading is "day-N-done".
 * Feelings are English codes and are sent only when the reader opts in.
 * The count request sends an empty referrer and omits the page address.
 */

import { FEELING_CORE_IDS, FEELING_SLUGS, STATS_DAY_MAX } from "./logic.js";

const INTENSITIES = Object.freeze(["1", "2", "3", "4", "5"]);

let configured = false;
let usageAllowed = false;
let endpoint = "";
let scriptRequested = false;
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

export function statsCountUrl(countEndpoint, hit, screenWidth) {
  const params = new URLSearchParams();
  params.set("p", hit.path);
  params.set("t", hit.title);
  params.set("r", "");
  params.set("e", hit.event ? "true" : "false");
  if (screenWidth) params.set("s", String(screenWidth));
  return `${countEndpoint}?${params.toString()}`;
}

function screenWidth() {
  const width = globalThis.window?.screen?.width;
  return Number.isFinite(width) && width > 0 ? Math.round(width) : 0;
}

function defaultTransport(url) {
  if (typeof fetch !== "function") return;
  fetch(url, {
    method: "POST",
    mode: "no-cors",
    keepalive: true,
    referrerPolicy: "no-referrer",
  }).catch(() => {});
}

export function useStatsTransport(fn) {
  transport = typeof fn === "function" ? fn : defaultTransport;
}

export function resetStatsState() {
  configured = false;
  usageAllowed = false;
  endpoint = "";
  scriptRequested = false;
  queue.length = 0;
  transport = defaultTransport;
}

function loadScript() {
  if (scriptRequested || !endpoint || typeof document === "undefined") return;
  scriptRequested = true;
  const settings = { no_onload: true, no_events: true, referrer: "" };
  window.goatcounter = Object.assign(window.goatcounter || {}, settings, {
    path() {
      return null;
    },
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://gc.zgo.at/count.js";
  script.dataset.goatcounter = endpoint;
  script.dataset.goatcounterSettings = JSON.stringify(settings);
  script.addEventListener("load", () => {
    flush();
  });
  document.head.appendChild(script);
}

function flush() {
  if (!usageAllowed || !endpoint) return;
  while (queue.length) {
    const hit = queue.shift();
    transport(statsCountUrl(endpoint, hit, screenWidth()));
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
  if (usageAllowed) loadScript();
}

export function statsEnabled() {
  return configured;
}

export function statsScriptRequested() {
  return scriptRequested;
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

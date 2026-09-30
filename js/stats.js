/**
 * GoatCounter counts use a fixed path and title whitelist.
 * Paths are names such as open, open-day-5, day-5-done, and feeling codes.
 * The count request sends an empty referrer and omits the page address.
 * count.js is not loaded until counting is allowed.
 */

import { FEELING_CORE_IDS, FEELING_SLUGS, STATS_DAY_MAX } from "./logic.js";

const INTENSITIES = Object.freeze(["1", "2", "3", "4", "5"]);
const OPEN_PAGES = Object.freeze({
  home: "open",
  plan: "open-plan",
  about: "open-about",
});

let configured = false;
let mustOpt = false;
let usageAllowed = false;
let endpoint = "";
let scriptRequested = false;
const queue = [];
let transport = defaultTransport;

export function statsPolicy({ code, requireOptIn, optedIn, search }) {
  const site = Boolean(String(code || "").trim());
  const trial = new URLSearchParams(String(search || "").replace(/^\?/, "")).get("stats") === "optin";
  const must = trial || requireOptIn === true;
  return {
    configured: site,
    mustOpt: must,
    usage: site && (!must || optedIn === true),
  };
}

function endpointFor(code) {
  const site = String(code || "").trim();
  if (!site) return "";
  if (site.startsWith("http://") || site.startsWith("https://")) return site;
  return `https://${site}.goatcounter.com/count`;
}

export function isLocalHostname(hostname) {
  return /(^localhost$|^127\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^192\.168\.|^0\.0\.0\.0$)/.test(
    String(hostname || "")
  );
}

export function openStatsPath(page, dayNumber) {
  if (page === "day") {
    const day = Number(dayNumber);
    if (!Number.isInteger(day) || day < 1 || day > STATS_DAY_MAX) return "";
    return `open-day-${day}`;
  }
  return OPEN_PAGES[page] || "";
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
  if (path === "open" || path === "open-plan" || path === "open-about") return true;
  if (/^open-day-([1-9]|1\d|2[0-7])$/.test(path)) return true;
  if (/^day-([1-9]|1\d|2[0-7])-done$/.test(path)) return true;
  return isFeelingStatsPath(path);
}

export function statsTitleFor(path) {
  if (!isAllowedStatsPath(path)) return "";
  return path.startsWith("feeling/") ? "feeling" : path;
}

export function statsPathWhitelist() {
  const opens = ["open", "open-plan", "open-about"];
  const done = [];
  for (let day = 1; day <= STATS_DAY_MAX; day += 1) {
    opens.push(`open-day-${day}`);
    done.push(`day-${day}-done`);
  }
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
  const hostname = globalThis.location?.hostname || "";
  if (isLocalHostname(hostname)) return;
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
  mustOpt = false;
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

export function initStats(code, options = {}) {
  const policy = statsPolicy({
    code,
    requireOptIn: options.requireOptIn,
    optedIn: options.optedIn,
    search: options.search || "",
  });
  mustOpt = policy.mustOpt;
  usageAllowed = policy.usage;
  endpoint = endpointFor(code);
  configured = Boolean(endpoint);
  if (!configured) {
    usageAllowed = false;
    return;
  }
  if (usageAllowed) loadScript();
}

export function statsEnabled() {
  return configured;
}

export function statsCountsUsage() {
  return usageAllowed;
}

export function statsScriptRequested() {
  return scriptRequested;
}

export function setUsageOptIn(on) {
  usageAllowed = configured && (!mustOpt || on === true);
  if (usageAllowed) loadScript();
}

export function trackOpen(page, dayNumber) {
  return sendHit(openStatsPath(page, dayNumber), false, false);
}

export function trackComplete(dayNumber) {
  return sendHit(doneStatsPath(dayNumber), false, false);
}

export function trackFeelings(payload, sharing = false) {
  if (sharing !== true) return false;
  return sendHit(payload?.path || "", true, true);
}

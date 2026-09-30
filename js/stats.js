/**
 * GoatCounter is cookie-free and off unless config.js sets a site code.
 * Page views and "completed reading" are the only automatic events.
 * Feeling events are sent only after the reader opts in, and only with
 * day number, core id, finer-feeling id, and intensity — never notes.
 *
 * Counts stay in the GoatCounter dashboard, which needs a login.
 * stats.html is unlisted and reads the API in the browser; the app itself
 * only sends counts through count.js and never includes notes or words.
 */

import ui from "../ui-strings.json" with { type: "json" };
import { fill } from "./logic.js";

let enabled = false;
let mustOpt = false;
let usageAllowed = false;
const queue = [];

export function statsPolicy({ code, requireOptIn, optedIn, search }) {
  const configured = Boolean(String(code || "").trim());
  const trial = new URLSearchParams(String(search || "").replace(/^\?/, "")).get("stats") === "optin";
  const must = trial || requireOptIn === true;
  return {
    configured,
    mustOpt: must,
    usage: configured && (!must || optedIn === true),
  };
}

function endpointFor(code) {
  const site = String(code || "").trim();
  if (!site) return "";
  if (site.startsWith("http://") || site.startsWith("https://")) return site;
  return `https://${site}.goatcounter.com/count`;
}

function flush() {
  const count = window.goatcounter && window.goatcounter.count;
  if (typeof count !== "function") return;
  while (queue.length) count.call(window.goatcounter, queue.shift());
}

function send(payload) {
  if (!enabled || !payload) return;
  queue.push(payload);
  flush();
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
  const endpoint = endpointFor(code);
  if (!endpoint) return;
  enabled = true;
  window.goatcounter = window.goatcounter || {};
  window.goatcounter.no_onload = true;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://gc.zgo.at/count.js";
  script.dataset.goatcounter = endpoint;
  script.addEventListener("load", () => {
    flush();
    window.setTimeout(flush, 400);
  });
  document.head.appendChild(script);
}

export function statsEnabled() {
  return enabled;
}

export function statsCountsUsage() {
  return usageAllowed;
}

export function setUsageOptIn(on) {
  usageAllowed = enabled && (!mustOpt || on === true);
}

export function trackPage(path) {
  if (!usageAllowed) return false;
  send({
    path: path.startsWith("/") ? path : `/${path}`,
    title: document.title,
    event: false,
  });
  return true;
}

export function trackComplete(dayNumber) {
  if (!usageAllowed) return false;
  send({
    path: `complete-reading/${dayNumber}`,
    title: fill(ui.stats.completeTitle, { day: dayNumber }),
    event: true,
  });
  return true;
}

export function trackFeelings(payload) {
  if (!payload?.path || payload.path.includes("because") || /[\u3400-\u9fff]/.test(payload.path)) {
    return;
  }
  send({ path: payload.path, title: ui.stats.feelingTitle, event: true });
}

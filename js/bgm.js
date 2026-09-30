/**
 * 背景音樂。沒有存過開關時視為開啟，音量預設 20%。
 * 手機瀏覽器不准自動出聲，所以真正的 play() 要等第一次用家手勢
 * （pointerdown、keydown 或 touchend）。不彈出提示。
 * 用家關掉之後會記住，之後的手勢不再播放。
 *
 * iPhone Safari 的 HTMLMediaElement.volume 是唯讀的，永遠是 1。
 * 音量和朗讀時的降低都走 Web Audio 的 GainNode。
 * AudioContext 只在那一下手勢（或用家按下開關）裡建立並 resume。
 * 沒有 Web Audio 時才退回 audio.volume。
 * 朗讀時增益降到用家音量的四分之一，停止後回到用家音量。
 *
 * iOS 在 speechSynthesis 開始或結束時，可能把正在播的 audio 暫停。
 * 只要開關仍然開著，系統暫停會再 play()，朗讀和音樂可以同時聽。
 *
 * 曲目按讀經週次。預設該週的 a。?week=1..4 強制週次，?bgm=a|b 揀候選。
 * 計劃開始前用第一週，結束後用第四週。
 */

export const BGM_STORAGE_KEY = "advent2026.bgm";
export const BGM_VOLUME_KEY = "advent2026.bgmVolume";
export const BGM_DEFAULT_VOLUME = 0.2;
/** Speech ducks to about one quarter of the reader's own volume. */
export const BGM_DUCK_RATIO = 0.25;
/** setTargetAtTime time constant, in seconds. */
export const BGM_FADE = 0.12;

const CC0 = "http://creativecommons.org/publicdomain/zero/1.0/";

function track(fields) {
  return Object.freeze({ license: CC0, licenseName: "CC0 1.0", melody: "", ...fields });
}

export const BGM_WEEKS = Object.freeze({
  1: Object.freeze({
    a: track({
      id: "w1-a",
      week: 1,
      slot: "a",
      src: "./assets/bgm/w1-a.mp3",
      title: "Piano Drone Loop",
      author: "kkenny101",
      source: "https://freesound.org/people/kkenny101/sounds/869196/",
      weekLabel: "第一週",
      theme: "在黑暗中等候",
    }),
    b: track({
      id: "w1-b",
      week: 1,
      slot: "b",
      src: "./assets/bgm/w1-b.mp3",
      title: "Slow Ethereal Piano loop 80bpm",
      author: "Boatlanman-",
      source: "https://freesound.org/people/Boatlanman-/sounds/818034/",
      weekLabel: "第一週",
      theme: "在黑暗中等候",
    }),
  }),
  2: Object.freeze({
    a: track({
      id: "w2-a",
      week: 2,
      slot: "a",
      src: "./assets/bgm/w2-a.mp3",
      title: "Piano Ambience chord progression 82bpm (sharps keys not quantized, natural)",
      author: "CVLTIV8R",
      source: "https://freesound.org/people/CVLTIV8R/sounds/810857/",
      weekLabel: "第二週",
      theme: "預備道路",
    }),
    b: track({
      id: "w2-b",
      week: 2,
      slot: "b",
      src: "./assets/bgm/w2-b.mp3",
      title: "Atmospheric Piano & Violin Music 01",
      author: "Magmi.Soundtracks",
      source: "https://freesound.org/people/Magmi.Soundtracks/sounds/478255/",
      weekLabel: "第二週",
      theme: "預備道路",
    }),
  }),
  3: Object.freeze({
    a: track({
      id: "w3-a",
      week: 3,
      slot: "a",
      src: "./assets/bgm/w3-a.mp3",
      title: "Sleepy Upright Piano Seamless Loop",
      author: "blankie.rest",
      source: "https://freesound.org/people/blankie.rest/sounds/859607/",
      weekLabel: "第三週",
      theme: "等候的人",
    }),
    b: track({
      id: "w3-b",
      week: 3,
      slot: "b",
      src: "./assets/bgm/w3-b.mp3",
      title: "peaceful ambient pad",
      author: "jjwoosh",
      source: "https://freesound.org/people/jjwoosh/sounds/743772/",
      weekLabel: "第三週",
      theme: "等候的人",
    }),
  }),
  4: Object.freeze({
    a: track({
      id: "w4-a",
      week: 4,
      slot: "a",
      src: "./assets/bgm/w4-a.mp3",
      title: "SandsShift.wav",
      author: "Bigvegie",
      source: "https://freesound.org/people/Bigvegie/sounds/623859/",
      weekLabel: "第四週",
      theme: "降生",
    }),
    b: track({
      id: "w4-b",
      week: 4,
      slot: "b",
      src: "./assets/bgm/w4-b.mp3",
      title: "Piano lullaby",
      author: "ctribolet",
      source: "https://freesound.org/people/ctribolet/sounds/713537/",
      weekLabel: "第四週",
      theme: "降生",
    }),
  }),
});

export const BGM_SRC = BGM_WEEKS[1].a.src;

let audio = null;
let context = null;
let gain = null;
let ducked = false;
let wantPlay = false;
let resuming = false;
let gestureStarted = false;
let audioCtor = null;
let contextCtor = null;
let userVolume = BGM_DEFAULT_VOLUME;
let activeSrc = "";
let reading = { search: "", date: "", days: null, season: null };

export function clampBgmVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return BGM_DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

export function readingWeek(dateIso, days, season) {
  const list = Array.isArray(days) ? days : [];
  const first = list[0]?.week || 1;
  const last = list[list.length - 1]?.week || 4;
  if (!dateIso || !season?.start || dateIso < season.start) return first;
  if (dateIso > season.end) return last;
  const exact = list.find((day) => day.date === dateIso);
  if (exact?.week) return exact.week;
  let nearest = list[0];
  let best = Infinity;
  for (const day of list) {
    const gap = Math.abs(Date.parse(day.date) - Date.parse(dateIso));
    if (Number.isFinite(gap) && gap < best) {
      best = gap;
      nearest = day;
    }
  }
  return nearest?.week || first;
}

export function resolveBgmTrack(search = "", dateIso = "", days = null, season = null) {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const forced = Number(params.get("week"));
  const week = forced >= 1 && forced <= 4 ? forced : readingWeek(dateIso, days, season);
  const slot = params.get("bgm") === "b" ? "b" : "a";
  return BGM_WEEKS[week][slot];
}

export function bgmTrack() {
  return resolveBgmTrack(reading.search, reading.date, reading.days, reading.season);
}

export function selectBgmTrack(search = "", dateIso = "", days = null, season = null) {
  reading = {
    search: typeof search === "string" ? search : "",
    date: typeof dateIso === "string" ? dateIso : "",
    days,
    season,
  };
  const src = bgmTrack().src;
  if (activeSrc !== src) {
    activeSrc = src;
    if (audio) {
      audio.crossOrigin = "anonymous";
      audio.src = src;
      if (wantPlay) {
        const pending = audio.play?.();
        pending?.catch?.(() => {});
      }
    }
  }
  return bgmTrack();
}

export function bgmLevel(duckedNow, volume = userVolume) {
  const base = clampBgmVolume(volume);
  const next = duckedNow ? base * BGM_DUCK_RATIO : base;
  return Math.round(next * 1000) / 1000;
}

export function readBgmEnabled(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(BGM_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeBgmEnabled(on, storage = globalThis.localStorage) {
  try {
    storage?.setItem(BGM_STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* private mode can reject storage */
  }
}

export function readBgmVolume(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(BGM_VOLUME_KEY);
    if (raw == null || raw === "") return BGM_DEFAULT_VOLUME;
    return clampBgmVolume(raw);
  } catch {
    return BGM_DEFAULT_VOLUME;
  }
}

export function writeBgmVolume(level, storage = globalThis.localStorage) {
  try {
    storage?.setItem(BGM_VOLUME_KEY, String(clampBgmVolume(level)));
  } catch {
    /* private mode can reject storage */
  }
}

/** Test hook. Production leaves both empty and uses the browser constructors. */
export function useBgmDrivers(drivers = {}) {
  audioCtor = drivers.Audio || null;
  contextCtor = Object.prototype.hasOwnProperty.call(drivers, "AudioContext") ? drivers.AudioContext : null;
  audio = null;
  context = null;
  gain = null;
  ducked = false;
  wantPlay = false;
  resuming = false;
  gestureStarted = false;
  userVolume = BGM_DEFAULT_VOLUME;
  activeSrc = "";
  reading = { search: "", date: "", days: null, season: null };
}

export function bgmRoute() {
  return gain ? "gain" : audio ? "volume" : "none";
}

function fadeTo(level) {
  if (gain && context && typeof gain.gain?.setTargetAtTime === "function") {
    const now = Number(context.currentTime) || 0;
    const param = gain.gain;
    param.cancelScheduledValues?.(now);
    param.setValueAtTime?.(param.value, now);
    param.setTargetAtTime(level, now, BGM_FADE);
    return "gain";
  }
  if (audio) {
    try {
      audio.volume = level;
    } catch {
      /* iOS ignores or rejects volume writes */
    }
    return "volume";
  }
  return "none";
}

function resumeIfWanted() {
  if (!wantPlay || !audio || resuming || audio.paused === false) return;
  resuming = true;
  try {
    const pending = audio.play?.();
    pending?.catch?.(() => {});
  } finally {
    resuming = false;
  }
}

function onSystemPause() {
  resumeIfWanted();
}

function openGraph() {
  const Factory = contextCtor || globalThis.AudioContext || globalThis.webkitAudioContext;
  if (typeof Factory !== "function" || !audio || context) return Boolean(gain);
  try {
    const ctx = new Factory();
    const source = ctx.createMediaElementSource(audio);
    const node = ctx.createGain();
    node.gain.value = bgmLevel(ducked);
    source.connect(node);
    node.connect(ctx.destination);
    context = ctx;
    gain = node;
    if (ctx.state === "suspended") ctx.resume?.()?.catch?.(() => {});
    return true;
  } catch {
    context = null;
    gain = null;
    return false;
  }
}

function ensureElement() {
  if (audio) return audio;
  const Ctor = audioCtor || globalThis.Audio;
  if (typeof Ctor !== "function") return null;
  const element = new Ctor();
  element.crossOrigin = "anonymous";
  element.loop = true;
  element.preload = "auto";
  element.src = bgmTrack().src;
  activeSrc = bgmTrack().src;
  element.addEventListener?.("pause", onSystemPause);
  audio = element;
  return element;
}

export function duckBgm() {
  ducked = true;
  fadeTo(bgmLevel(true));
  resumeIfWanted();
}

export function restoreBgm() {
  ducked = false;
  fadeTo(bgmLevel(false));
  resumeIfWanted();
}

export function bgmIsDucked() {
  return ducked;
}

export function ensureBgmPlaying() {
  resumeIfWanted();
  return wantPlay;
}

export function setBgmVolume(level, storage = globalThis.localStorage) {
  userVolume = clampBgmVolume(level);
  writeBgmVolume(userVolume, storage);
  fadeTo(bgmLevel(ducked));
  return Math.round(userVolume * 100);
}

export function setBgmEnabled(on, storage = globalThis.localStorage) {
  const enabled = on === true;
  writeBgmEnabled(enabled, storage);
  userVolume = readBgmVolume(storage);
  if (!enabled) {
    wantPlay = false;
    audio?.pause?.();
    return false;
  }
  ensureElement();
  // This call sits inside the user gesture that may start audio.
  openGraph();
  if (context?.state === "suspended") context.resume?.()?.catch?.(() => {});
  fadeTo(bgmLevel(ducked));
  wantPlay = true;
  const pending = audio?.play?.();
  pending?.catch?.(() => {});
  return true;
}

/**
 * First pointerdown / keydown / touchend starts playback when the reader
 * has not turned music off. The switch that is about to turn music off
 * does not count as that start gesture.
 */
function gestureToggle(event) {
  const target = event?.target;
  if (!target?.closest) return null;
  const direct = target.closest("[data-setting='bgm']");
  if (direct) return direct;
  return target.closest(".toggle")?.querySelector?.("[data-setting='bgm']") || null;
}

export function handleBgmGesture(event, storage = globalThis.localStorage) {
  if (gestureStarted) return false;
  if (!readBgmEnabled(storage)) return false;
  const toggle = gestureToggle(event);
  if (toggle?.checked) return false;
  gestureStarted = true;
  return setBgmEnabled(true, storage);
}

export function bindBgmGesture(target = globalThis.document) {
  if (!target?.addEventListener || target.__adventBgmBound) return;
  target.__adventBgmBound = true;
  const handler = (event) => {
    handleBgmGesture(event);
  };
  target.addEventListener("pointerdown", handler, true);
  target.addEventListener("keydown", handler, true);
  target.addEventListener("touchend", handler, true);
}

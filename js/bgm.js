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
 * 曲目：預設 A。網址 ?bgm=b 用 B，?bgm=old 用舊的 110bpm。
 */

export const BGM_STORAGE_KEY = "advent2026.bgm";
export const BGM_VOLUME_KEY = "advent2026.bgmVolume";
export const BGM_DEFAULT_VOLUME = 0.2;
/** Speech ducks to about one quarter of the reader's own volume. */
export const BGM_DUCK_RATIO = 0.25;
/** setTargetAtTime time constant, in seconds. */
export const BGM_FADE = 0.12;

const CC0 = "http://creativecommons.org/publicdomain/zero/1.0/";

export const BGM_TRACKS = Object.freeze({
  a: Object.freeze({
    id: "a",
    src: "./assets/bgm-a.mp3",
    title: "Slow Ethereal Piano loop 80bpm",
    author: "Boatlanman-",
    source: "https://freesound.org/people/Boatlanman-/sounds/818034/",
    license: CC0,
    licenseName: "CC0 1.0",
  }),
  b: Object.freeze({
    id: "b",
    src: "./assets/bgm-b.mp3",
    title: "Piano Drone Loop",
    author: "kkenny101",
    source: "https://freesound.org/people/kkenny101/sounds/869196/",
    license: CC0,
    licenseName: "CC0 1.0",
  }),
  old: Object.freeze({
    id: "old",
    src: "./assets/bgm.mp3",
    title: "Light Piano Retro Loop 110bpm",
    author: "RokZRooM",
    source: "https://freesound.org/people/RokZRooM/sounds/345310/",
    license: CC0,
    licenseName: "CC0 1.0",
  }),
});

export const BGM_SRC = BGM_TRACKS.a.src;

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
let trackSearch = "";

export function clampBgmVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return BGM_DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

export function bgmTrack(search = trackSearch) {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const id = params.get("bgm");
  if (id === "a" || id === "b" || id === "old") return BGM_TRACKS[id];
  return BGM_TRACKS.a;
}

export function selectBgmTrack(search = "") {
  trackSearch = typeof search === "string" ? search : "";
  const src = bgmTrack(trackSearch).src;
  if (audio && audio.src !== src) {
    audio.crossOrigin = "anonymous";
    audio.src = src;
    if (wantPlay) {
      const pending = audio.play?.();
      pending?.catch?.(() => {});
    }
  }
  return bgmTrack(trackSearch);
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
  trackSearch = "";
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

/**
 * Optional background music. Off until the reader turns it on.
 * The file is the CC0 track recorded in CREDITS.
 *
 * iPhone Safari 的 HTMLMediaElement.volume 是唯讀的，永遠是 1。
 * 預設音量和朗讀時降到 20% 都改走 Web Audio 的 GainNode。
 * AudioContext 只在用家按下開關的那一下建立並 resume。
 * 沒有 Web Audio 時才退回 audio.volume。
 *
 * iOS 在 speechSynthesis 開始或結束時，可能把正在播的 audio 暫停。
 * 只要開關仍然開著，系統暫停會再 play()，朗讀和音樂可以同時聽。
 */

export const BGM_SRC = "./assets/bgm.mp3";
export const BGM_STORAGE_KEY = "advent2026.bgm";
export const BGM_VOLUME = 1;
/** Speech ducks the music to 20% of full volume. */
export const BGM_DUCK_VOLUME = 0.2;
/** setTargetAtTime time constant, in seconds. */
export const BGM_FADE = 0.12;

export const BGM_CREDIT = Object.freeze({
  title: "Light Piano Retro Loop 110bpm",
  author: "RokZRooM",
  source: "https://freesound.org/people/RokZRooM/sounds/345310/",
  license: "http://creativecommons.org/publicdomain/zero/1.0/",
  licenseName: "CC0 1.0",
});

let audio = null;
let context = null;
let gain = null;
let ducked = false;
let wantPlay = false;
let resuming = false;
let audioCtor = null;
let contextCtor = null;

export function bgmLevel(duckedNow) {
  return duckedNow ? BGM_DUCK_VOLUME : BGM_VOLUME;
}

export function readBgmEnabled(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(BGM_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function writeBgmEnabled(on, storage = globalThis.localStorage) {
  try {
    storage?.setItem(BGM_STORAGE_KEY, on ? "on" : "off");
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
  element.src = BGM_SRC;
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

export function setBgmEnabled(on, storage = globalThis.localStorage) {
  const enabled = on === true;
  writeBgmEnabled(enabled, storage);
  if (!enabled) {
    wantPlay = false;
    audio?.pause?.();
    return false;
  }
  ensureElement();
  // The switch click is the user gesture that may start audio.
  openGraph();
  if (context?.state === "suspended") context.resume?.()?.catch?.(() => {});
  fadeTo(bgmLevel(ducked));
  wantPlay = true;
  const pending = audio?.play?.();
  pending?.catch?.(() => {});
  return true;
}

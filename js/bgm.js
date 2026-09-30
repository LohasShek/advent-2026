/**
 * 背景音樂。沒有存過開關時視為開啟，音量預設 20%。
 * 手機瀏覽器不准自動出聲，所以真正的 play() 要等第一次用家手勢
 * （pointerup、keydown 或 touchend）。不彈出提示。
 * 觸控若 play() 失敗，下一次手勢會再試，直到播得出聲。
 * 用家關掉之後會記住，之後的手勢不再播放。
 *
 * iPhone Safari 的 HTMLMediaElement.volume 是唯讀的，永遠是 1。
 * 音量和朗讀時的降低都走 Web Audio 的 GainNode。
 * AudioContext 只在那一下手勢（或用家按下開關）裏建立並 resume。
 * 沒有 Web Audio 時才退回 audio.volume。
 * 朗讀時增益降到用家音量的四分之一，停止後回到用家音量。
 *
 * iOS 在 speechSynthesis 開始或結束時，可能把正在播的 audio 暫停。
 * 只要開關仍然開著，系統暫停會再 play()，朗讀和音樂可以同時聽。
 *
 * 曲目按讀經週次。預設該週的 a。?week=1..4 強制週次，?bgm=a|b 揀候選。
 * 第三、四週只有一首；?bgm=b 會播回那一首。
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
  return Object.freeze({
    license: CC0,
    licenseName: "CC0 1.0",
    licenseLabel: "CC0 授權",
    melody: "",
    ...fields,
  });
}

/** On-screen name: no leading index, no file extension, no catalogue id or bpm token. */
export function screenTrackTitle(title) {
  let text = String(title || "")
    .replace(/^\d+\s+/, "")
    .replace(/\.(wav|mp3|ogg|oga|flac)$/i, "")
    .replace(/_/g, " ")
    .replace(/\b\d{5,}\b/g, "")
    .replace(/\b\d{2,3}\s*bpm\b/gi, "");
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return String(title || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const BY = "https://creativecommons.org/licenses/by/3.0/";

export const BGM_WEEKS = Object.freeze({
  1: Object.freeze({
    a: track({
      id: "w1-a",
      week: 1,
      slot: "a",
      src: "./assets/bgm/w1-a.mp3",
      title: "07 Worms Cathedral organ practice.wav",
      author: "blaukreuz",
      source: "https://freesound.org/people/blaukreuz/sounds/131112/",
      weekLabel: "第一週",
      theme: "在黑暗中等候",
    }),
    b: track({
      id: "w1-b",
      week: 1,
      slot: "b",
      src: "./assets/bgm/w1-b.mp3",
      title: "Harmonium Drone2",
      author: "easy_thunder",
      source: "https://freesound.org/people/easy_thunder/sounds/264442/",
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
      title: "upright_piano_loop_7000924_083bpm.wav",
      author: "stixthule",
      source: "https://freesound.org/people/stixthule/sounds/593837/",
      weekLabel: "第二週",
      theme: "預備道路",
    }),
    b: track({
      id: "w2-b",
      week: 2,
      slot: "b",
      src: "./assets/bgm/w2-b.mp3",
      title: "Calm Ambient Piano Loop",
      author: "Jadis0x",
      source: "https://freesound.org/people/Jadis0x/sounds/832628/",
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
  }),
  4: Object.freeze({
    a: track({
      id: "w4",
      week: 4,
      slot: "a",
      src: "./assets/bgm/w4.mp3",
      title: "Silent Night",
      author: "Kevin MacLeod",
      creditAuthor: "Kevin MacLeod（incompetech.com）",
      edited: true,
      source: "https://commons.wikimedia.org/wiki/File:Silent_Night_(ISRC_USUAN1100075).mp3",
      license: BY,
      licenseName: "CC BY 3.0",
      licenseLabel: "CC BY 3.0",
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
let playGen = 0;
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
  return BGM_WEEKS[week][slot] || BGM_WEEKS[week].a;
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
  playGen += 1;
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
  // play() and AudioContext.resume() stay synchronous inside the gesture.
  openGraph();
  const resume = context?.resume?.();
  resume?.catch?.(() => {});
  fadeTo(bgmLevel(ducked));
  wantPlay = true;
  const gen = ++playGen;
  let pending;
  try {
    pending = audio?.play?.();
  } catch {
    wantPlay = false;
    gestureStarted = false;
    return false;
  }
  const succeed = () => {
    if (gen !== playGen) return;
    gestureStarted = true;
  };
  const fail = () => {
    if (gen !== playGen) return;
    if (audio?.paused === false) return;
    gestureStarted = false;
    wantPlay = false;
  };
  if (audio?.paused === false) gestureStarted = true;
  if (pending && typeof pending.then === "function") pending.then(succeed, fail);
  else if (audio?.paused === false) gestureStarted = true;
  else fail();
  return true;
}

/**
 * pointerup、touchend and keydown start playback when the reader has not
 * turned music off. play() and AudioContext.resume() run in that handler.
 * A failed play does not lock the gesture, so the next tap tries again.
 * The switch that is about to turn music off does not count as that start.
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
  return setBgmEnabled(true, storage);
}

export function bindBgmGesture(target = globalThis.document) {
  if (!target?.addEventListener || target.__adventBgmBound) return;
  target.__adventBgmBound = true;
  const handler = (event) => {
    handleBgmGesture(event);
  };
  target.addEventListener("pointerup", handler, true);
  target.addEventListener("keydown", handler, true);
  target.addEventListener("touchend", handler, true);
}

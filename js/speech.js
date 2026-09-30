/**
 * Device text-to-speech via the Web Speech API (speechSynthesis).
 * This module never records, generates, or publishes an audio file.
 *
 * 選擇朗讀聲音的次序（每次開始讀、以及每一節開始時都再選一次）：
 * 1. 粵語：語言標籤 zh-HK 或 yue，或聲音名稱含 Cantonese／粵語
 * 2. 台灣國語 zh-TW，或其他繁體中文 zh-Hant
 * 3. 大陸國語 zh-CN、簡體 zh-Hans，最後才是任何 zh
 * 裝置完全沒有中文聲音時，不朗讀，畫面改顯示一句說明。
 *
 * voiceschanged 可能在頁面開啟之後才把聲音清單載入，所以不能只在啟動時讀一次。
 * iOS Safari 讀長句時可能中途停止，因此每一節各建立一個 utterance，
 * 等前一節的 onend 再讀下一節，而不是把全日經文放進同一句。
 */

import { parseVerses, verseScreenLabel } from "./logic.js";

const RATES = [0.75, 1, 1.25];

let supported = false;
let engine = null;
let voiceStatus = "missing";
let phase = "idle";
let rate = 1;
let generation = 0;
let paused = false;
let queue = [];
let index = 0;
let onStart = null;
let onFinish = null;

function voiceLang(voice) {
  return String(voice?.lang || "").toLowerCase().replaceAll("_", "-");
}

function voiceName(voice) {
  return String(voice?.name || "");
}

function isCantonese(voice) {
  const lang = voiceLang(voice);
  const name = voiceName(voice).toLowerCase();
  return lang.startsWith("zh-hk") || lang.startsWith("yue") || name.includes("cantonese") || voiceName(voice).includes("粵");
}

function isTaiwan(voice) {
  const lang = voiceLang(voice);
  return lang.startsWith("zh-tw") || lang.startsWith("zh-hant");
}

function isMainland(voice) {
  const lang = voiceLang(voice);
  return lang.startsWith("zh-cn") || lang.startsWith("zh-hans") || lang === "zh" || lang.startsWith("zh-");
}

/** Prefer Cantonese, then Taiwan Mandarin, then other Chinese. Returns null when none exist. */
export function pickChineseVoice(voices) {
  const list = Array.isArray(voices) ? voices : [];
  return list.find(isCantonese) || list.find(isTaiwan) || list.find(isMainland) || null;
}

export function passageUtterances(reference, passage) {
  const lines = [];
  const ref = String(reference || "").trim();
  if (ref) lines.push(ref);
  const verses = parseVerses(passage);
  if (!verses.length && String(passage || "").trim()) lines.push(String(passage).trim());
  for (const verse of verses) lines.push(verseScreenLabel(verse.n, verse.text));
  return lines;
}

function refreshVoices() {
  const voices = engine?.getVoices?.() || [];
  if (!voices.length) {
    voiceStatus = "pending";
    return;
  }
  voiceStatus = pickChineseVoice(voices) ? "ready" : "missing";
}

export function initDeviceSpeech(synth, onVoices) {
  const next = synth === undefined && typeof globalThis !== "undefined" ? globalThis.speechSynthesis : synth;
  supported = Boolean(next && typeof next.speak === "function");
  engine = supported ? next : null;
  phase = "idle";
  if (!supported) {
    voiceStatus = "missing";
    return false;
  }
  const update = () => {
    refreshVoices();
    onVoices?.(voiceStatus);
  };
  update();
  engine.addEventListener?.("voiceschanged", update);
  return true;
}

export function deviceSpeechSupported() {
  return supported;
}

export function speechVoiceStatus() {
  return voiceStatus;
}

export function speechPhase() {
  return phase;
}

export function speechRate() {
  return rate;
}

export function setSpeechRate(next) {
  const value = Number(next);
  if (!RATES.includes(value)) return rate;
  rate = value;
  return rate;
}

export function speechRates() {
  return RATES.slice();
}

function chosenVoice() {
  return pickChineseVoice(engine?.getVoices?.() || []);
}

function makeUtterance(text) {
  if (typeof engine?.createUtterance === "function") return engine.createUtterance(text);
  if (typeof globalThis.SpeechSynthesisUtterance === "function") return new globalThis.SpeechSynthesisUtterance(text);
  return { text };
}

function finish(mine) {
  if (mine !== generation) return;
  phase = "idle";
  paused = false;
  queue = [];
  index = 0;
  const done = onFinish;
  onStart = null;
  onFinish = null;
  done?.();
}

function speakAt(position, mine) {
  if (mine !== generation || paused) return;
  if (position >= queue.length) {
    finish(mine);
    return;
  }
  index = position;
  const voice = chosenVoice();
  if (voiceStatus === "missing" && (engine.getVoices?.() || []).length) {
    engine.cancel?.();
    finish(mine);
    return;
  }
  const utter = makeUtterance(queue[position]);
  utter.rate = rate;
  utter.lang = voice?.lang || "zh-HK";
  if (voice) {
    try {
      utter.voice = voice;
    } catch {
      /* A voice object from another realm cannot be assigned. lang still selects it. */
    }
  }
  utter.onstart = () => {
    if (mine !== generation) return;
    phase = "playing";
    onStart?.();
    onStart = null;
  };
  utter.onend = () => {
    if (mine !== generation || paused) return;
    speakAt(position + 1, mine);
  };
  utter.onerror = () => {
    if (mine !== generation || paused) return;
    finish(mine);
  };
  phase = "playing";
  try {
    engine.speak(utter);
  } catch {
    finish(mine);
  }
}

export function speakPassage(lines, hooks = {}) {
  if (!supported || !engine) return false;
  const list = (Array.isArray(lines) ? lines : []).map((line) => String(line || "").trim()).filter(Boolean);
  if (!list.length) return false;
  stopSpeech();
  generation += 1;
  const mine = generation;
  queue = list;
  index = 0;
  paused = false;
  onStart = hooks.onstart || null;
  onFinish = hooks.onend || null;
  speakAt(0, mine);
  return true;
}

export function pauseSpeech() {
  if (phase !== "playing") return;
  // Cancel instead of speechSynthesis.pause(). iOS often drops a paused queue,
  // so continue restarts the current verse from speakAt().
  paused = true;
  phase = "paused";
  engine?.cancel?.();
}

export function resumeSpeech() {
  if (phase !== "paused") return;
  paused = false;
  phase = "playing";
  speakAt(index, generation);
}

export function stopSpeech() {
  const active = phase !== "idle";
  generation += 1;
  paused = false;
  phase = "idle";
  queue = [];
  index = 0;
  if (active) engine?.cancel?.();
  onStart = null;
  onFinish = null;
}

export function speakDeviceText(text) {
  return speakPassage([text]);
}

export function cancelDeviceSpeech() {
  stopSpeech();
}

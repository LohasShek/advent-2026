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
 * iOS Safari 讀長句時可能中途停止，因此按句各建立一個 utterance。
 * 一句的界線是節，或「。！？；」。暫停時取消目前這句並保留句序，
 * 繼續時由該句再開始。不使用系統的暫停與繼續，手機上並不穩定。
 */

import { parseVerses, verseScreenLabel } from "./logic.js";

const RATES = [0.75, 1, 1.25];
const SENTENCE_END = "。！？；";

let supported = false;
let engine = null;
let voiceStatus = "missing";
let phase = "idle";
let rate = 1;
let generation = 0;
let paused = false;
let queue = [];
let index = 0;
let active = null;
let onStart = null;
let onFinish = null;
let onSentence = null;

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

/** Split one verse body on 。！？；. Punctuation stays with the sentence it closes. */
export function splitSentences(text) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return [];
  const parts = [];
  let buf = "";
  const flush = () => {
    const piece = buf.trim();
    buf = "";
    if (piece && [...piece].some((ch) => !SENTENCE_END.includes(ch))) parts.push(piece);
  };
  for (const ch of source) {
    buf += ch;
    if (SENTENCE_END.includes(ch)) flush();
  }
  flush();
  return parts;
}

function cue(text, verse, sentence) {
  return { text: String(text || "").trim(), verse: String(verse || ""), sentence };
}

/** Reference first, then one cue per sentence. The first sentence of a verse carries the verse label. */
export function passageUtterances(reference, passage) {
  const lines = [];
  const ref = String(reference || "").trim();
  if (ref) lines.push(cue(ref, "", -1));
  const verses = parseVerses(passage);
  if (!verses.length && String(passage || "").trim()) {
    splitSentences(passage).forEach((sentence, order) => lines.push(cue(sentence, "", order)));
  }
  for (const verse of verses) {
    const sentences = splitSentences(verse.text);
    const list = sentences.length ? sentences : [String(verse.text || "").trim()].filter(Boolean);
    list.forEach((sentence, order) => {
      const text = order === 0 ? verseScreenLabel(verse.n, sentence) : sentence;
      lines.push(cue(text, verse.n, order));
    });
  }
  return lines.filter((line) => line.text);
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
  if (!RATES.includes(value) || value === rate) return rate;
  rate = value;
  if (phase === "playing") restartCurrent();
  return rate;
}

export function speechCursor() {
  if (phase !== "playing" && phase !== "paused") return null;
  const item = queue[index];
  if (!item) return null;
  return { index, verse: item.verse || "", sentence: item.sentence };
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
  active = null;
  const done = onFinish;
  onStart = null;
  onFinish = null;
  onSentence = null;
  done?.();
}

function lineCue(line) {
  if (line && typeof line === "object") return cue(line.text, line.verse, line.sentence ?? 0);
  return cue(line, "", 0);
}

function restartCurrent() {
  const mine = generation;
  const position = index;
  active = null;
  engine?.cancel?.();
  speakAt(position, mine);
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
    active = null;
    engine.cancel?.();
    finish(mine);
    return;
  }
  const item = queue[position];
  const utter = makeUtterance(item.text);
  utter.rate = rate;
  utter.lang = voice?.lang || "zh-HK";
  if (voice) {
    try {
      utter.voice = voice;
    } catch {
      /* A voice object from another realm cannot be assigned. lang still selects it. */
    }
  }
  active = utter;
  utter.onstart = () => {
    if (mine !== generation || utter !== active) return;
    phase = "playing";
    onSentence?.({ index, verse: item.verse || "", sentence: item.sentence });
    if (onStart) {
      const start = onStart;
      onStart = null;
      start();
    }
  };
  utter.onend = () => {
    if (mine !== generation || paused || utter !== active) return;
    speakAt(position + 1, mine);
  };
  utter.onerror = () => {
    if (mine !== generation || paused || utter !== active) return;
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
  const list = (Array.isArray(lines) ? lines : []).map(lineCue).filter((line) => line.text);
  if (!list.length) return false;
  stopSpeech();
  generation += 1;
  const mine = generation;
  queue = list;
  index = 0;
  paused = false;
  active = null;
  onStart = hooks.onstart || null;
  onFinish = hooks.onend || null;
  onSentence = hooks.onsentence || null;
  speakAt(0, mine);
  return true;
}

export function pauseSpeech() {
  if (phase !== "playing") return;
  // Keep the sentence index. The next play calls speakAt(index) after cancel.
  paused = true;
  phase = "paused";
  active = null;
  engine?.cancel?.();
}

export function resumeSpeech() {
  if (phase !== "paused") return;
  paused = false;
  phase = "playing";
  speakAt(index, generation);
}

export function stopSpeech() {
  const running = phase !== "idle";
  generation += 1;
  paused = false;
  phase = "idle";
  queue = [];
  index = 0;
  active = null;
  if (running) engine?.cancel?.();
  onStart = null;
  onFinish = null;
  onSentence = null;
}

export function speakDeviceText(text) {
  return speakPassage([text]);
}

export function cancelDeviceSpeech() {
  stopSpeech();
}

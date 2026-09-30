/**
 * Optional background music. Off until the reader turns it on.
 * The file is the CC0 track recorded in CREDITS.
 */

export const BGM_SRC = "./assets/bgm.mp3";
export const BGM_STORAGE_KEY = "advent2026.bgm";
export const BGM_VOLUME = 1;
/** Speech ducks the music to 20% of full volume. */
export const BGM_DUCK_VOLUME = 0.2;

export const BGM_CREDIT = Object.freeze({
  title: "Light Piano Retro Loop 110bpm",
  author: "RokZRooM",
  source: "https://freesound.org/people/RokZRooM/sounds/345310/",
  license: "http://creativecommons.org/publicdomain/zero/1.0/",
  licenseName: "CC0 1.0",
});

let audio = null;
let ducked = false;

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

function syncVolume() {
  if (!audio) return;
  audio.volume = bgmLevel(ducked);
}

export function duckBgm() {
  ducked = true;
  syncVolume();
}

export function restoreBgm() {
  ducked = false;
  syncVolume();
}

export function bgmIsDucked() {
  return ducked;
}

export function setBgmEnabled(on, storage = globalThis.localStorage) {
  const enabled = on === true;
  writeBgmEnabled(enabled, storage);
  if (!enabled) {
    audio?.pause();
    return false;
  }
  if (!audio && typeof Audio === "function") {
    audio = new Audio(BGM_SRC);
    audio.loop = true;
    audio.preload = "auto";
  }
  syncVolume();
  audio?.play?.()?.catch?.(() => {});
  return true;
}

/** Test hook. Production code uses setBgmEnabled(), which constructs Audio. */
export function attachBgmElement(element) {
  audio = element;
  syncVolume();
}

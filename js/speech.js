/**
 * Hook for the device's own text-to-speech (speechSynthesis).
 * Breathing chimes, background music, and a spoken voice are not built yet.
 * Later audio should call speakDeviceText(). Until then it returns false
 * and never calls speechSynthesis.speak.
 */

let supported = false;

export function initDeviceSpeech(synth) {
  const engine = synth === undefined && typeof globalThis !== "undefined" ? globalThis.speechSynthesis : synth;
  supported = Boolean(engine && typeof engine.speak === "function");
  return supported;
}

export function deviceSpeechSupported() {
  return supported;
}

/** Future voice calls this with the line to read. It does not speak. */
export function speakDeviceText(text) {
  void text;
  return false;
}

export function cancelDeviceSpeech() {}

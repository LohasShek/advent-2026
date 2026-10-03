import {
  activeStepId,
  anonymousFeelingEvent,
  candleAlt,
  canOpenStep,
  careHtml,
  careMessage,
  careStreak,
  comparisonNote,
  countCores,
  daysBetween,
  editionGuide,
  esc,
  flowSteps,
  fill,
  formatFullDate,
  formatMonthDay,
  hongKongDate,
  markReached,
  nextStepId,
  paragraphsHtml,
  addWord,
  fillPrayerFrame,
  formatMarkedWords,
  normalizeWords,
  passageHtml,
  passageSlots,
  removeWord,
  resolveWords,
  wordLabel,
  prayerFrameHtml,
  previousStepId,
  segmentMode,
  toggleWord,
  reviewBounds,
  reviewIntensity,
  reviewSummary,
  seasonPhase,
  weeksOf,
  breathPhaseMs,
} from "./logic.js";
import {
  clearJournal,
  dayState,
  entriesByDate,
  loadState,
  saveState,
} from "./storage.js";
import { initStats, trackComplete, trackFeelings, trackOpen } from "./stats.js";
import { applySheetCache, loadSheetCache, refreshFromSheet, saveSheetCache } from "./sheet.js";
import { initDeviceSpeech, speechVoiceStatus, speechPhase, speechRate, setSpeechRate, speechRates, speakPassage, pauseSpeech, resumeSpeech, stopSpeech, passageUtterances, speechCursor } from "./speech.js";
import { BGM_WEEKS, bgmTrack, screenTrackTitle, readBgmEnabled, readBgmVolume, setBgmEnabled, setBgmVolume, selectBgmTrack, bindBgmGesture, duckBgm, restoreBgm } from "./bgm.js";
import ui from "../ui-strings.json" with { type: "json" };

const main = document.querySelector("#app");
const tabbar = document.querySelector(".tabbar");

const app = {
  plan: null,
  feelings: null,
  wheelSvg: "",
  state: null,
  breathGen: 0,
  breathTimer: null,
  lastTracked: "",
  lastView: "",
  thanksDay: 0,
  wordHintDay: 0,
  pendingSelection: "",
  segmentWarned: new Set(),
  frameIndex: 0,
  frameDay: 0,
  touchStart: null,
  bgmOpen: false,
};

function siteConfig() {
  return window.ADVENT_CONFIG || {};
}

function scriptureCopyright() {
  return String(siteConfig().scriptureCopyright || "").trim();
}

function activeChurchContact() {
  const fromSheet = String(app.feelings?.care?.contact || "").trim();
  if (fromSheet) return fromSheet;
  return String(siteConfig().churchContact || "").trim();
}

function contentSignature(plan, feelings) {
  return JSON.stringify({ plan, feelings });
}

function todayISO() {
  const asof = new URLSearchParams(location.search).get("asof") || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(asof) ? asof : hongKongDate();
}

function parseRoute() {
  let raw = "/";
  try {
    raw = decodeURIComponent(location.hash.replace(/^#/, "") || "/");
  } catch {
    raw = "/";
  }
  const parts = raw.split("/").filter(Boolean);
  if (parts.length === 0 || parts[0] === "home") return { name: "home" };
  if (parts[0] === "plan") return { name: "plan" };
  if (parts[0] === "about") return { name: "about" };
  if (parts[0] === "day") {
    const day = Number(parts[1]);
    if (!Number.isInteger(day)) return { name: "home" };
    return { name: "day", day, step: parts[2] || "" };
  }
  return { name: "home" };
}

function coreById(id) {
  return app.feelings.cores.find((core) => core.id === id) || null;
}

function feelingByOrder(core, order) {
  return core?.feelings.find((item) => item.order === Number(order)) || null;
}

function orderOfPick(pick) {
  const core = coreById(pick?.coreId);
  const match = core?.feelings.find((item) => item.zh === pick.feelingZh && item.en === pick.feelingEn);
  return match?.order || 0;
}

function ensureDraft(entry, which) {
  const key = which === "after" ? "draftAfter" : "draftBefore";
  if (!entry[key]) {
    const confirmed = which === "after" ? entry.after : entry.before;
    entry[key] = confirmed
      ? {
          coreId: confirmed.coreId,
          feelingOrder: orderOfPick(confirmed),
          intensity: Number(confirmed.intensity) || 0,
          because: confirmed.because || "",
        }
      : { coreId: "", feelingOrder: 0, intensity: 0, because: "" };
  }
  return entry[key];
}

function pickFromDraft(draft) {
  if (!draft?.coreId || !draft.feelingOrder || !draft.intensity) return null;
  const core = coreById(draft.coreId);
  const fine = feelingByOrder(core, draft.feelingOrder);
  if (!core || !fine) return null;
  return {
    coreId: core.id,
    coreZh: core.zh,
    coreEn: core.en,
    feelingZh: fine.zh,
    feelingEn: fine.en,
    intensity: Number(draft.intensity),
    because: String(draft.because || "").trim().slice(0, 80),
  };
}

function currentEntry() {
  const dayNo = main.dataset.day;
  return dayNo ? app.state.days[dayNo] : null;
}

function captureFields() {
  const entry = currentEntry();
  if (!entry) return;
  const reflect1 = document.querySelector("[data-field='reflect1']");
  const reflect2 = document.querySelector("[data-field='reflect2']");
  if (reflect1) entry.reflect1 = reflect1.value;
  if (reflect2) entry.reflect2 = reflect2.value;
  const because = document.querySelector("[data-field='because']");
  if (because) {
    const draft = main.dataset.step === "after" ? entry.draftAfter : entry.draftBefore;
    if (draft) draft.because = because.value;
  }
  saveState(app.state);
}

function stopBreath() {
  app.breathGen += 1;
  if (app.breathTimer) {
    clearTimeout(app.breathTimer);
    app.breathTimer = null;
  }
}

function setTitle(text) {
  document.title = text ? `${text} · ${ui.shell.titleSuffix}` : ui.shell.documentTitle;
}

function setTab(name) {
  for (const link of tabbar.querySelectorAll("a")) {
    if (link.dataset.tab === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function maybeTrack(page, dayNumber) {
  const key = page === "day" ? `day:${dayNumber}` : page;
  if (key === app.lastTracked) return;
  app.lastTracked = key;
  trackOpen(page, dayNumber);
}

function careText(today) {
  const streak = careStreak(entriesByDate(app.plan.days, app.state), today, app.feelings.care);
  if (!streak) return "";
  if (app.state.careDismissedOn === today) return "";
  return careMessage(app.feelings.care.template, activeChurchContact());
}

function shown(text) {
  return editionGuide(text, app.state.edition);
}

function careBanner(today) {
  const text = shown(careText(today));
  if (!text) return "";
  return `<aside class="care">
    <p>${careHtml(text)}</p>
    <button type="button" class="btn ghost" data-action="dismiss-care">${esc(ui.care.dismiss)}</button>
  </aside>`;
}

function candleFigure(week, caption) {
  const clamped = Math.max(0, Math.min(4, week));
  return `<figure class="candles">
    <img src="./assets/candles_week${clamped}.svg" alt="${esc(candleAlt(clamped))}" width="200" height="124">
    ${caption ? `<figcaption>${caption}</figcaption>` : ""}
  </figure>`;
}

function dots(level) {
  const n = Number(level) || 0;
  return `<span class="dots" aria-hidden="true">${Array.from({ length: 5 }, (_, index) =>
    `<i class="${index < n ? "on" : ""}"></i>`
  ).join("")}</span>`;
}

function intensityLabel(level) {
  return app.feelings.intensities.find((item) => item.level === Number(level))?.label || "";
}

function wheelHtml(selectedId) {
  const holder = document.createElement("div");
  holder.innerHTML = app.wheelSvg;
  const svg = holder.querySelector("svg");
  if (!svg) return "";
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", ui.picker.wheelLabel);
  for (const path of svg.querySelectorAll("path[id]")) {
    const core = app.feelings.cores.find((item) => item.segment === path.id);
    if (!core) continue;
    path.setAttribute("tabindex", "0");
    path.setAttribute("role", "button");
    const picked = core.id === selectedId;
    const state = picked ? ui.picker.selected : ui.picker.unselected;
    path.setAttribute("aria-label", fill(ui.picker.coreSpoken, { name: core.zh, state }));
    path.setAttribute("aria-pressed", picked ? "true" : "false");
    path.dataset.action = "pick-core";
    path.dataset.core = core.id;
    if (selectedId && core.id !== selectedId) path.classList.add("is-dim");
    if (core.id === selectedId) {
      path.classList.add("is-selected");
      path.setAttribute("stroke", "#64547E");
      path.setAttribute("stroke-width", "8");
    }
  }
  for (const text of svg.querySelectorAll("text")) {
    text.setAttribute("pointer-events", "none");
    text.setAttribute("aria-hidden", "true");
  }
  const selected = coreById(selectedId);
  if (selected) {
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", "200");
    label.setAttribute("y", "206");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", "16");
    label.setAttribute("fill", "#4A4060");
    label.setAttribute("pointer-events", "none");
    label.textContent = `✓ ${selected.zh}`;
    label.setAttribute("aria-hidden", "true");
    svg.appendChild(label);
  }
  return holder.innerHTML;
}

function renderPicker(which, entry) {
  const draft = ensureDraft(entry, which);
  const selected = coreById(draft.coreId);
  const fine = feelingByOrder(selected, draft.feelingOrder);
  const heading = which === "after" ? ui.picker.afterTitle : ui.picker.beforeTitle;
  const lead = which === "after" ? ui.picker.afterLead : ui.picker.beforeLead;
  const feelings = selected
    ? `<div class="feeling-list" role="group" aria-label="${esc(fill(ui.picker.fineLabel, { core: selected.zh }))}">
        <p class="section-label">${esc(ui.picker.finePrompt)}</p>
        ${selected.feelings
          .map((item) => {
            const on = item.order === Number(draft.feelingOrder);
            const state = on ? ui.picker.selected : ui.picker.unselected;
            return `<button type="button" class="choice ${on ? "is-on" : ""}" style="--chip:${esc(selected.color)}" data-action="pick-feeling" data-order="${item.order}" aria-pressed="${on ? "true" : "false"}" aria-label="${esc(fill(ui.picker.outerSpoken, { name: item.zh, state }))}">
              <span>${esc(item.zh)}${on ? `<span class="tick" aria-hidden="true"> ✓</span>` : ""}</span><small aria-hidden="true">${esc(item.en)}</small>
            </button>`;
          })
          .join("")}
      </div>`
    : `<p class="muted center">${esc(ui.picker.chooseCore)}</p>`;
  const intensity = selected
    ? `<p class="section-label">${esc(ui.picker.intensityPrompt)}</p>
      <div class="intensity" role="group" aria-label="${esc(ui.picker.intensityLabel)}">
        ${app.feelings.intensities
          .map((item) => {
            const on = Number(draft.intensity) === item.level;
            const state = on ? ui.picker.selected : ui.picker.unselected;
            return `<button type="button" class="choice level ${on ? "is-on" : ""}" data-action="pick-intensity" data-level="${item.level}" aria-pressed="${on ? "true" : "false"}" aria-label="${esc(fill(ui.picker.intensityChoice, { level: item.level, label: item.label, state }))}">
              <span class="lv">${item.level}${on ? `<span class="tick" aria-hidden="true"> ✓</span>` : ""}</span><span class="lb">${esc(item.label)}</span>
            </button>`;
          })
          .join("")}
      </div>`
    : "";
  const because = fine && draft.intensity
    ? `<label class="field">
        <span>${esc(ui.picker.becauseLabel)}</span>
        <input type="text" maxlength="80" autocomplete="off" data-field="because" placeholder="${esc(ui.picker.becausePlaceholder)}" value="${esc(draft.because || "")}">
        <small>${esc(ui.picker.becausePrivate)}</small>
      </label>`
    : "";
  const ready = Boolean(pickFromDraft(draft));
  return `<div class="card picker">
    <h2>${esc(heading)}</h2>
    <p>${esc(lead)}</p>
    <div class="wheel-wrap">${wheelHtml(draft.coreId)}</div>
    ${feelings}
    ${intensity}
    ${because}
    <button type="button" class="btn" data-action="${which === "after" ? "save-after" : "save-before"}" ${ready ? "" : "disabled"}>
      ${esc(which === "after" ? ui.picker.saveAfter : ui.picker.saveBefore)}
    </button>
  </div>`;
}

function renderPickColumn(pick, label) {
  if (!pick) {
    return `<article class="pick-card"><h3>${esc(label)}</h3><p class="muted">${esc(ui.compare.empty)}</p></article>`;
  }
  const core = coreById(pick.coreId);
  const color = core?.color || "#E4DCCF";
  const note = String(pick.because || "").trim();
  const because = note
    ? `<p class="because">${esc(note.startsWith(ui.picker.becausePrefix) ? note : `${ui.picker.becausePrefix}${note}`)}</p>`
    : "";
  return `<article class="pick-card">
    <div class="swatch" style="background:${esc(color)}"></div>
    <div class="body">
      <h3>${esc(label)}</h3>
      <p class="core-name">${esc(pick.coreZh)}</p>
      <p class="fine">${esc(pick.feelingZh)}</p>
      <p class="level"><span class="sr-only">${esc(fill(ui.picker.intensitySpoken, { label: intensityLabel(pick.intensity) }))}</span>${esc(intensityLabel(pick.intensity))} ${dots(pick.intensity)}</p>
      ${because}
    </div>
  </article>`;
}

function renderComparison(day, entry) {
  const nextLabel = day.review
    ? day.review.scope === "season"
      ? ui.reflect.toSeason
      : ui.reflect.toWeek
    : ui.compare.next;
  return `<div class="card">
    <h2>${esc(ui.compare.title)}</h2>
    <p>${esc(shown(comparisonNote(entry.before, entry.after)))}</p>
    <div class="compare">
      ${renderPickColumn(entry.before, ui.compare.before)}
      ${renderPickColumn(entry.after, ui.compare.after)}
    </div>
    <button type="button" class="btn" data-action="next">${esc(nextLabel)}</button>
    <button type="button" class="btn ghost" data-action="redo-after">${esc(ui.compare.redo)}</button>
  </div>`;
}

function feelBit(pick) {
  if (!pick) return `<span class="muted">${esc(ui.review.notRecorded)}</span>`;
  const color = coreById(pick.coreId)?.color || "#E4DCCF";
  const level = reviewIntensity(pick.intensity);
  const levelHtml = level ? `<span class="feel-level">${esc(level)}</span>` : "";
  return `<span class="feel-bit"><i class="dot" style="background:${esc(color)}"></i>${esc(pick.coreZh)} · ${esc(pick.feelingZh)}${levelHtml}</span>`;
}

function renderBars(counts, label) {
  if (!counts.length) return "";
  const total = counts.reduce((sum, item) => sum + item.n, 0);
  const segs = counts
    .map((item) => {
      const color = coreById(item.id)?.color || "#E4DCCF";
      return `<span style="width:${(item.n / total) * 100}%;background:${esc(color)}"></span>`;
    })
    .join("");
  const legend = counts.map((item) => `${esc(item.zh)} ${item.n}`).join(" · ");
  return `<div class="bar-block"><p>${esc(label)}</p><div class="bars" aria-hidden="true">${segs}</div><p class="legend">${legend}</p></div>`;
}

function renderReview(day) {
  const bounds = reviewBounds(day);
  const slice = app.plan.days.filter((item) => item.day >= bounds.fromDay && item.day <= bounds.toDay);
  const beforePicks = [];
  const afterPicks = [];
  const rows = slice
    .map((item) => {
      const entry = app.state.days[String(item.day)];
      if (entry?.before) beforePicks.push(entry.before);
      if (entry?.after) afterPicks.push(entry.after);
      const shownWords = formatMarkedWords(entry?.words, readingSlots(item), currentEdition());
      const wordLine = shownWords
        ? `<p class="rev-words">${esc(ui.words.reviewLabel)} ${esc(shownWords)}</p>`
        : "";
      return `<div class="rev-row">
        <a href="#/day/${item.day}">${esc(formatMonthDay(item.date))} · ${esc(shown(item.title))}</a>
        <div class="rev-feel">${feelBit(entry?.before)} <span aria-hidden="true">→</span> ${feelBit(entry?.after)}</div>
        ${wordLine}
      </div>`;
    })
    .join("");
  const title = bounds.scope === "season" ? ui.review.seasonTitle : ui.review.weekTitle;
  return `<div class="card review">
    <h2>${title}</h2>
    ${paragraphsHtml(shown(day.review?.prompt))}
    <p class="summary">${esc(reviewSummary(countCores(beforePicks), countCores(afterPicks)))}</p>
    ${renderBars(countCores(beforePicks), ui.review.beforeLabel)}
    ${renderBars(countCores(afterPicks), ui.review.afterLabel)}
    <div class="rev-list">${rows}</div>
    <button type="button" class="btn" data-action="next">${esc(ui.review.toPrayer)}</button>
  </div>`;
}

function renderSteps(day, entry, stepId) {
  return `<nav class="steps" aria-label="${esc(ui.steps.navLabel)}">${flowSteps(day)
    .map((step) => {
      const now = step.id === stepId ? " is-now" : "";
      if (!canOpenStep(day, entry, step.id) && step.id !== stepId) {
        return `<span class="is-locked${now}">${esc(step.label)}</span>`;
      }
      return `<a class="${now.trim()}" href="#/day/${day.day}/${step.id}" ${step.id === stepId ? 'aria-current="step"' : ""}>${esc(step.label)}</a>`;
    })
    .join("")}</nav>`;
}

function renderQuiet(day) {
  return `<div class="card quiet">
    <h2>${esc(ui.quiet.title)}</h2>
    <p>${esc(ui.quiet.lead)}</p>
    <div class="breath" aria-live="polite">
      <div class="breath-stage">
        <div class="breath-orb" id="breath-orb"></div>
        <p class="breath-label" id="breath-label">${esc(ui.quiet.ready)}</p>
      </div>
      <p class="breath-count" id="breath-count">${esc(ui.quiet.total)}</p>
    </div>
    <button type="button" class="btn ghost" data-action="start-breath">${esc(ui.quiet.start)}</button>
    <h3>${esc(ui.quiet.prayerTitle)}</h3>
    <div class="prayer">${paragraphsHtml(shown(day.openingPrayer))}</div>
    <button type="button" class="btn" id="quiet-next" data-action="next" disabled>${esc(ui.quiet.nextLocked)}</button>
    <button type="button" class="btn ghost" data-action="skip-breath">${esc(ui.quiet.skip)}</button>
  </div>`;
}

function currentEdition() {
  return app.state.edition === "shangdi" ? "shangdi" : "shen";
}

function slotsFor(day, edition) {
  const text = day?.passage?.[edition] || "";
  const segmented = day?.segments?.[edition] || "";
  return segmentMode(text, segmented) === "tokens" ? passageSlots(text, segmented) : null;
}

function readingSlots(day) {
  return slotsFor(day, currentEdition());
}

function renderWordBar(day, entry, mode) {
  const slots = readingSlots(day);
  const words = slots ? resolveWords(entry.words, slots, currentEdition()) : normalizeWords(entry.words);
  const chips = words
    .map((word) => {
      const text = wordLabel(word, slots || undefined);
      if (!text) return "";
      const loc =
        typeof word === "string"
          ? `data-word="${esc(word)}"`
          : `data-verse="${esc(word.verse)}" data-from="${word.from}" data-to="${word.to}"`;
      return `<button type="button" class="word-chip" data-action="remove-word" ${loc} aria-label="${esc(fill(ui.words.remove, { word: text }))}">${esc(text)} <span aria-hidden="true">×</span></button>`;
    })
    .join("");
  const list = chips
    ? `<div class="word-list" aria-label="${esc(ui.words.listLabel)}">${chips}</div>`
    : "";
  const add =
    mode === "tokens"
      ? ""
      : `<button type="button" class="btn ghost" data-action="add-word">${esc(ui.words.add)}</button>`;
  const hint = `<p class="word-hint" aria-live="assertive" aria-atomic="true">${
    app.wordHintDay === day.day ? esc(ui.words.limit) : ""
  }</p>`;
  return `${list}${add}${hint}`;
}

function bgmPercent() {
  return Math.round(readBgmVolume() * 100);
}

function bgmStatusLabel() {
  const on = readBgmEnabled();
  return fill(ui.bgm.status, {
    state: on ? ui.bgm.stateOn : ui.bgm.stateOff,
    percent: String(bgmPercent()),
  });
}

function bgmToggle() {
  const on = readBgmEnabled();
  const name = fill(ui.bgm.status, {
    state: on ? ui.bgm.stateOn : ui.bgm.stateOff,
    percent: String(bgmPercent()),
  });
  return `<label class="toggle">
    <input type="checkbox" data-setting="bgm" aria-label="${esc(name)}" ${on ? "checked" : ""}>
    <span class="switch" aria-hidden="true"></span>
    <span>
      <strong>${esc(on ? ui.bgm.stateOn : ui.bgm.stateOff)}</strong>
      <small>${esc(ui.bgm.help)}</small>
    </span>
  </label>`;
}

function bgmCreditLine(credit = bgmTrack()) {
  const week = credit.weekLabel
    ? `<span class="bgm-week">${esc(fill(ui.bgm.weekLine, { week: credit.weekLabel, theme: credit.theme }))}</span>`
    : "";
  const sentence = fill(credit.edited ? ui.bgm.creditEdited : ui.bgm.creditLine, {
    title: screenTrackTitle(credit.title),
    author: credit.creditAuthor || credit.author,
  });
  return `<p class="bgm-credit">${week}${esc(sentence)}<a href="${esc(credit.source)}" target="_blank" rel="noopener noreferrer">${esc(ui.bgm.sourceLink)}</a> <a href="${esc(credit.license)}" target="_blank" rel="noopener noreferrer">${esc(credit.licenseLabel || ui.bgm.licenseLink)}</a></p>`;
}

function aboutMusicCredits() {
  const lines = [];
  for (const week of [1, 2, 3, 4]) {
    for (const slot of ["a", "b", "c", "d"]) {
      const credit = BGM_WEEKS[week]?.[slot];
      if (credit) lines.push(bgmCreditLine(credit));
    }
  }
  return `<div class="about-credits">${lines.join("")}</div>`;
}

function bgmSpeakerIcon(on) {
  const waves = on
    ? `<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M16 9.2a3.6 3.6 0 010 5.6M18.4 7a6.4 6.4 0 010 10"/>`
    : `<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M16 9.5l5 5M21 9.5l-5 5"/>`;
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3.5 9.2h3.2L12 4.6v14.8l-5.3-4.6H3.5z"/>${waves}</svg>`;
}

function bgmHeaderHtml() {
  const on = readBgmEnabled();
  const percent = bgmPercent();
  const volumeText = fill(ui.bgm.volumeValue, { percent: String(percent) });
  const open = app.bgmOpen ? "true" : "false";
  const hidden = app.bgmOpen ? "" : " hidden";
  return `<button type="button" class="bgm-speaker" data-action="bgm-panel" aria-expanded="${open}" aria-controls="bgm-panel" aria-label="${esc(bgmStatusLabel())}">${bgmSpeakerIcon(on)}</button>
    <div id="bgm-panel" class="bgm-panel" role="group" aria-label="${esc(ui.bgm.panelLabel)}"${hidden}>
      ${bgmToggle()}
      <label class="bgm-volume">
        <span>${esc(ui.bgm.volumeLabel)}</span>
        <input type="range" min="0" max="100" step="1" value="${percent}" data-setting="bgm-volume" aria-label="${esc(volumeText)}" aria-valuetext="${esc(volumeText)}">
      </label>
      ${bgmCreditLine()}
    </div>`;
}

function paintBgmHeader(options = {}) {
  const root = document.getElementById("bgm-control");
  if (!root) return;
  const active = document.activeElement;
  const mode = options.focus
    || (active?.matches?.("[data-setting='bgm']") ? "toggle" : "")
    || (active?.closest?.("[data-action='bgm-panel']") ? "speaker" : "");
  root.innerHTML = bgmHeaderHtml();
  if (mode === "toggle") root.querySelector("[data-setting='bgm']")?.focus();
  if (mode === "speaker") root.querySelector("[data-action='bgm-panel']")?.focus();
}

function renderSpeakBar() {
  if (speechVoiceStatus() !== "ready") return "";
  const phase = speechPhase();
  const playing = phase === "playing";
  const paused = phase === "paused";
  const playLabel = playing ? ui.read.speakPause : paused ? ui.read.speakResume : ui.read.speakPlay;
  const state = playing ? ui.read.speakPlaying : paused ? ui.read.speakPaused : "";
  const rates = speechRates()
    .map((value) => {
      const on = value === speechRate();
      const label = fill(ui.read.speakRateOption, { rate: value });
      return `<button type="button" data-action="speak-rate" data-rate="${value}" aria-pressed="${on ? "true" : "false"}" aria-label="${esc(label)}">${esc(label)}</button>`;
    })
    .join("");
  return `<div class="speak" data-speak-bar role="group" aria-label="${esc(ui.read.speakGroup)}">
    <p class="speak-hint">${esc(ui.read.speakHint)}</p>
    <div class="speak-row">
      <button type="button" class="btn" data-action="speak-toggle" aria-pressed="${playing ? "true" : "false"}">${esc(playLabel)}</button>
      <button type="button" class="btn ghost" data-action="speak-stop">${esc(ui.read.speakStop)}</button>
    </div>
    <div class="speak-rates" role="group" aria-label="${esc(ui.read.speakRate)}">${rates}</div>
    <p class="speak-status" aria-live="polite">${esc(state)}</p>
  </div>`;
}

function paintSpeakingVerse() {
  const verse = speechCursor()?.verse || "";
  for (const node of document.querySelectorAll(".passage .verse")) {
    node.classList.toggle("is-speaking", Boolean(verse) && node.dataset.verse === verse);
  }
}

function editionSwitch(edition) {
  const button = (id, label) => {
    const on = edition === id;
    const mark = on ? `<span class="tick" aria-hidden="true">✓</span>` : "";
    return `<button type="button" data-action="set-edition" data-edition="${id}" aria-pressed="${on ? "true" : "false"}" aria-label="${esc(label)}">${mark}${esc(label)}</button>`;
  };
  return `<div class="segmented" role="group" aria-label="${esc(ui.read.editionLabel)}">${button("shen", ui.read.shen)}${button("shangdi", ui.read.shangdi)}</div>`;
}

function renderRead(day) {
  const edition = app.state.edition === "shangdi" ? "shangdi" : "shen";
  const editionLabel = edition === "shangdi" ? ui.read.shangdi : ui.read.shen;
  const text = day.passage?.[edition] || "";
  const segmented = day.segments?.[edition] || "";
  const mode = segmentMode(text, segmented);
  const entry = dayState(app.state, day.day);
  if (mode === "mismatch") {
    const key = `${day.day}:${edition}`;
    if (!app.segmentWarned.has(key)) {
      app.segmentWarned.add(key);
      console.warn(
        `[advent] 第 ${day.day} 日的分詞（${editionLabel}）去掉「｜」之後與經文全文不一致，改為手動選取字詞。`
      );
    }
  }
  const guideLines = mode === "tokens"
    ? [
        { text: ui.read.hint },
        { text: ui.read.tapHint, live: true },
        { text: ui.read.limitHint },
      ]
    : [
        { text: ui.read.hint },
        { text: ui.read.selectHint, live: true },
      ];
  return `<div class="card reading">
    <h2>${esc(ui.read.title)}</h2>
    ${guideLines
      .map((line) => `<p class="hint"${line.live ? ' data-live-hint aria-live="polite"' : ""}>${esc(line.text)}</p>`)
      .join("")}
    ${editionSwitch(edition)}
    ${renderSpeakBar()}
    ${day.focus ? `<p class="focus">${esc(shown(fill(ui.day.focus, { focus: day.focus })))}</p>` : ""}
    ${passageHtml(text, mode === "tokens" ? segmented : "", entry.words, edition, { speakingVerse: speechCursor()?.verse || "" })}
    ${renderWordBar(day, entry, mode)}
    ${scriptureCopyright() ? `<p class="copyright">${esc(scriptureCopyright())}</p>` : ""}
    <button type="button" class="btn" data-action="next">${esc(ui.read.next)}</button>
  </div>`;
}

function renderExperience(day) {
  const text = shown(day.experience);
  if (!text) return "";
  return `<aside class="experience">
    <h3>${esc(ui.reflect.experienceTitle)}</h3>
    <p>${esc(text)}</p>
  </aside>`;
}

function renderReflect(day) {
  const entry = dayState(app.state, day.day);
  return `<div class="card">
    <h2>${esc(ui.reflect.title)}</h2>
    <p>${esc(ui.reflect.lead)}</p>
    <label class="field">
      <span>${esc(shown(day.reflect1))}</span>
      <textarea rows="3" maxlength="2000" autocomplete="off" data-field="reflect1" placeholder="${esc(ui.reflect.placeholder)}">${esc(entry.reflect1 || "")}</textarea>
    </label>
    <label class="field">
      <span>${esc(shown(day.reflect2))}</span>
      <textarea rows="3" maxlength="2000" autocomplete="off" data-field="reflect2" placeholder="${esc(ui.reflect.placeholder)}">${esc(entry.reflect2 || "")}</textarea>
    </label>
    ${renderExperience(day)}
    <button type="button" class="btn" data-action="next">${esc(ui.reflect.toAfter)}</button>
  </div>`;
}

function renderPrayer(day, entry) {
  if (app.thanksDay === day.day) {
    const closing = day.day === 27 ? ui.prayer.doneSeason : ui.prayer.doneDay;
    return `<div class="card thanks">
      <h2>${esc(ui.prayer.doneTitle)}</h2>
      <p>${esc(closing)}</p>
      <a class="btn" href="#/plan">${esc(ui.prayer.backToPlan)}</a>
      <a class="btn ghost" href="#/">${esc(ui.prayer.backHome)}</a>
    </div>`;
  }
  const slots = readingSlots(day);
  const words = slots ? resolveWords(entry.words, slots, currentEdition()) : normalizeWords(entry.words);
  const frames = words.length && Array.isArray(app.plan.prayerFrames) ? app.plan.prayerFrames : [];
  const index = frames.length ? Math.min(Math.max(app.frameIndex || 0, 0), frames.length - 1) : 0;
  const tabs = frames
    .map(
      (frame, frameIndex) =>
        `<button type="button" role="tab" id="frame-tab-${frameIndex}" aria-selected="${frameIndex === index ? "true" : "false"}" aria-controls="frame-panel" data-action="prayer-frame" data-index="${frameIndex}">${esc(frame.name)}</button>`
    )
    .join("");
  const filled = frames.length
    ? prayerFrameHtml(
        fillPrayerFrame(shown(frames[index].text), {
          words: entry.words,
          slots,
          edition: currentEdition(),
          before: entry.before,
          after: entry.after,
        })
      )
    : "";
  const framesBlock = frames.length
    ? `<p class="word-recap">${esc(ui.words.recap)} ${esc(formatMarkedWords(entry.words, slots, currentEdition()))}</p>
      <h3>${esc(ui.prayer.framesLabel)}</h3>
      <p class="hint">${esc(ui.prayer.withWords)}</p>
      <div class="frame-tabs" role="tablist" aria-label="${esc(ui.prayer.framesLabel)}">${tabs}</div>
      <div class="prayer frame" id="frame-panel" role="tabpanel" aria-labelledby="frame-tab-${index}" data-swipe="frame">${filled}</div>`
    : "";
  return `<div class="card">
    <h2>${esc(ui.prayer.title)}</h2>
    <p>${esc(shown(ui.prayer.lead))}</p>
    <h3>${esc(ui.prayer.sampleTitle)}</h3>
    <div class="prayer">${paragraphsHtml(shown(day.samplePrayer))}</div>
    ${framesBlock}
    <button type="button" class="btn" data-action="complete">${esc(entry.completed ? ui.prayer.saveAgain : ui.prayer.complete)}</button>
  </div>`;
}

function renderDay(day, requestedStep, today, phase) {
  const entry = dayState(app.state, day.day);
  if (app.frameDay !== day.day) {
    app.frameDay = day.day;
    app.frameIndex = 0;
  }
  const stepId = activeStepId(day, entry, requestedStep);
  if ((requestedStep || "") !== stepId) {
    location.replace(`#/day/${day.day}/${stepId}`);
    return;
  }
  const future = phase !== "after" && day.date > today;
  let body = "";
  if (stepId === "quiet") body = renderQuiet(day);
  else if (stepId === "before") body = renderPicker("before", entry);
  else if (stepId === "read") body = renderRead(day);
  else if (stepId === "after") body = entry.after ? renderComparison(day, entry) : renderPicker("after", entry);
  else if (stepId === "reflect") body = renderReflect(day);
  else if (stepId === "review") body = renderReview(day);
  else body = renderPrayer(day, entry);
  const showBack = stepId !== "quiet" && app.thanksDay !== day.day;
  setTitle(fill(ui.day.pageTitle, { day: day.day, title: shown(day.title) }));
  main.dataset.day = String(day.day);
  main.dataset.step = stepId;
  main.innerHTML = `<article class="day">
    ${careBanner(today)}
    <p class="kicker">${esc(fill(ui.day.kicker, { day: day.day, date: formatFullDate(day.date, day.weekday) }))}</p>
    ${day.kind && day.kind !== "經文" ? `<p class="kicker kind">${esc(day.kind)}</p>` : ""}
    <h1>${esc(shown(day.title))}</h1>
    <p class="ref">${esc(day.reference)}</p>
    ${candleFigure(day.week, `${esc(day.weekLabel)} · ${esc(shown(day.weekTheme))}`)}
    ${future ? `<p class="future">${esc(ui.day.future)}</p>` : ""}
    ${renderSteps(day, entry, stepId)}
    ${body}
    ${showBack ? `<button type="button" class="btn ghost back" data-action="back">${esc(ui.day.back)}</button>` : ""}
  </article>`;
}

function renderPlan(today, phase, asHome) {
  const todayDay = app.plan.days.find((day) => day.date === today) || null;
  const candleWeek = phase === "before" ? 0 : phase === "after" ? 4 : todayDay?.week || 4;
  const groups = weeksOf(app.plan.days)
    .map((week) => {
      const days = app.plan.days.filter((day) => day.week === week.week);
      const items = days
        .map((day) => {
          const entry = app.state.days[String(day.day)];
          const done = entry?.completed ? `<span class="done">${esc(ui.plan.done)}</span>` : "";
          const shownWords = formatMarkedWords(entry?.words, readingSlots(day), currentEdition());
          const wordLine = shownWords
            ? `<span class="day-words">${esc(shownWords)}</span>`
            : "";
          const mood = miniDots(entry);
          const review = day.review
            ? `<span class="tag">${esc(day.review.scope === "season" ? ui.review.seasonTag : ui.review.weekTag)}</span>`
            : "";
          return `<a class="day-link" href="#/day/${day.day}">
            <span class="meta">${esc(formatMonthDay(day.date))} · ${esc(day.weekday)} ${done}${review}</span>
            <span class="name">${esc(shown(day.title))}</span>
            <span class="passage-ref">${esc(day.reference)}${mood}</span>
            ${wordLine}
          </a>`;
        })
        .join("");
      return `<section class="week-block">
        <div class="week-head">
          <img src="./assets/candles_week${week.week}.svg" alt="" width="120" height="74">
          <div>
            <h2>${esc(week.label)}</h2>
            <p>${esc(shown(week.theme))}</p>
            <p class="muted">${esc(formatMonthDay(week.start))} – ${esc(formatMonthDay(week.end))}</p>
          </div>
        </div>
        ${items}
      </section>`;
    })
    .join("");
  const lead = asHome ? `<p class="lead">${esc(ui.plan.afterLead)}</p>` : `<p class="lead">${esc(ui.plan.lead)}</p>`;
  setTitle(asHome ? ui.plan.afterPageTitle : ui.plan.title);
  delete main.dataset.day;
  delete main.dataset.step;
  main.innerHTML = `<article>
    ${careBanner(today)}
    <p class="kicker">${esc(ui.plan.kicker)}</p>
    <h1>${esc(phase === "after" && asHome ? ui.plan.afterTitle : ui.plan.title)}</h1>
    ${candleFigure(candleWeek, "")}
    ${lead}
    ${groups}
  </article>`;
}

function miniDots(entry) {
  if (!entry) return "";
  const bits = [entry.before, entry.after]
    .filter(Boolean)
    .map((pick) => {
      const color = coreById(pick.coreId)?.color || "#E4DCCF";
      return `<i class="dot" style="background:${esc(color)}" aria-hidden="true"></i><span class="sr-only">${esc(pick.coreZh)}</span>`;
    });
  return bits.length ? `<span class="mini-dots">${bits.join("")}</span>` : "";
}

function renderHome(today) {
  const weeks = weeksOf(app.plan.days);
  const start = app.plan.season.start;
  const end = app.plan.season.end;
  const endDay = app.plan.days[app.plan.days.length - 1];
  const startDay = app.plan.days[0];
  const left = daysBetween(today, start);
  const cards = weeks
    .map(
      (week) => `<li>
        <span class="meta">${esc(week.label)}</span>
        <strong>${esc(week.theme)}</strong>
        <span class="muted">${esc(formatMonthDay(week.start))} – ${esc(formatMonthDay(week.end))}</span>
      </li>`
    )
    .join("");
  setTitle(ui.home.title);
  delete main.dataset.day;
  delete main.dataset.step;
  main.innerHTML = `<article class="home">
    <p class="kicker">${esc(fill(ui.home.kicker, { date: formatFullDate(start, startDay.weekday) }))}</p>
    <h1>${esc(ui.home.headingStart)}<br>${esc(ui.home.headingEnd)}</h1>
    ${candleFigure(0, ui.home.candles)}
    <p class="countdown"><span class="num">${left}</span><span>${esc(ui.home.countdown)}</span></p>
    <p class="lead">${esc(fill(ui.home.lead, { start: formatFullDate(start, startDay.weekday), end: formatFullDate(end, endDay.weekday) }))}</p>
    <ol class="week-preview">${cards}</ol>
    <a class="btn" href="#/plan">${esc(ui.home.planLink)}</a>
    <p class="footnote">${esc(ui.home.footnote)}</p>
  </article>`;
}

function renderAbout(today) {
  const edition = app.state.edition === "shangdi" ? "shangdi" : "shen";
  const share = app.state.shareFeelings === true;
  const contact = activeChurchContact();
  const careContact = contact ? (contact.endsWith("。") ? contact : `${contact}。`) : "";
  setTitle(ui.about.title);
  delete main.dataset.day;
  delete main.dataset.step;
  main.innerHTML = `<article class="about">
    ${careBanner(today)}
    <p class="kicker">${esc(ui.about.kicker)}</p>
    <h1>${esc(ui.about.heading)}</h1>
    <div class="card">
      <p>${esc(ui.about.intro)}</p>
      <p>${esc(ui.about.noJudgement)}</p>
    </div>
    <div class="card">
      <h2>${esc(ui.about.editionTitle)}</h2>
      <p>${esc(ui.about.editionBody)}</p>
      ${editionSwitch(edition)}
      <p class="copyright">${esc(scriptureCopyright())}</p>
    </div>
    <div class="card">
      <h2>${esc(ui.about.privacyTitle)}</h2>
      <p>${esc(ui.about.privacyBody)}</p>
      <button type="button" class="btn ghost" data-action="clear-data">${esc(ui.about.clear)}</button>
    </div>
    <div class="card">
      <h2>${esc(ui.about.statsTitle)}</h2>
      <label class="toggle">
        <input type="checkbox" data-setting="shareFeelings" ${share ? "checked" : ""}>
        <span class="switch" aria-hidden="true"></span>
        <span>
          <strong>${esc(ui.about.shareLabel)}</strong>
          <small>${esc(ui.about.shareHelp)}</small>
        </span>
      </label>
    </div>
    <div class="card" id="music-credit">
      <h2>${esc(ui.bgm.aboutTitle)}</h2>
      <p>${esc(ui.bgm.aboutBody)}</p>
      <p>${esc(ui.bgm.duckNote)}</p>
      ${aboutMusicCredits()}
    </div>
    <div class="card">
      <h2>${esc(ui.about.installTitle)}</h2>
      <p>${esc(ui.about.installBody)}</p>
    </div>
    <div class="card">
      <h2>${esc(ui.about.careTitle)}</h2>
      <p>${careHtml(fill(ui.about.careBody, { contact: careContact }))}</p>
    </div>
  </article>`;
}

function focusKey(node) {
  if (!node?.dataset?.action && !node?.dataset?.setting) return "";
  const id =
    node.dataset.slot ||
    node.dataset.rate ||
    node.dataset.edition ||
    node.dataset.index ||
    node.dataset.order ||
    node.dataset.level ||
    node.dataset.core ||
    node.dataset.setting ||
    "";
  return `${node.dataset.action || node.dataset.setting}:${id}`;
}

function rerenderKeepingPlace() {
  const active = document.activeElement;
  const key = focusKey(active);
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
  if (!key) return;
  const [action, id] = key.split(":");
  const candidates = [
    ...main.querySelectorAll(`[data-action="${action}"]`),
    ...main.querySelectorAll(`[data-setting="${action}"]`),
  ];
  const next = candidates.find((node) => {
    const nodeId =
      node.dataset.slot ||
      node.dataset.rate ||
      node.dataset.edition ||
      node.dataset.index ||
      node.dataset.order ||
      node.dataset.level ||
      node.dataset.core ||
      node.dataset.setting ||
      "";
    return nodeId === id;
  });
  next?.focus?.({ preventScroll: true });
}

function announce(message) {
  const live = document.querySelector("#live-status");
  if (!live) return;
  const next = message || "";
  if (live.dataset.message === next) return;
  live.dataset.message = next;
  live.textContent = "";
  window.setTimeout(() => {
    if (live.dataset.message === next) live.textContent = next;
  }, 40);
}

function render() {
  if (app.plan) selectBgmTrack(location.search || "", todayISO(), app.plan.days, app.plan.season);
  paintBgmHeader();
  stopBreath();
  const route = parseRoute();
  const today = todayISO();
  const phase = seasonPhase(today, app.plan.season.start, app.plan.season.end);
  const todayDay = app.plan.days.find((day) => day.date === today) || null;

  if (route.name === "home" && phase === "during" && todayDay) {
    const entry = dayState(app.state, todayDay.day);
    const step = activeStepId(todayDay, entry, "");
    const target = `#/day/${todayDay.day}/${step}`;
    if (location.hash !== target) {
      location.replace(target);
      return;
    }
  }

  const viewKey = `${route.name}:${route.day || ""}:${route.step || ""}:${phase}`;
  const viewChanged = viewKey !== app.lastView;
  app.lastView = viewKey;
  if (viewChanged) {
    stopSpeech();
    restoreBgm();
  }

  if (route.name === "about") {
    renderAbout(today);
    setTab("about");
    maybeTrack("about");
  } else if (route.name === "plan" || (route.name === "home" && phase === "after")) {
    renderPlan(today, phase, route.name === "home");
    setTab(route.name === "home" ? "home" : "plan");
    maybeTrack(route.name === "home" ? "home" : "plan");
  } else if (route.name === "day") {
    const day = app.plan.days.find((item) => item.day === route.day);
    if (!day) {
      setTitle(ui.day.missingTitle);
      main.innerHTML = `<article class="card"><h1>${esc(ui.day.missingTitle)}</h1><p><a href="#/plan">${esc(ui.day.missingBody)}</a></p></article>`;
    } else {
      renderDay(day, route.step, today, phase);
      const onToday = phase === "during" && todayDay && todayDay.day === day.day;
      setTab(onToday ? "home" : "plan");
      maybeTrack("day", day.day);
    }
  } else {
    renderHome(today);
    setTab("home");
    maybeTrack("home");
  }

  paintSpeakingVerse();
  if (viewChanged) {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
    if (main.dataset.step === "read") announce(main.querySelector("[data-live-hint]")?.textContent || "");
  }
}

function goStep(day, stepId) {
  const target = `#/day/${day.day}/${stepId}`;
  if (location.hash === target) render();
  else location.hash = target;
}

function startBreath() {
  const orb = document.querySelector("#breath-orb");
  const label = document.querySelector("#breath-label");
  const count = document.querySelector("#breath-count");
  const next = document.querySelector("#quiet-next");
  if (!orb || !label || !count) return;
  const gen = ++app.breathGen;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    orb.style.transform = "none";
    orb.style.transition = "none";
  }
  const tick = (phase, cycle) => {
    if (gen !== app.breathGen) return;
    if (phase === "inhale") {
      label.textContent = ui.quiet.inhale;
      count.textContent = fill(ui.quiet.cycle, { cycle });
      orb.classList.remove("is-out");
      orb.classList.add("is-in");
      app.breathTimer = setTimeout(() => tick("exhale", cycle), breathPhaseMs("inhale", reduce));
      return;
    }
    label.textContent = ui.quiet.exhale;
    orb.classList.remove("is-in");
    orb.classList.add("is-out");
    app.breathTimer = setTimeout(() => {
      if (gen !== app.breathGen) return;
      if (cycle >= 3) {
        label.textContent = ui.quiet.doneLabel;
        count.textContent = ui.quiet.doneCount;
        orb.classList.remove("is-out");
        if (next) {
          next.disabled = false;
          next.textContent = ui.quiet.next;
        }
        return;
      }
      tick("inhale", cycle + 1);
    }, breathPhaseMs("exhale", reduce));
  };
  requestAnimationFrame(() => tick("inhale", 1));
}

function finishDay(day) {
  captureFields();
  const entry = dayState(app.state, day.day);
  entry.completed = true;
  if (!entry.completionSent && trackComplete(day.day)) {
    entry.completionSent = true;
  }
  if (app.state.shareFeelings && !entry.feelingShared) {
    const payload = anonymousFeelingEvent(day.day, entry.before, entry.after);
    if (payload && trackFeelings(payload, app.state.shareFeelings === true)) {
      entry.feelingShared = true;
    }
  }
  saveState(app.state);
  app.thanksDay = day.day;
  render();
}

function onClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  const route = parseRoute();
  const day = app.plan.days.find((item) => item.day === route.day);
  if (action === "dismiss-care") {
    app.state.careDismissedOn = todayISO();
    saveState(app.state);
    render();
    return;
  }
  if (action === "clear-data") {
    const ok = window.confirm(ui.about.clearConfirm);
    if (!ok) return;
    clearJournal(app.state);
    saveState(app.state);
    app.thanksDay = 0;
    render();
    return;
  }
  if (action === "set-edition") {
    stopSpeech();
    restoreBgm();
    app.state.edition = button.dataset.edition === "shangdi" ? "shangdi" : "shen";
    saveState(app.state);
    rerenderKeepingPlace();
    return;
  }
  if (action === "speak-toggle") {
    if (!day) return;
    const phase = speechPhase();
    if (phase === "playing") pauseSpeech();
    else if (phase === "paused") resumeSpeech();
    else {
      const edition = currentEdition();
      const lines = passageUtterances(day.reference, day.passage?.[edition] || "");
      speakPassage(lines, {
        onstart: () => duckBgm(),
        onsentence: () => paintSpeakingVerse(),
        onend: () => {
          restoreBgm();
          rerenderKeepingPlace();
        },
      });
    }
    rerenderKeepingPlace();
    return;
  }
  if (action === "speak-stop") {
    stopSpeech();
    restoreBgm();
    rerenderKeepingPlace();
    return;
  }
  if (action === "speak-rate") {
    setSpeechRate(button.dataset.rate);
    rerenderKeepingPlace();
    return;
  }
  if (action === "prayer-frame") {
    app.frameIndex = Number(button.dataset.index) || 0;
    render();
    return;
  }
  if (!day) return;
  const entry = dayState(app.state, day.day);
  if (action === "start-breath") {
    startBreath();
    return;
  }
  if (action === "skip-breath") {
    captureFields();
    const next = nextStepId(day, "quiet");
    markReached(entry, day, next);
    saveState(app.state);
    goStep(day, next);
    return;
  }
  if (action === "pick-core") {
    captureFields();
    const draft = ensureDraft(entry, main.dataset.step === "after" ? "after" : "before");
    const coreId = button.dataset.core;
    if (draft.coreId !== coreId) {
      draft.coreId = coreId;
      draft.feelingOrder = 0;
    }
    saveState(app.state);
    render();
    main.querySelector("[data-action='pick-feeling']")?.focus();
    return;
  }
  if (action === "pick-feeling") {
    captureFields();
    const draft = ensureDraft(entry, main.dataset.step === "after" ? "after" : "before");
    draft.feelingOrder = Number(button.dataset.order);
    saveState(app.state);
    render();
    main.querySelector("[data-action='pick-intensity']")?.focus();
    return;
  }
  if (action === "pick-intensity") {
    captureFields();
    const draft = ensureDraft(entry, main.dataset.step === "after" ? "after" : "before");
    const level = button.dataset.level;
    draft.intensity = Number(level);
    saveState(app.state);
    render();
    main.querySelector(`[data-action='pick-intensity'][data-level='${level}']`)?.focus();
    return;
  }
  if (action === "save-before" || action === "save-after") {
    captureFields();
    const which = action === "save-after" ? "after" : "before";
    const draft = ensureDraft(entry, which);
    const pick = pickFromDraft(draft);
    if (!pick) return;
    entry[which] = pick;
    entry[which === "after" ? "draftAfter" : "draftBefore"] = null;
    if (which === "before") {
      const next = nextStepId(day, "before");
      markReached(entry, day, next);
      saveState(app.state);
      goStep(day, next);
      return;
    }
    saveState(app.state);
    render();
    return;
  }
  if (action === "toggle-word" || action === "remove-word") {
    const edition = currentEdition();
    const slots = readingSlots(day) || [];
    const hasSlot = action === "toggle-word" && button.dataset.slot != null && button.dataset.slot !== "";
    const result =
      action === "remove-word"
        ? removeWord(
            entry.words,
            button.dataset.from
              ? { verse: button.dataset.verse || "", from: Number(button.dataset.from), to: Number(button.dataset.to) }
              : button.dataset.word,
            slots,
            edition
          )
        : toggleWord(
            entry.words,
            button.dataset.word,
            hasSlot
              ? {
                  slots,
                  slotIndex: Number(button.dataset.slot),
                  edition,
                  shen: slotsFor(day, "shen"),
                  shangdi: slotsFor(day, "shangdi"),
                }
              : {}
          );
    entry.words = result.words;
    app.wordHintDay = action === "toggle-word" && result.limited ? day.day : 0;
    if (app.wordHintDay === day.day) announce(ui.words.limit);
    saveState(app.state);
    rerenderKeepingPlace();
    return;
  }
  if (action === "add-word") {
    const live = window.getSelection?.().toString() || "";
    const selected = live.trim() ? live : app.pendingSelection;
    const before = normalizeWords(entry.words).length;
    const result = addWord(entry.words, selected);
    entry.words = result.words;
    if (result.limited) {
      app.wordHintDay = day.day;
      announce(ui.words.limit);
    } else if (result.words.length !== before) app.wordHintDay = 0;
    app.pendingSelection = "";
    saveState(app.state);
    window.getSelection?.()?.removeAllRanges?.();
    rerenderKeepingPlace();
    return;
  }
  if (action === "redo-after") {
    entry.after = null;
    entry.draftAfter = null;
    saveState(app.state);
    render();
    return;
  }
  if (action === "next") {
    captureFields();
    const step = main.dataset.step;
    const next = nextStepId(day, step);
    if (!next) return;
    markReached(entry, day, next);
    saveState(app.state);
    goStep(day, next);
    return;
  }
  if (action === "back") {
    captureFields();
    const prev = previousStepId(day, main.dataset.step);
    if (!prev) return;
    saveState(app.state);
    goStep(day, prev);
    return;
  }
  if (action === "complete") {
    finishDay(day);
  }
}

function onKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  const button = event.target.closest("path[data-action], [data-action]");
  if (!button || button.tagName === "BUTTON" || button.tagName === "A") return;
  event.preventDefault();
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

async function mainInit() {
  const [plan, feelings, wheelSvg] = await Promise.all([
    fetch("./data/plan.json").then((response) => {
      if (!response.ok) throw new Error("plan");
      return response.json();
    }),
    fetch("./data/feelings.json").then((response) => {
      if (!response.ok) throw new Error("feelings");
      return response.json();
    }),
    fetch("./assets/emotion_wheel.svg").then((response) => {
      if (!response.ok) throw new Error("wheel");
      return response.text();
    }),
  ]);
  const sheetId = String(siteConfig().sheetId || "").trim();
  const sheetCache = sheetId ? loadSheetCache() : null;
  const initial = sheetId ? applySheetCache(plan, feelings, sheetCache) : { plan, feelings };
  app.plan = initial.plan;
  app.feelings = initial.feelings;
  app.wheelSvg = wheelSvg;
  app.state = loadState();
  initStats(siteConfig().goatcounter || "");
  let booted = false;
  initDeviceSpeech(undefined, () => {
    if (booted) rerenderKeepingPlace();
  });
  document.addEventListener("selectionchange", () => {
    const text = window.getSelection?.().toString() || "";
    if (text.trim()) app.pendingSelection = text;
  });
  main.addEventListener("pointerdown", (event) => {
    if (event.target.closest("[data-action='add-word']")) event.preventDefault();
  });
  main.addEventListener("click", onClick);
  main.addEventListener("keydown", onKeydown);
  main.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.changedTouches[0];
      app.touchStart = touch
        ? {
            x: touch.clientX,
            y: touch.clientY,
            frame: Boolean(event.target.closest("[data-swipe='frame']")),
          }
        : null;
    },
    { passive: true }
  );
  main.addEventListener(
    "touchend",
    (event) => {
      const start = app.touchStart;
      app.touchStart = null;
      if (!start?.frame || main.dataset.step !== "prayer") return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
      const dayNumber = Number(main.dataset.day);
      const day = app.plan.days.find((item) => item.day === dayNumber);
      if (!day) return;
      const entry = dayState(app.state, day.day);
      const frames = normalizeWords(entry.words).length ? app.plan.prayerFrames || [] : [];
      if (frames.length < 2) return;
      const next = (app.frameIndex || 0) + (dx < 0 ? 1 : -1);
      app.frameIndex = Math.min(frames.length - 1, Math.max(0, next));
      render();
    },
    { passive: true }
  );
  main.addEventListener("change", (event) => {
    const share = event.target.closest("[data-setting='shareFeelings']");
    if (share) {
      app.state.shareFeelings = share.checked === true;
      saveState(app.state);
    }
  });
  document.addEventListener("click", (event) => {
    const opener = event.target.closest?.("[data-action='bgm-panel']");
    if (opener) {
      app.bgmOpen = !app.bgmOpen;
      paintBgmHeader();
      return;
    }
    if (app.bgmOpen && !event.target.closest?.("#bgm-control")) {
      app.bgmOpen = false;
      paintBgmHeader();
    }
  });
  document.addEventListener("change", (event) => {
    const bgm = event.target.closest?.("[data-setting='bgm']");
    if (!bgm) return;
    setBgmEnabled(bgm.checked === true);
    paintBgmHeader({ focus: "toggle" });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !app.bgmOpen) return;
    event.preventDefault();
    app.bgmOpen = false;
    paintBgmHeader({ focus: "speaker" });
  });
  document.addEventListener("input", (event) => {
    const range = event.target.closest?.("[data-setting='bgm-volume']");
    if (!range) return;
    const percent = setBgmVolume(Number(range.value) / 100);
    const volumeText = fill(ui.bgm.volumeValue, { percent: String(percent) });
    range.setAttribute("aria-label", volumeText);
    range.setAttribute("aria-valuetext", volumeText);
    const button = document.querySelector("[data-action='bgm-panel']");
    if (button) button.setAttribute("aria-label", bgmStatusLabel());
  });
  bindBgmGesture(document);
  window.addEventListener("hashchange", () => {
    app.thanksDay = 0;
    render();
  });
  booted = true;
  render();
  if (sheetId) {
    refreshFromSheet({
      sheetId,
      bundledPlan: plan,
      bundledFeelings: feelings,
      cache: sheetCache,
      fetchImpl: (url) => fetch(url, { cache: "no-store" }),
      warn: (message) => console.warn(message),
    })
      .then((next) => {
        saveSheetCache(next.cache);
        if (contentSignature(app.plan, app.feelings) === contentSignature(next.plan, next.feelings)) return;
        captureFields();
        app.plan = next.plan;
        app.feelings = next.feelings;
        render();
      })
      .catch((error) => {
        console.warn(`[advent] ${fill(ui.errors.sheetRefresh, { detail: error?.message || error })}`);
      });
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

mainInit().catch(() => {
  main.innerHTML = `<article class="card"><h1>${esc(ui.errors.loadTitle)}</h1><p>${esc(ui.errors.loadBody)}</p></article>`;
});

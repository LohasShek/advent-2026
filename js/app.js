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
  prayerFrameHtml,
  previousStepId,
  segmentMode,
  toggleWord,
  reviewBounds,
  reviewIntensity,
  reviewSummary,
  seasonPhase,
  weeksOf,
} from "./logic.js";
import {
  clearJournal,
  dayState,
  entriesByDate,
  loadState,
  saveState,
} from "./storage.js";
import {
  initStats,
  statsEnabled,
  trackComplete,
  trackFeelings,
  trackPage,
} from "./stats.js";
import { applySheetCache, loadSheetCache, refreshFromSheet, saveSheetCache } from "./sheet.js";
import { initDeviceSpeech } from "./speech.js";
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

function maybeTrack(path) {
  if (path === app.lastTracked) return;
  app.lastTracked = path;
  trackPage(path);
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
    path.setAttribute("aria-label", core.zh);
    path.setAttribute("aria-pressed", core.id === selectedId ? "true" : "false");
    path.dataset.action = "pick-core";
    path.dataset.core = core.id;
    if (selectedId && core.id !== selectedId) path.classList.add("is-dim");
    if (core.id === selectedId) {
      path.classList.add("is-selected");
      path.setAttribute("stroke", "#7A6A9E");
      path.setAttribute("stroke-width", "8");
    }
  }
  for (const text of svg.querySelectorAll("text")) text.setAttribute("pointer-events", "none");
  const selected = coreById(selectedId);
  if (selected) {
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", "200");
    label.setAttribute("y", "206");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", "16");
    label.setAttribute("fill", "#4A4060");
    label.setAttribute("pointer-events", "none");
    label.textContent = selected.zh;
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
            return `<button type="button" class="choice ${on ? "is-on" : ""}" style="--chip:${esc(selected.color)}" data-action="pick-feeling" data-order="${item.order}" aria-pressed="${on ? "true" : "false"}">
              <span>${esc(item.zh)}</span><small>${esc(item.en)}</small>
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
            return `<button type="button" class="choice level ${on ? "is-on" : ""}" data-action="pick-intensity" data-level="${item.level}" aria-pressed="${on ? "true" : "false"}">
              <span class="lv">${item.level}</span><span class="lb">${esc(item.label)}</span>
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
      const words = normalizeWords(entry?.words);
      const wordLine = words.length
        ? `<p class="rev-words">${esc(ui.words.reviewLabel)} ${esc(formatMarkedWords(words))}</p>`
        : "";
      return `<div class="rev-row">
        <a href="#/day/${item.day}">${esc(formatMonthDay(item.date))} · ${esc(item.title)}</a>
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
      <div class="breath-orb" id="breath-orb"></div>
      <p class="breath-label" id="breath-label">${esc(ui.quiet.ready)}</p>
      <p class="breath-count" id="breath-count">${esc(ui.quiet.total)}</p>
    </div>
    <button type="button" class="btn ghost" data-action="start-breath">${esc(ui.quiet.start)}</button>
    <h3>${esc(ui.quiet.prayerTitle)}</h3>
    <div class="prayer">${paragraphsHtml(shown(day.openingPrayer))}</div>
    <button type="button" class="btn" id="quiet-next" data-action="next" disabled>${esc(ui.quiet.nextLocked)}</button>
    <button type="button" class="btn ghost" data-action="skip-breath">${esc(ui.quiet.skip)}</button>
  </div>`;
}

function renderWordBar(day, entry, mode) {
  const words = normalizeWords(entry.words);
  const chips = words
    .map(
      (word) =>
        `<button type="button" class="word-chip" data-action="remove-word" data-word="${esc(word)}" aria-label="${esc(fill(ui.words.remove, { word }))}">${esc(word)} <span aria-hidden="true">×</span></button>`
    )
    .join("");
  const list = chips
    ? `<div class="word-list" aria-label="${esc(ui.words.listLabel)}">${chips}</div>`
    : "";
  const add =
    mode === "tokens"
      ? ""
      : `<button type="button" class="btn ghost" data-action="add-word">${esc(ui.words.add)}</button>`;
  const hint =
    app.wordHintDay === day.day ? `<p class="word-hint" role="status">${esc(ui.words.limit)}</p>` : "";
  return `${list}${add}${hint}`;
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
  const markHint = mode === "tokens" ? ui.read.tokenHint : ui.read.selectHint;
  return `<div class="card reading">
    <h2>${esc(ui.read.title)}</h2>
    <p class="hint">${esc(ui.read.hint)}</p>
    <p class="hint">${esc(markHint)}</p>
    <div class="segmented" role="group" aria-label="${esc(ui.read.editionLabel)}">
      <button type="button" data-action="set-edition" data-edition="shen" aria-pressed="${edition === "shen" ? "true" : "false"}">${esc(ui.read.shen)}</button>
      <button type="button" data-action="set-edition" data-edition="shangdi" aria-pressed="${edition === "shangdi" ? "true" : "false"}">${esc(ui.read.shangdi)}</button>
    </div>
    ${day.focus ? `<p class="focus">${esc(shown(fill(ui.day.focus, { focus: day.focus })))}</p>` : ""}
    ${passageHtml(text, mode === "tokens" ? segmented : "", entry.words)}
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
  const words = normalizeWords(entry.words);
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
        fillPrayerFrame(shown(frames[index].text), { words, before: entry.before, after: entry.after })
      )
    : "";
  const framesBlock = frames.length
    ? `<p class="word-recap">${esc(ui.words.recap)} ${esc(formatMarkedWords(words))}</p>
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
          const marked = normalizeWords(entry?.words);
          const wordLine = marked.length
            ? `<span class="day-words">${esc(formatMarkedWords(marked))}</span>`
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
      return `<i class="dot" style="background:${esc(color)}" title="${esc(pick.coreZh)}"></i>`;
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
  const stats = statsEnabled() ? `<p>${esc(ui.about.statsOn)}</p>` : `<p>${esc(ui.about.statsOff)}</p>`;
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
      <div class="segmented" role="group" aria-label="${esc(ui.read.editionLabel)}">
        <button type="button" data-action="set-edition" data-edition="shen" aria-pressed="${edition === "shen" ? "true" : "false"}">${esc(ui.read.shen)}</button>
        <button type="button" data-action="set-edition" data-edition="shangdi" aria-pressed="${edition === "shangdi" ? "true" : "false"}">${esc(ui.read.shangdi)}</button>
      </div>
      <p class="copyright">${esc(scriptureCopyright())}</p>
    </div>
    <div class="card">
      <h2>${esc(ui.about.privacyTitle)}</h2>
      <p>${esc(ui.about.privacyBody)}</p>
      <button type="button" class="btn ghost" data-action="clear-data">${esc(ui.about.clear)}</button>
    </div>
    <div class="card">
      <h2>${esc(ui.about.statsTitle)}</h2>
      ${stats}
      <label class="toggle">
        <input type="checkbox" data-setting="shareFeelings" ${share ? "checked" : ""}>
        <span class="switch" aria-hidden="true"></span>
        <span>
          <strong>${esc(ui.about.shareLabel)}</strong>
          <small>${esc(ui.about.shareHelp)}</small>
        </span>
      </label>
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

function rerenderKeepingPlace() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

function render() {
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

  if (route.name === "about") {
    renderAbout(today);
    setTab("about");
    maybeTrack("/about");
  } else if (route.name === "plan" || (route.name === "home" && phase === "after")) {
    renderPlan(today, phase, route.name === "home");
    setTab(route.name === "home" ? "home" : "plan");
    maybeTrack(route.name === "home" ? "/" : "/plan");
  } else if (route.name === "day") {
    const day = app.plan.days.find((item) => item.day === route.day);
    if (!day) {
      setTitle(ui.day.missingTitle);
      main.innerHTML = `<article class="card"><h1>${esc(ui.day.missingTitle)}</h1><p><a href="#/plan">${esc(ui.day.missingBody)}</a></p></article>`;
    } else {
      renderDay(day, route.step, today, phase);
      const onToday = phase === "during" && todayDay && todayDay.day === day.day;
      setTab(onToday ? "home" : "plan");
      maybeTrack(`/day/${day.day}`);
    }
  } else {
    renderHome(today);
    setTab("home");
    maybeTrack("/");
  }

  if (viewChanged) {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
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
  const tick = (phase, cycle) => {
    if (gen !== app.breathGen) return;
    if (phase === "inhale") {
      label.textContent = ui.quiet.inhale;
      count.textContent = fill(ui.quiet.cycle, { cycle });
      orb.classList.remove("is-out");
      orb.classList.add("is-in");
      app.breathTimer = setTimeout(() => tick("exhale", cycle), reduce ? 400 : 4000);
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
    }, reduce ? 400 : 4000);
  };
  requestAnimationFrame(() => tick("inhale", 1));
}

function finishDay(day) {
  captureFields();
  const entry = dayState(app.state, day.day);
  entry.completed = true;
  if (!entry.completionSent) {
    trackComplete(day.day);
    entry.completionSent = true;
  }
  if (app.state.shareFeelings && !entry.feelingShared) {
    const payload = anonymousFeelingEvent(day.day, entry.before, entry.after);
    if (payload) {
      trackFeelings(payload);
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
    app.state.edition = button.dataset.edition === "shangdi" ? "shangdi" : "shen";
    saveState(app.state);
    render();
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
    return;
  }
  if (action === "pick-feeling") {
    captureFields();
    const draft = ensureDraft(entry, main.dataset.step === "after" ? "after" : "before");
    draft.feelingOrder = Number(button.dataset.order);
    saveState(app.state);
    render();
    return;
  }
  if (action === "pick-intensity") {
    captureFields();
    const draft = ensureDraft(entry, main.dataset.step === "after" ? "after" : "before");
    draft.intensity = Number(button.dataset.level);
    saveState(app.state);
    render();
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
    const result = toggleWord(entry.words, button.dataset.word);
    entry.words = result.words;
    app.wordHintDay = action === "toggle-word" && result.limited ? day.day : 0;
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
    if (result.limited) app.wordHintDay = day.day;
    else if (result.words.length !== before) app.wordHintDay = 0;
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
  initDeviceSpeech();
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
    const input = event.target.closest("[data-setting='shareFeelings']");
    if (!input) return;
    app.state.shareFeelings = input.checked === true;
    saveState(app.state);
  });
  window.addEventListener("hashchange", () => {
    app.thanksDay = 0;
    render();
  });
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

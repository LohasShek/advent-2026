import {
  SCRIPTURE_COPYRIGHT,
  activeStepId,
  anonymousFeelingEvent,
  candleAlt,
  canOpenStep,
  careMessage,
  careStreak,
  comparisonNote,
  countCores,
  daysBetween,
  esc,
  flowSteps,
  formatFullDate,
  formatMonthDay,
  hongKongDate,
  markReached,
  nextStepId,
  paragraphsHtml,
  passageHtml,
  previousStepId,
  reviewBounds,
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
};

function siteConfig() {
  return window.ADVENT_CONFIG || {};
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
  document.title = text ? `${text} · 將臨期情感讀經` : "將臨期情感讀經 2026";
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
  return careMessage(app.feelings.care.template, siteConfig().churchContact || "");
}

function careBanner(today) {
  const text = careText(today);
  if (!text) return "";
  return `<aside class="care">
    <p>${esc(text)}</p>
    <button type="button" class="btn ghost" data-action="dismiss-care">我知道了，今天先收起</button>
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
  svg.setAttribute("aria-label", "感受之輪");
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
  const heading = which === "after" ? "讀經之後，此刻的感受是？" : "讀經之前，你帶着甚麼感受？";
  const lead = which === "after"
    ? "再揀一次就好。和剛才不同，或是一樣，都可以。"
    : "點外面一圈，再揀細一點的感受，然後強度。";
  const feelings = selected
    ? `<div class="feeling-list" role="group" aria-label="${esc(selected.zh)}的細分感受">
        <p class="section-label">細一點，比較像……</p>
        ${selected.feelings
          .map((item) => {
            const on = item.order === Number(draft.feelingOrder);
            return `<button type="button" class="choice ${on ? "is-on" : ""}" style="--chip:${esc(selected.color)}" data-action="pick-feeling" data-order="${item.order}" aria-pressed="${on ? "true" : "false"}">
              <span>${esc(item.zh)}</span><small>${esc(item.en)}</small>
            </button>`;
          })
          .join("")}
      </div>`
    : `<p class="muted center">先在圓環上點一種核心情緒。</p>`;
  const intensity = selected
    ? `<div class="intensity" role="group" aria-label="強度">
        <p class="section-label">有幾強烈？</p>
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
        <span>因為……（可留空）</span>
        <input type="text" maxlength="80" autocomplete="off" data-field="because" placeholder="只留一句，也可以不寫" value="${esc(draft.because || "")}">
        <small>這句話只存在這部裝置，不會被送出。</small>
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
      ${which === "after" ? "並排看看" : "記下感受，去讀經"}
    </button>
  </div>`;
}

function renderPickColumn(pick, label) {
  if (!pick) {
    return `<article class="pick-card"><h3>${esc(label)}</h3><p class="muted">尚未記下</p></article>`;
  }
  const core = coreById(pick.coreId);
  const color = core?.color || "#E4DCCF";
  const note = String(pick.because || "").trim();
  const because = note
    ? `<p class="because">${esc(note.startsWith("因為") ? note : `因為${note}`)}</p>`
    : "";
  return `<article class="pick-card">
    <div class="swatch" style="background:${esc(color)}"></div>
    <div class="body">
      <h3>${esc(label)}</h3>
      <p class="core-name">${esc(pick.coreZh)}</p>
      <p class="fine">${esc(pick.feelingZh)}</p>
      <p class="level"><span class="sr-only">強度 ${esc(intensityLabel(pick.intensity))}</span>${esc(intensityLabel(pick.intensity))} ${dots(pick.intensity)}</p>
      ${because}
    </div>
  </article>`;
}

function renderComparison(entry) {
  return `<div class="card">
    <h2>讀經之前，讀經之後</h2>
    <p>${esc(comparisonNote(entry.before, entry.after))}</p>
    <div class="compare">
      ${renderPickColumn(entry.before, "讀經之前")}
      ${renderPickColumn(entry.after, "讀經之後")}
    </div>
    <button type="button" class="btn" data-action="next">去反思</button>
    <button type="button" class="btn ghost" data-action="redo-after">改一改讀經後的感受</button>
  </div>`;
}

function feelBit(pick) {
  if (!pick) return `<span class="muted">未記</span>`;
  const color = coreById(pick.coreId)?.color || "#E4DCCF";
  return `<span class="feel-bit"><i class="dot" style="background:${esc(color)}"></i>${esc(pick.coreZh)} · ${esc(pick.feelingZh)}</span>`;
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
      return `<div class="rev-row">
        <a href="#/day/${item.day}">${esc(formatMonthDay(item.date))} · ${esc(item.title)}</a>
        <div class="rev-feel">${feelBit(entry?.before)} <span aria-hidden="true">→</span> ${feelBit(entry?.after)}</div>
      </div>`;
    })
    .join("");
  const title = bounds.scope === "season" ? "將臨期總回顧" : "一週感受回顧";
  return `<div class="card review">
    <h2>${title}</h2>
    ${paragraphsHtml(day.review.prompt)}
    <p class="summary">${esc(reviewSummary(countCores(beforePicks), countCores(afterPicks)))}</p>
    ${renderBars(countCores(beforePicks), "讀經前")}
    ${renderBars(countCores(afterPicks), "讀經後")}
    <div class="rev-list">${rows}</div>
    <button type="button" class="btn" data-action="next">帶着這些去祈禱</button>
  </div>`;
}

function renderSteps(day, entry, stepId) {
  return `<nav class="steps" aria-label="今日步驟">${flowSteps(day)
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
    <h2>安靜</h2>
    <p>用自己的節奏，慢慢呼吸三次。不必趕。</p>
    <div class="breath" aria-live="polite">
      <div class="breath-orb" id="breath-orb"></div>
      <p class="breath-label" id="breath-label">準備好就可以開始</p>
      <p class="breath-count" id="breath-count">一共三次</p>
    </div>
    <button type="button" class="btn ghost" data-action="start-breath">開始三次呼吸</button>
    <h3>開場禱文</h3>
    <div class="prayer">${paragraphsHtml(day.openingPrayer)}</div>
    <button type="button" class="btn" id="quiet-next" data-action="next" disabled>三次呼吸之後繼續</button>
    <button type="button" class="btn ghost" data-action="skip-breath">我已經安靜好了</button>
  </div>`;
}

function renderRead(day) {
  const edition = app.state.edition === "shangdi" ? "shangdi" : "shen";
  const text = day.passage?.[edition] || "";
  return `<div class="card reading">
    <h2>讀經</h2>
    <p class="hint">建議慢慢讀兩遍。讀的時候不必分析，讓句子停一停。</p>
    <div class="segmented" role="group" aria-label="經文版本">
      <button type="button" data-action="set-edition" data-edition="shen" aria-pressed="${edition === "shen" ? "true" : "false"}">神版</button>
      <button type="button" data-action="set-edition" data-edition="shangdi" aria-pressed="${edition === "shangdi" ? "true" : "false"}">上帝版</button>
    </div>
    ${day.focus ? `<p class="focus">今日情感焦點：${esc(day.focus)}</p>` : ""}
    ${passageHtml(text)}
    <button type="button" class="btn" data-action="next">讀完了，再看看感受</button>
  </div>`;
}

function renderReflect(day) {
  const entry = dayState(app.state, day.day);
  const nextLabel = day.review ? (day.review.scope === "season" ? "看看整段將臨期" : "看看這一週") : "去祈禱";
  return `<div class="card">
    <h2>反思</h2>
    <p>兩個問題都可以只在心裏回答。想寫下來，也只留在這部裝置。</p>
    <label class="field">
      <span>${esc(day.reflect1)}</span>
      <textarea rows="3" maxlength="2000" autocomplete="off" data-field="reflect1" placeholder="可留空">${esc(entry.reflect1 || "")}</textarea>
    </label>
    <label class="field">
      <span>${esc(day.reflect2)}</span>
      <textarea rows="3" maxlength="2000" autocomplete="off" data-field="reflect2" placeholder="可留空">${esc(entry.reflect2 || "")}</textarea>
    </label>
    <button type="button" class="btn" data-action="next">${esc(nextLabel)}</button>
  </div>`;
}

function renderPrayer(day, entry) {
  if (app.thanksDay === day.day) {
    const closing = day.day === 27
      ? "將臨期的二十七日到這裏。願你帶着記在心裏的事，繼續走路。"
      : "今日到這裏就可以。願你帶着這些感受，繼續走路。";
    return `<div class="card thanks">
      <h2>完成了</h2>
      <p>${esc(closing)}</p>
      <a class="btn" href="#/plan">返回 27 日計劃</a>
      <a class="btn ghost" href="#/">回到首頁</a>
    </div>`;
  }
  return `<div class="card">
    <h2>祈禱</h2>
    <p>下面是一段示範。你可以用自己的話，對神說你真正想說的。</p>
    <div class="prayer">${paragraphsHtml(day.samplePrayer)}</div>
    <button type="button" class="btn" data-action="complete">${entry.completed ? "再次儲存" : "完成今日讀經"}</button>
  </div>`;
}

function renderDay(day, requestedStep, today, phase) {
  const entry = dayState(app.state, day.day);
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
  else if (stepId === "after") body = entry.after ? renderComparison(entry) : renderPicker("after", entry);
  else if (stepId === "reflect") body = renderReflect(day);
  else if (stepId === "review") body = renderReview(day);
  else body = renderPrayer(day, entry);
  const showBack = stepId !== "quiet" && app.thanksDay !== day.day;
  setTitle(`第${day.day}日 ${day.title}`);
  main.dataset.day = String(day.day);
  main.dataset.step = stepId;
  main.innerHTML = `<article class="day">
    ${careBanner(today)}
    <p class="kicker">第 ${day.day} 日 · ${esc(formatFullDate(day.date, day.weekday))}${day.kind && day.kind !== "經文" ? ` · ${esc(day.kind)}` : ""}</p>
    <h1>${esc(day.title)}</h1>
    <p class="ref">${esc(day.reference)}</p>
    ${candleFigure(day.week, `${esc(day.weekLabel)} · ${esc(day.weekTheme)}`)}
    ${future ? `<p class="future">這一日還沒有到。你仍可以先看，不會被鎖上。</p>` : ""}
    ${renderSteps(day, entry, stepId)}
    ${body}
    ${showBack ? `<button type="button" class="btn ghost back" data-action="back">上一步</button>` : ""}
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
          const done = entry?.completed ? `<span class="done">已完成</span>` : "";
          const mood = miniDots(entry);
          const review = day.review ? `<span class="tag">${day.review.scope === "season" ? "總回顧" : "一週回顧"}</span>` : "";
          return `<a class="day-link" href="#/day/${day.day}">
            <span class="meta">${esc(formatMonthDay(day.date))} · ${esc(day.weekday)} ${done}${review}</span>
            <span class="name">${esc(day.title)}</span>
            <span class="passage-ref">${esc(day.reference)}${mood}</span>
          </a>`;
        })
        .join("");
      return `<section class="week-block">
        <div class="week-head">
          <img src="./assets/candles_week${week.week}.svg" alt="" width="120" height="74">
          <div>
            <h2>${esc(week.label)}</h2>
            <p>${esc(week.theme)}</p>
            <p class="muted">${esc(formatMonthDay(week.start))} – ${esc(formatMonthDay(week.end))}</p>
          </div>
        </div>
        ${items}
      </section>`;
    })
    .join("");
  const lead = asHome
    ? `<p class="lead">將臨期的 27 日已經走完。你可以從任何一日再讀。感受仍然只留在這部裝置。</p>`
    : `<p class="lead">27 日都可以打開。未到的日子也不會鎖上。</p>`;
  setTitle(asHome ? "整個計劃" : "27 日計劃");
  delete main.dataset.day;
  delete main.dataset.step;
  main.innerHTML = `<article>
    ${careBanner(today)}
    <p class="kicker">將臨期情感讀經</p>
    <h1>${phase === "after" && asHome ? "27 日都在這裏" : "27 日計劃"}</h1>
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
  setTitle("將臨期情感讀經");
  delete main.dataset.day;
  delete main.dataset.step;
  main.innerHTML = `<article class="home">
    <p class="kicker">香港時間 · ${esc(formatFullDate(start, startDay.weekday))} 開始</p>
    <h1>將臨期<br>情感讀經</h1>
    ${candleFigure(0, "將臨期尚未開始")}
    <p class="countdown"><span class="num">${left}</span><span>日後開始</span></p>
    <p class="lead">${esc(formatFullDate(start, startDay.weekday))}至${esc(formatFullDate(end, endDay.weekday))}。一共 27 日，每日約 13 分鐘：安靜、留意感受、讀經、反思、祈禱。</p>
    <ol class="week-preview">${cards}</ol>
    <a class="btn" href="#/plan">看看 27 日計劃</a>
    <p class="footnote">感受、筆記和反思只留在這部裝置。</p>
  </article>`;
}

function renderAbout(today) {
  const edition = app.state.edition === "shangdi" ? "shangdi" : "shen";
  const share = app.state.shareFeelings === true;
  const contact = String(siteConfig().churchContact || "").trim();
  const stats = statsEnabled()
    ? `<p>教會開了不使用 cookie 的匿名計數（GoatCounter）。它只計算兩件事：有人打開某個頁面，以及有人按下「完成今日讀經」。這些數字看不到你是誰，也沒有你寫下的字。</p>`
    : `<p>這個版本沒有填上統計代碼，所以不會載入任何統計程式，也不會送出使用次數。</p>`;
  setTitle("關於");
  delete main.dataset.day;
  delete main.dataset.step;
  main.innerHTML = `<article class="about">
    ${careBanner(today)}
    <p class="kicker">關於</p>
    <h1>這個計劃</h1>
    <div class="card">
      <p>將臨期情感讀經是 27 日的同行。每日大約 13 分鐘：先安靜，留意讀經前的感受，慢慢讀一段經文，再留意讀經後的感受，然後反思和祈禱。日期按香港時間計算。</p>
      <p>感受沒有好壞。讀經前後可以不同，也可以一樣。</p>
    </div>
    <div class="card">
      <h2>經文版本</h2>
      <p>和合本修訂版有「神」和「上帝」兩個用字，經文內容相同，只是對神的稱呼不同。這裏預設是神版，你可以隨時切換，選擇會記在這部裝置。</p>
      <div class="segmented" role="group" aria-label="經文版本">
        <button type="button" data-action="set-edition" data-edition="shen" aria-pressed="${edition === "shen" ? "true" : "false"}">神版</button>
        <button type="button" data-action="set-edition" data-edition="shangdi" aria-pressed="${edition === "shangdi" ? "true" : "false"}">上帝版</button>
      </div>
      <p class="copyright">${esc(SCRIPTURE_COPYRIGHT)}</p>
    </div>
    <div class="card">
      <h2>私隱</h2>
      <p>你揀的感受、寫下的「因為……」和反思，都只存在這部裝置的瀏覽器裏。沒有帳號，沒有姓名，這些文字也不會上傳。</p>
      <button type="button" class="btn ghost" data-action="clear-data">清除這部裝置上的紀錄</button>
    </div>
    <div class="card">
      <h2>匿名統計</h2>
      ${stats}
      <label class="toggle">
        <input type="checkbox" data-setting="shareFeelings" ${share ? "checked" : ""}>
        <span>
          <strong>匿名分享我今日嘅感受</strong>
          <small>預設關閉。打開之後，只有在你按下「完成今日讀經」時，才送出該日的日序、讀經前和讀經後的核心情緒、細分感受和強度。不會送出你寫的句子，也沒有任何可以認出你的資料。可以隨時關掉。</small>
        </span>
      </label>
    </div>
    <div class="card">
      <h2>加到主畫面</h2>
      <p>用瀏覽器的分享或選單，選擇「加到主畫面」或「安裝應用程式」。安裝之後，讀過一次的內容可以離線再開。</p>
    </div>
    <div class="card">
      <h2>如果你需要人陪</h2>
      <p>連續幾日感到強烈的悲傷或懼怕時，程式會在畫面上輕輕提醒你找人傾談。${contact ? esc(contact) + "。" : ""}如有即時危險，請致電 999。</p>
    </div>
  </article>`;
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
      setTitle("找不到這一日");
      main.innerHTML = `<article class="card"><h1>找不到這一日</h1><p><a href="#/plan">返回 27 日計劃</a></p></article>`;
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
      label.textContent = reduce ? "吸氣" : "吸氣";
      count.textContent = `第 ${cycle} 次，共 3 次`;
      orb.classList.remove("is-out");
      orb.classList.add("is-in");
      app.breathTimer = setTimeout(() => tick("exhale", cycle), reduce ? 400 : 4000);
      return;
    }
    label.textContent = "呼氣";
    orb.classList.remove("is-in");
    orb.classList.add("is-out");
    app.breathTimer = setTimeout(() => {
      if (gen !== app.breathGen) return;
      if (cycle >= 3) {
        label.textContent = "可以了";
        count.textContent = "三次呼吸已經完成";
        orb.classList.remove("is-out");
        if (next) {
          next.disabled = false;
          next.textContent = "去看看讀經前的感受";
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
    const ok = window.confirm("要清除這部裝置上的感受和筆記嗎？這個動作不能還原。");
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
  app.plan = plan;
  app.feelings = feelings;
  app.wheelSvg = wheelSvg;
  app.state = loadState();
  initStats(siteConfig().goatcounter || "");
  main.addEventListener("click", onClick);
  main.addEventListener("keydown", onKeydown);
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
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

mainInit().catch(() => {
  main.innerHTML = `<article class="card"><h1>未能開啟</h1><p>讀經計劃暫時載入不到。請檢查網絡後再試一次。</p></article>`;
});

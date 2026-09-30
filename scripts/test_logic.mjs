import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  activeStepId,
  addDays,
  anonymousFeelingEvent,
  canOpenStep,
  careHtml,
  careMessage,
  careStreak,
  comparisonNote,
  daysBetween,
  editionGuide,
  SHEN_KEEP_WORDS,
  teamTextEntries,
  addWord,
  fillPrayerFrame,
  flowSteps,
  formatMarkedWords,
  normalizeWords,
  hongKongDate,
  nextStepId,
  passageHtml,
  passageSlots,
  verseScreenLabel,
  resolveWords,
  prayerFrameHtml,
  segmentMode,
  toggleWord,
  wordLabel,
  parseVerses,
  reviewBounds,
  reviewIntensity,
  reviewSummary,
  seasonPhase,
} from "../js/logic.js";
import {
  initDeviceSpeech,
  speakDeviceText,
  deviceSpeechSupported,
  cancelDeviceSpeech,
  pickChineseVoice,
  passageUtterances,
  speakPassage,
  speechPhase,
  pauseSpeech,
  resumeSpeech,
  stopSpeech,
  speechVoiceStatus,
  setSpeechRate,
  speechCursor,
  splitSentences,
} from "../js/speech.js";
import {
  bgmLevel,
  bgmRoute,
  bgmTrack,
  readingWeek,
  resolveBgmTrack,
  readBgmEnabled,
  readBgmVolume,
  writeBgmEnabled,
  writeBgmVolume,
  setBgmEnabled,
  setBgmVolume,
  selectBgmTrack,
  handleBgmGesture,
  duckBgm,
  restoreBgm,
  useBgmDrivers,
  BGM_DUCK_RATIO,
  BGM_DEFAULT_VOLUME,
  BGM_FADE,
  BGM_SRC,
  BGM_WEEKS,
  screenTrackTitle,
} from "../js/bgm.js";
import { withoutMarkLock } from "../js/storage.js";
import {
  statsPolicy,
  statsPathWhitelist,
  statsCountUrl,
  statsTitleFor,
  isAllowedStatsPath,
  isFeelingStatsPath,
  openStatsPath,
  doneStatsPath,
  initStats,
  resetStatsState,
  trackOpen,
  trackComplete,
  trackFeelings,
  useStatsTransport,
} from "../js/stats.js";
import { DEMO_HITS, UNDER_FIVE, shownCount, summarizeStats } from "../js/stats-report.js";

const plan = JSON.parse(readFileSync(new URL("../data/plan.json", import.meta.url), "utf8"));
const feelings = JSON.parse(readFileSync(new URL("../data/feelings.json", import.meta.url), "utf8"));
const config = readFileSync(new URL("../config.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.equal(plan.days.length, 27);
assert.equal(plan.days[0].date, "2026-11-29");
assert.equal(plan.days[26].date, "2026-12-25");
assert.equal(plan.season.timezone, "Asia/Hong_Kong");

for (let index = 0; index < plan.days.length; index += 1) {
  const day = plan.days[index];
  assert.equal(day.day, index + 1);
  if (index > 0) assert.equal(day.date, addDays(plan.days[index - 1].date, 1));
  assert.ok(day.passage.shen.trim(), `day ${day.day} missing 神版`);
  assert.ok(day.passage.shangdi.trim(), `day ${day.day} missing 上帝版`);
  assert.ok(day.openingPrayer && day.samplePrayer && day.reflect1 && day.reflect2);
  const shenVerses = parseVerses(day.passage.shen);
  const godVerses = parseVerses(day.passage.shangdi);
  assert.equal(shenVerses.length, godVerses.length, `verse count day ${day.day}`);
  assert.ok(shenVerses.every((verse) => verse.n));
}

assert.equal(plan.days[1].title, "願你破天而降");
assert.match(plan.days[1].passage.shen, /願你破天而降/);
assert.match(plan.days[1].passage.shen, /還有神能/);
assert.match(plan.days[1].passage.shangdi, /還有上帝能/);
assert.equal(plan.days[4].title, "耶西的殘幹必長出嫩枝");
assert.equal(plan.days[15].title, "撒迦利亞：你的祈禱已經被聽見了");
assert.equal(plan.days[24].title, "伯利恆的以法他");
assert.deepEqual(
  plan.days.filter((day) => day.review).map((day) => [day.day, day.review.scope]),
  [
    [8, "week"],
    [15, "week"],
    [22, "week"],
    [27, "season"],
  ]
);
assert.equal(reviewBounds(plan.days[7]).fromDay, 1);
assert.equal(reviewBounds(plan.days[7]).toDay, 7);
assert.equal(reviewBounds(plan.days[14]).fromDay, 8);
assert.equal(reviewBounds(plan.days[21]).fromDay, 15);
assert.equal(reviewBounds(plan.days[21]).toDay, 21);
assert.deepEqual(reviewBounds(plan.days[26]), { fromDay: 1, toDay: 27, scope: "season" });

const day1 = parseVerses(plan.days[0].passage.shen);
assert.deepEqual(day1.map((verse) => verse.n), ["1", "2", "3", "4", "5", "6", "7", "17", "18", "19"]);
assert.deepEqual(parseVerses(plan.days[8].passage.shen).map((verse) => verse.n), ["3:1", "3:2", "3:3", "3:4", "4:5", "4:6"]);
assert.match(passageHtml("3:1 看哪，我要差遣"), /<sup class="vnum">3:1<\/sup>/);
assert.match(passageHtml("3:1 看哪"), /第3章1節/);
assert.match(passageHtml(""), /尚未放進/);
assert.match(passageHtml("12 起初"), /<sup class="vnum">12<\/sup>/);
assert.match(passageHtml("12 起初"), /第12節/);
assert.doesNotMatch(passageHtml("<script>"), /<script>/);

assert.equal(feelings.cores.length, 6);
assert.ok(feelings.cores.every((core) => core.feelings.length === 6));
assert.deepEqual(feelings.cores.map((core) => core.id), ["joy", "peace", "powerful", "sad", "scared", "mad"]);
assert.equal(feelings.care.consecutiveDays, 3);
assert.equal(feelings.care.minIntensity, 4);
assert.deepEqual(feelings.care.coreIds, ["sad", "scared"]);
assert.match(feelings.care.template, /\{churchContact\}/);
assert.match(config, /churchContact:\s*"歡迎聯絡石守賢傳道"/);
assert.match(config, /goatcounter:\s*"lohasshek"/);
assert.equal(config.includes("statsRequireOptIn"), false);
assert.equal(
  careMessage(feelings.care.template, "歡迎聯絡石守賢傳道"),
  "這幾天你好像背著沉重的感受。你不必獨自承受，可以找牧者或信得過的弟兄姊妹傾談。歡迎聯絡石守賢傳道。如果想找人傾談，也可以致電明愛向晴熱線 18288（24 小時）。"
);
assert.equal(
  careHtml(careMessage(feelings.care.template, "歡迎聯絡石守賢傳道")),
  '這幾天你好像背著沉重的感受。你不必獨自承受，可以找牧者或信得過的弟兄姊妹傾談。歡迎聯絡石守賢傳道。如果想找人傾談，也可以致電明愛向晴熱線 <a href="tel:18288">18288</a>（24 小時）。'
);
assert.equal(careHtml("18288<script>"), '<a href="tel:18288">18288</a>&lt;script&gt;');

assert.equal(hongKongDate(new Date("2026-11-28T15:30:00Z")), "2026-11-28");
assert.equal(hongKongDate(new Date("2026-11-28T16:30:00Z")), "2026-11-29");
assert.equal(hongKongDate(new Date("2026-12-25T15:30:00Z")), "2026-12-25");
assert.equal(hongKongDate(new Date("2026-12-25T16:00:00Z")), "2026-12-26");
assert.equal(seasonPhase("2026-11-28", plan.season.start, plan.season.end), "before");
assert.equal(seasonPhase("2026-11-29", plan.season.start, plan.season.end), "during");
assert.equal(seasonPhase("2026-12-02", plan.season.start, plan.season.end), "during");
assert.equal(seasonPhase("2026-12-25", plan.season.start, plan.season.end), "during");
assert.equal(seasonPhase("2026-12-26", plan.season.start, plan.season.end), "after");
assert.equal(daysBetween("2026-11-28", "2026-11-29"), 1);
assert.equal(daysBetween("2026-09-30", "2026-11-29"), 60);
assert.equal(plan.days.find((day) => day.date === "2026-12-02").day, 4);
assert.equal(plan.days.find((day) => day.date === "2026-12-06").day, 8);
assert.equal(plan.days.find((day) => day.date === "2026-12-25").day, 27);

const heavy = (coreId, intensity) => ({
  before: { coreId, feelingZh: "孤單", feelingEn: "Lonely", intensity, because: "不想被送出" },
  after: null,
});
const care = feelings.care;
const streak = {
  "2026-12-01": heavy("sad", 4),
  "2026-12-02": heavy("scared", 5),
  "2026-12-03": heavy("joy", 5),
};
assert.equal(careStreak(streak, "2026-12-03", care), null);
streak["2026-12-03"] = heavy("sad", 4);
assert.ok(careStreak(streak, "2026-12-03", care));
assert.ok(careStreak(streak, "2026-12-04", care));
assert.equal(careStreak(streak, "2026-12-05", care), null);
streak["2026-12-02"] = heavy("sad", 3);
assert.equal(careStreak(streak, "2026-12-03", care), null);

const event = anonymousFeelingEvent(
  3,
  { coreId: "sad", feelingEn: "Lonely", intensity: 4, because: "我好驚", feelingZh: "孤單" },
  { coreId: "peace", feelingEn: "Cared for", intensity: 2, because: "有人在", feelingZh: "被關顧" }
);
assert.equal(event.path, "feeling/3/sad/lonely/4/peace/cared_for/2");
assert.equal(event.event, true);
assert.equal(JSON.stringify(event).includes("我好驚"), false);
assert.equal(JSON.stringify(event).includes("有人在"), false);
assert.equal(JSON.stringify(event).includes("孤單"), false);
assert.equal(JSON.stringify(event).includes("因為"), false);
assert.equal(anonymousFeelingEvent(1, { coreId: "sad" }, { coreId: "joy", feelingEn: "Hopeful", intensity: 1 }), null);
assert.equal(anonymousFeelingEvent(3, { coreId: "悲傷", feelingEn: "孤單", intensity: 4 }, { coreId: "sad", feelingEn: "Lonely", intensity: 2 }), null);
assert.equal(anonymousFeelingEvent(3, { coreId: "sad", feelingEn: "因為我好驚", intensity: 4 }, { coreId: "peace", feelingEn: "Content", intensity: 2 }), null);
assert.equal(anonymousFeelingEvent(99, { coreId: "sad", feelingEn: "Lonely", intensity: 4 }, { coreId: "peace", feelingEn: "Content", intensity: 2 }), null);

for (const note of [comparisonNote(
  { coreId: "sad", feelingZh: "孤單", intensity: 4 },
  { coreId: "peace", feelingZh: "沉靜", intensity: 2 }
), reviewSummary([{ id: "sad", zh: "悲傷", n: 2 }], [{ id: "peace", zh: "平安", n: 2 }])]) {
  assert.doesNotMatch(note, /更好|更差|退步|進步/);
}

const plain = { review: null, day: 1 };
const reviewDay = plan.days[7];
assert.deepEqual(flowSteps(plain).map((step) => step.id), ["quiet", "before", "read", "reflect", "after", "prayer"]);
assert.deepEqual(flowSteps(reviewDay).map((step) => step.id), ["quiet", "before", "read", "reflect", "after", "review", "prayer"]);
assert.equal(flowSteps(plan.days[26]).find((step) => step.id === "review").label, "總回顧");
const entry = { reached: "quiet", completed: false };
assert.equal(canOpenStep(reviewDay, entry, "read"), false);
assert.equal(activeStepId(reviewDay, entry, "prayer"), "quiet");
entry.reached = "after";
assert.equal(nextStepId(plain, "read"), "reflect");
assert.equal(nextStepId(plain, "reflect"), "after");
assert.equal(nextStepId(plain, "after"), "prayer");
assert.equal(nextStepId(reviewDay, "after"), "review");
assert.equal(activeStepId(reviewDay, entry, "read"), "read");
entry.completed = true;
assert.equal(activeStepId(reviewDay, entry, "review"), "review");

const copyright = "經文引自《和合本2010（和合本修訂版）》，版權屬香港聖經公會所有，蒙允准使用。";
assert.ok(config.includes(`scriptureCopyright: "${copyright}"`));
assert.equal(config.includes("經文取自"), false);
assert.equal(appSource.includes("經文取自"), false);
assert.equal(pickChineseVoice([{ lang: "zh-CN", name: "Mandarin" }, { lang: "zh-TW", name: "Taiwan" }, { lang: "zh-HK", name: "Cantonese" }]).name, "Cantonese");
assert.equal(pickChineseVoice([{ lang: "en-US", name: "Alex" }, { lang: "zh-CN", name: "Mandarin" }]).name, "Mandarin");
assert.equal(pickChineseVoice([{ lang: "zh-TW", name: "Taiwan" }, { lang: "zh-CN", name: "Mandarin" }]).name, "Taiwan");
assert.equal(pickChineseVoice([{ lang: "en-US", name: "Alex" }]), null);
assert.equal(verseScreenLabel("5", "你以眼淚當食物給他們吃"), "第5節，你以眼淚當食物給他們吃");
assert.equal(verseScreenLabel("80:5", "你以眼淚"), "第80章5節，你以眼淚");
const calls = [];
let last = null;
const synth = {
  getVoices() {
    return [
      { lang: "zh-CN", name: "Mandarin" },
      { lang: "zh-HK", name: "Cantonese" },
    ];
  },
  createUtterance(text) {
    return { text, rate: 1, lang: "", voice: null, onstart: null, onend: null, onerror: null };
  },
  speak(utter) {
    calls.push(utter.text);
    last = utter;
    assert.equal(utter.voice.name, "Cantonese");
    utter.onstart?.();
  },
  cancel() {
    calls.push("cancel");
  },
  pause() {
    calls.push("native-pause");
  },
  resume() {
    calls.push("native-resume");
  },
  addEventListener() {},
};
assert.equal(initDeviceSpeech(synth), true);
assert.equal(deviceSpeechSupported(), true);
assert.equal(speechVoiceStatus(), "ready");
const spokenLines = passageUtterances("詩篇 80:5", "5 你以眼淚當食物給他們吃。\n6 神使他們。");
assert.deepEqual(spokenLines.map((line) => line.text), ["詩篇 80:5", "第5節，你以眼淚當食物給他們吃。", "第6節，神使他們。"]);
assert.deepEqual(spokenLines.map((line) => line.verse), ["", "5", "6"]);
assert.deepEqual(splitSentences("甲。乙！丙？丁；戊"), ["甲。", "乙！", "丙？", "丁；", "戊"]);
const multi = passageUtterances("以賽亞", "1 甲。乙！");
assert.deepEqual(multi.map((line) => line.text), ["以賽亞", "第1節，甲。", "乙！"]);
assert.deepEqual(multi.map((line) => line.verse), ["", "1", "1"]);
assert.equal(speakPassage(spokenLines), true);
assert.equal(calls[0], spokenLines[0].text);
assert.equal(speechPhase(), "playing");
assert.equal(speechCursor().index, 0);
last.onend();
assert.equal(calls.at(-1), spokenLines[1].text);
assert.equal(speechCursor().verse, "5");
pauseSpeech();
assert.equal(speechPhase(), "paused");
assert.equal(calls.at(-1), "cancel");
assert.equal(speechCursor().index, 1);
resumeSpeech();
assert.equal(speechPhase(), "playing");
assert.equal(calls.at(-1), spokenLines[1].text);
assert.equal(last.rate, 1);
setSpeechRate(0.75);
assert.equal(calls.at(-1), spokenLines[1].text);
assert.equal(last.rate, 0.75);
assert.equal(speechCursor().index, 1);
pauseSpeech();
setSpeechRate(1.25);
assert.equal(speechPhase(), "paused");
assert.equal(calls.at(-1), "cancel");
resumeSpeech();
assert.equal(last.text, spokenLines[1].text);
assert.equal(last.rate, 1.25);
stopSpeech();
assert.equal(speechPhase(), "idle");
assert.equal(speechCursor(), null);
assert.equal(speakPassage(spokenLines), true);
assert.equal(calls.at(-1), spokenLines[0].text);
assert.equal(calls.includes("native-pause"), false);
assert.equal(calls.includes("native-resume"), false);
cancelDeviceSpeech();
assert.equal(speechPhase(), "idle");
assert.equal(speakDeviceText("主啊"), true);
cancelDeviceSpeech();
assert.equal(speechPhase(), "idle");
assert.equal(initDeviceSpeech(null), false);
assert.equal(deviceSpeechSupported(), false);
assert.equal(speakDeviceText("主啊"), false);
assert.equal(cancelDeviceSpeech(), undefined);
const speechSource = readFileSync(new URL("../js/speech.js", import.meta.url), "utf8");
const bgmSource = readFileSync(new URL("../js/bgm.js", import.meta.url), "utf8");
const credits = readFileSync(new URL("../CREDITS", import.meta.url), "utf8");
assert.ok(appSource.includes("initDeviceSpeech"));
assert.ok(appSource.includes("speakPassage"));
assert.ok(appSource.includes("duckBgm()"));
assert.ok(appSource.includes('aria-live="polite"'));
assert.ok(appSource.includes('aria-live="assertive"'));
assert.equal(appSource.includes("speechSynthesis.speak"), false);
assert.equal(appSource.includes("new Audio"), false);
assert.match(speechSource, /粵語/);
assert.match(speechSource, /voiceschanged/);
assert.match(speechSource, /engine\.speak\(utter\)/);
assert.equal(speechSource.includes(".pause("), false);
assert.equal(speechSource.includes(".resume("), false);
assert.match(speechSource, /。！？；/);
assert.match(bgmSource, /new Ctor\(\)/);
assert.match(bgmSource, /createMediaElementSource/);
assert.match(bgmSource, /setTargetAtTime/);
assert.match(bgmSource, /crossOrigin = "anonymous"/);
assert.match(bgmSource, /webkitAudioContext/);
assert.match(bgmSource, /addEventListener\("pointerup"/);
assert.match(bgmSource, /keydown/);
assert.match(bgmSource, /touchend/);
assert.doesNotMatch(bgmSource, /addEventListener\("pointerdown"/);
assert.equal(BGM_DEFAULT_VOLUME, 0.2);
assert.equal(BGM_DUCK_RATIO, 0.25);
assert.equal(bgmLevel(true), 0.05);
assert.equal(bgmLevel(false), 0.2);
assert.equal(bgmLevel(true, 0.4), 0.1);
assert.equal(bgmLevel(false, 0.4), 0.4);
const memory = { store: {}, getItem(key) { return this.store[key] ?? null; }, setItem(key, value) { this.store[key] = String(value); } };
assert.equal(readBgmEnabled(memory), true);
assert.equal(readBgmVolume(memory), 0.2);
writeBgmEnabled(false, memory);
assert.equal(readBgmEnabled(memory), false);
writeBgmEnabled(true, memory);
assert.equal(readBgmEnabled(memory), true);
writeBgmVolume(0.4, memory);
assert.equal(readBgmVolume(memory), 0.4);
const season = plan.season;
const pickTrack = (search, date) => resolveBgmTrack(search, date, plan.days, season);
assert.equal(readingWeek("2026-11-01", plan.days, season), 1);
assert.equal(readingWeek("2026-11-29", plan.days, season), 1);
assert.equal(readingWeek("2026-12-05", plan.days, season), 1);
assert.equal(readingWeek("2026-12-06", plan.days, season), 2);
assert.equal(readingWeek("2026-12-12", plan.days, season), 2);
assert.equal(readingWeek("2026-12-13", plan.days, season), 3);
assert.equal(readingWeek("2026-12-19", plan.days, season), 3);
assert.equal(readingWeek("2026-12-20", plan.days, season), 4);
assert.equal(readingWeek("2026-12-25", plan.days, season), 4);
assert.equal(readingWeek("2026-12-26", plan.days, season), 4);
assert.equal(pickTrack("", "2026-11-29").id, "w1-a");
assert.equal(pickTrack("", "2026-11-29").src, BGM_SRC);
assert.equal(pickTrack("?bgm=b", "2026-11-29").id, "w1-b");
assert.equal(pickTrack("?week=2", "2026-11-29").id, "w2-a");
assert.equal(pickTrack("?week=2&bgm=b", "2026-11-01").id, "w2-b");
assert.equal(pickTrack("?week=3&bgm=a", "2026-12-25").week, 3);
assert.equal(pickTrack("?bgm=b", "2026-12-15").id, "w3-a");
assert.equal(pickTrack("?bgm=b", "2026-12-15").src, BGM_WEEKS[3].a.src);
assert.equal(pickTrack("?bgm=b", "2026-12-24").id, "w4");
assert.equal(pickTrack("?bgm=old", "2026-12-24").id, "w4");
assert.equal(pickTrack("?bgm=old", "2026-12-24").src, BGM_WEEKS[4].a.src);
assert.equal(pickTrack("?bgm=nope", "2026-12-08").slot, "a");
assert.equal(pickTrack("?week=9", "2026-12-08").week, 2);
assert.equal(BGM_WEEKS[1].a.title, "07 Worms Cathedral organ practice.wav");
assert.equal(screenTrackTitle(BGM_WEEKS[1].a.title), "Worms Cathedral organ practice");
assert.equal(screenTrackTitle(BGM_WEEKS[2].a.title), "Upright piano loop");
assert.equal(screenTrackTitle("Harmonium Drone2"), "Harmonium Drone2");
assert.equal(BGM_WEEKS[1].b.title, "Harmonium Drone2");
assert.equal(BGM_WEEKS[4].a.creditAuthor, "Kevin MacLeod（incompetech.com）");
assert.equal(BGM_WEEKS[4].a.edited, true);
assert.equal(BGM_WEEKS[2].a.author, "stixthule");
assert.equal(BGM_WEEKS[2].b.author, "Jadis0x");
assert.equal(BGM_WEEKS[3].b, undefined);
assert.equal(BGM_WEEKS[4].b, undefined);
assert.equal(BGM_WEEKS[4].a.license, "https://creativecommons.org/licenses/by/3.0/");
assert.equal(BGM_WEEKS[4].a.licenseName, "CC BY 3.0");
assert.equal(BGM_WEEKS[4].a.licenseLabel, "CC BY 3.0");
assert.equal(BGM_WEEKS[1].a.source.includes("869196"), false);
assert.equal(BGM_WEEKS[1].b.source.includes("818034"), false);
assert.equal(bgmTrack().id, "w1-a");
for (const week of [1, 2, 3, 4]) {
  for (const slot of ["a", "b"]) {
    const item = BGM_WEEKS[week][slot];
    if (!item) continue;
    assert.match(credits, new RegExp(item.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(credits, new RegExp(item.source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(item.licenseName, week === 4 ? "CC BY 3.0" : "CC0 1.0");
  }
}
assert.equal(credits.includes("已轉換"), false);
assert.equal(credits.includes("播過的檔案"), false);
assert.match(credits, /音樂：Silent Night，Kevin MacLeod（incompetech\.com）。已剪輯。來源頁 CC BY 3\.0/);
assert.match(credits, /音樂：07 Worms Cathedral organ practice\.wav，blaukreuz。來源頁 CC0 授權/);
assert.match(credits, /音樂：upright_piano_loop_7000924_083bpm\.wav，stixthule。來源頁 CC0 授權/);
const speakingCss = readFileSync(new URL("../css/styles.css", import.meta.url), "utf8");
const speakingRule = speakingCss.slice(speakingCss.indexOf(".verse.is-speaking"), speakingCss.indexOf(".verse-gap"));
assert.match(speakingRule, /background/);
assert.match(speakingRule, /box-shadow/);
assert.equal(/padding|margin/.test(speakingRule), false);
assert.match(speakingCss, /\.verse \{[^}]*padding: 0\.7em 0\.28em 0\.2em 0\.85em;/s);
assert.equal(appSource.includes("speak-note"), false);
assert.equal(appSource.includes("speakMissing"), false);
assert.ok(appSource.includes('speechVoiceStatus() !== "ready"'));
assert.ok(appSource.includes('aria-label="${esc(volumeText)}"'));
assert.match(readFileSync(new URL("../ui-strings.json", import.meta.url), "utf8"), /背景音樂音量 \{percent\}%/);
assert.ok(appSource.includes('class="tick" aria-hidden="true"'));
assert.equal(speakingCss.includes('content: "✓ '), false);
assert.equal(credits.includes("Light Piano Retro Loop 110bpm"), false);
assert.equal(credits.includes("?bgm=old"), false);
assert.equal(credits.includes("RokZRooM"), false);
assert.equal(bgmSource.includes("bgm.mp3"), false);
assert.equal(bgmSource.includes("BGM_OLD"), false);
assert.match(credits, /http:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0\//);
assert.match(credits, /CC0/);
assert.match(credits, /\?bgm=b/);
assert.match(credits, /\?week=/);
assert.equal(sw.includes("./assets/bgm/w1-a.mp3"), false);
assert.equal(statsPolicy({ code: "lohasshek" }).usage, true);
assert.equal(statsPolicy({ code: "" }).usage, false);
const summary = summarizeStats(DEMO_HITS);
assert.equal(summary.opens.find((row) => row.key === "2026-11-29").label, "14");
assert.equal(summary.completes.find((row) => row.key === "2026-11-30").label, "3");
assert.equal(summary.cores.find((row) => row.key === "joy").label, "2");
assert.equal(summary.cores.find((row) => row.key === "sad").count, 8);
assert.equal(summary.feelings.find((row) => row.key === "hopeful").label, UNDER_FIVE);
assert.equal(summary.feelings.find((row) => row.key === "lonely").label, "8");
assert.equal(summary.intensities.find((row) => row.key === "3").label, UNDER_FIVE);
assert.equal(summary.intensities.find((row) => row.key === "4").label, "6");
assert.equal(shownCount(4, "feeling"), UNDER_FIVE);
assert.equal(shownCount(4, "core"), "4");
assert.equal(appSource.includes('data-setting="statsOptIn"'), false);
assert.equal(appSource.includes("statsRequireOptIn"), false);
const uiText = readFileSync(new URL("../ui-strings.json", import.meta.url), "utf8");
assert.equal(uiText.includes("我們只計算打開頁面和完成讀經的次數"), false);
assert.equal(uiText.includes("開啟後只會匿名送出日序、感受代號和強度。"), true);
assert.equal(appSource.includes("ui.about.statsOn"), false);
assert.equal(appSource.includes("ui.about.statsOff"), false);
assert.equal(appSource.includes("trackPage"), false);
assert.equal(appSource.includes("location.pathname"), false);
assert.equal(appSource.includes("location.href"), false);
const statsSource = readFileSync(new URL("../js/stats.js", import.meta.url), "utf8");
const statsPage = readFileSync(new URL("../js/stats-page.js", import.meta.url), "utf8");
const statsHtml = readFileSync(new URL("../stats.html", import.meta.url), "utf8");
assert.doesNotMatch(statsSource, /location\.(pathname|href|search|hash)/);
assert.doesNotMatch(statsSource, /document\.(title|referrer)/);
assert.doesNotMatch(statsSource, /gc\.zgo\.at|count\.js|localStorage|document\.cookie/);
assert.match(statsSource, /referrerPolicy: "no-referrer"/);
assert.match(statsSource, /credentials: "omit"/);
assert.match(statsHtml, /data-clear/);
assert.match(statsPage, /removeItem\(TOKEN_KEY\)/);
for (const file of [config, appSource, statsSource, statsPage, statsHtml]) {
  assert.equal(/Authorization:\s*Bearer\s+[A-Za-z0-9_-]{8,}/.test(file), false);
}
const whitelist = statsPathWhitelist();
assert.deepEqual(whitelist.opens, ["open"]);
assert.equal(whitelist.done.length, 27);
assert.equal(whitelist.done[4], "day-5-done");
assert.equal(whitelist.feelingTitle, "feeling");
for (const path of [...whitelist.opens, ...whitelist.done]) {
  assert.equal(isAllowedStatsPath(path), true);
  assert.equal(statsTitleFor(path), path);
  assert.equal(isFeelingStatsPath(path), false);
}
assert.equal(isAllowedStatsPath(event.path), true);
assert.equal(statsTitleFor(event.path), "feeling");
for (const blocked of [
  "/about",
  "/day/5",
  "open-day-5?asof=2026-11-29",
  "?week=2&bgm=b",
  "#/about",
  "complete-reading/5",
  "anon-feeling/3/sad/lonely/4/peace/cared_for/2",
  "feeling/3/sad/孤單/4/peace/cared_for/2",
  "feeling/3/sad/lonely/4/peace/cared_for/2/because",
  "feeling/0/sad/lonely/4/peace/cared_for/2",
  "feeling/28/sad/lonely/4/peace/cared_for/2",
  "feeling/3/sad/lonely/6/peace/cared_for/2",
  "open-plan",
  "open-about",
  "open-day-5",
  "open-day-0",
  "open-day-28",
  "day-5-done?asof=1",
]) {
  assert.equal(isAllowedStatsPath(blocked), false, blocked);
}
assert.equal(openStatsPath("home"), "open");
assert.equal(openStatsPath("day", 5), "open");
assert.equal(doneStatsPath(5), "day-5-done");
resetStatsState();
const sent = [];
useStatsTransport((url) => sent.push(url));
initStats("");
assert.equal(trackOpen(), false);
assert.equal(trackComplete(5), false);
assert.equal(trackFeelings(event, true), false);
initStats("lohasshek");
assert.equal(trackOpen("about"), true);
assert.equal(trackOpen("day", 5), false);
assert.equal(trackOpen(), false);
assert.equal(trackFeelings(event, false), false);
assert.equal(trackFeelings({ ...event, because: "因為我好驚", feelingZh: "孤單", title: "因為我好驚" }, true), true);
assert.equal(trackComplete(5), true);
assert.equal(trackComplete(28), false);
const joined = sent.join("\n");
function assertCountQuery(url) {
  const params = new URL(url).searchParams;
  assert.deepEqual([...params.keys()], ["p", "t", "e", "rnd"]);
  assert.match(params.get("rnd"), /^[a-z0-9]+$/);
  assert.equal(params.get("t") === "feeling" || params.get("t") === params.get("p"), true);
}
for (const url of sent) assertCountQuery(url);
assert.equal(new URL(sent[0]).searchParams.get("p"), "open");
assert.equal(new URL(sent[0]).searchParams.get("t"), "open");
assert.equal(new URL(sent[0]).searchParams.get("e"), "false");
assert.equal(sent.filter((url) => new URL(url).searchParams.get("p") === "open").length, 1);
assert.equal(new URL(sent[1]).searchParams.get("t"), "feeling");
assert.equal(new URL(sent[1]).searchParams.get("e"), "true");
assert.equal(new URL(sent[2]).searchParams.get("p"), "day-5-done");
assert.equal(new URL(sent[2]).searchParams.get("t"), "day-5-done");
assert.doesNotMatch(joined, /asof|week|bgm|because|我好驚|孤單|[?&](r|s|q)=/);
assert.equal(joined.includes("location"), false);
const fixed = statsCountUrl("https://lohasshek.goatcounter.com/count", { path: "open", title: "open", event: false }, "abc123");
assert.equal(fixed, "https://lohasshek.goatcounter.com/count?p=open&t=open&e=false&rnd=abc123");
resetStatsState();

function mockAudio() {
  const element = {
    crossOrigin: "",
    loop: false,
    preload: "",
    volume: 1,
    paused: true,
    plays: 0,
    src: "",
    order: [],
    listeners: {},
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
    play() {
      this.paused = false;
      this.plays += 1;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
      this.listeners.pause?.();
    },
  };
  const descriptor = {
    set(value) {
      element.order.push(element.crossOrigin);
      element.srcValue = value;
    },
    get() {
      return element.srcValue || "";
    },
  };
  Object.defineProperty(element, "src", descriptor);
  function AudioMock() {
    return element;
  }
  return { element, AudioMock };
}

function mockContext() {
  const targets = [];
  const instances = [];
  let constructed = 0;
  function AudioContextMock() {
    constructed += 1;
    instances.push(this);
    this.state = "suspended";
    this.currentTime = 4;
    this.destination = { kind: "destination" };
    this.resumes = 0;
    this.element = null;
    this.resume = () => {
      this.resumes += 1;
      this.state = "running";
      return Promise.resolve();
    };
    this.createMediaElementSource = (el) => {
      this.element = el;
      return { connect() {} };
    };
    this.createGain = () => ({
      gain: {
        value: 1,
        cancelScheduledValues() {},
        setValueAtTime() {},
        setTargetAtTime(value, time, constant) {
          targets.push({ value, time, constant });
        },
      },
      connect(dest) {
        this.destinationHit = dest;
      },
    });
  }
  return { AudioContextMock, targets, instances, count: () => constructed };
}

const memoryBgm = { store: {}, getItem(key) { return this.store[key] ?? null; }, setItem(key, value) { this.store[key] = String(value); } };
const gained = mockAudio();
const graph = mockContext();
useBgmDrivers({ Audio: gained.AudioMock, AudioContext: graph.AudioContextMock });
assert.equal(graph.count(), 0);
assert.equal(setBgmEnabled(false, memoryBgm), false);
assert.equal(graph.count(), 0);
assert.equal(setBgmEnabled(true, memoryBgm), true);
assert.equal(graph.count(), 1);
assert.equal(gained.element.crossOrigin, "anonymous");
assert.equal(gained.element.order[0], "anonymous");
assert.equal(gained.element.src, BGM_SRC);
assert.equal(gained.element.loop, true);
assert.equal(bgmRoute(), "gain");
assert.equal(gained.element.volume, 1);
assert.equal(graph.targets.at(-1).value, BGM_DEFAULT_VOLUME);
assert.equal(graph.targets.at(-1).time, 4);
assert.equal(graph.targets.at(-1).constant, BGM_FADE);
duckBgm();
assert.equal(graph.targets.at(-1).value, bgmLevel(true));
assert.equal(gained.element.volume, 1);
assert.equal(gained.element.paused, false);
gained.element.paused = true;
gained.element.listeners.pause();
assert.equal(gained.element.paused, false);
assert.equal(gained.element.plays, 2);
gained.element.paused = true;
restoreBgm();
assert.equal(graph.targets.at(-1).value, BGM_DEFAULT_VOLUME);
assert.equal(gained.element.paused, false);
const playsAfterSpeech = gained.element.plays;
setBgmEnabled(false, memoryBgm);
assert.equal(gained.element.paused, true);
assert.equal(gained.element.plays, playsAfterSpeech);
setBgmEnabled(true, memoryBgm);
assert.equal(graph.count(), 1);

const volumeOnly = mockAudio();
function BrokenContext() {
  throw new Error("no web audio");
}
useBgmDrivers({ Audio: volumeOnly.AudioMock, AudioContext: BrokenContext });
assert.equal(setBgmEnabled(true, memoryBgm), true);
assert.equal(bgmRoute(), "volume");
assert.equal(volumeOnly.element.crossOrigin, "anonymous");
duckBgm();
assert.equal(volumeOnly.element.volume, bgmLevel(true));
restoreBgm();
assert.equal(volumeOnly.element.volume, BGM_DEFAULT_VOLUME);
volumeOnly.element.paused = true;
volumeOnly.element.listeners.pause();
assert.equal(volumeOnly.element.paused, false);

const remembered = { store: {}, getItem(key) { return this.store[key] ?? null; }, setItem(key, value) { this.store[key] = String(value); } };
const rememberedAudio = mockAudio();
const rememberedGraph = mockContext();
useBgmDrivers({ Audio: rememberedAudio.AudioMock, AudioContext: rememberedGraph.AudioContextMock });
assert.equal(handleBgmGesture({ target: { closest() { return null; } } }, remembered), true);
assert.equal(rememberedGraph.count(), 1);
assert.equal(remembered.store["advent2026.bgm"], "on");
assert.equal(rememberedAudio.element.src, BGM_SRC);
assert.equal(handleBgmGesture({ target: { closest() { return null; } } }, remembered), false);
assert.equal(rememberedAudio.element.plays, 1);
writeBgmEnabled(false, remembered);
const offAudio = mockAudio();
const offGraph = mockContext();
useBgmDrivers({ Audio: offAudio.AudioMock, AudioContext: offGraph.AudioContextMock });
assert.equal(handleBgmGesture({ target: { closest() { return null; } } }, remembered), false);
assert.equal(offGraph.count(), 0);
const switchRoot = {
  querySelector(selector) {
    return selector === "[data-setting='bgm']" ? { checked: true } : null;
  },
};
const switchTarget = {
  closest(selector) {
    if (selector === ".toggle") return switchRoot;
    return null;
  },
};
const armed = { store: {}, getItem(key) { return this.store[key] ?? null; }, setItem(key, value) { this.store[key] = String(value); } };
assert.equal(handleBgmGesture({ target: switchTarget }, armed), false);
assert.equal(offGraph.count(), 0);
assert.equal(handleBgmGesture({ target: { closest() { return null; } } }, armed), true);
assert.equal(offGraph.count(), 1);
setBgmVolume(0.4, armed);
assert.equal(readBgmVolume(armed), 0.4);
duckBgm();
assert.equal(offGraph.targets.at(-1).value, 0.1);
restoreBgm();
assert.equal(offGraph.targets.at(-1).value, 0.4);
selectBgmTrack("?bgm=b", "2026-12-06", plan.days, plan.season);
const trackAudio = mockAudio();
const trackGraph = mockContext();
useBgmDrivers({ Audio: trackAudio.AudioMock, AudioContext: trackGraph.AudioContextMock });
selectBgmTrack("?week=2&bgm=b", "2026-11-29", plan.days, plan.season);
assert.equal(setBgmEnabled(true, armed), true);
assert.equal(trackAudio.element.src, BGM_WEEKS[2].b.src);
selectBgmTrack("?bgm=old", "2026-12-06", plan.days, plan.season);
assert.equal(trackAudio.element.src, BGM_WEEKS[2].a.src);
useBgmDrivers({});
const flaky = mockAudio();
const flakyGraph = mockContext();
let rejectPlay = true;
flaky.element.play = function play() {
  this.plays += 1;
  if (rejectPlay) return Promise.reject(new Error("blocked"));
  this.paused = false;
  return Promise.resolve();
};
useBgmDrivers({ Audio: flaky.AudioMock, AudioContext: flakyGraph.AudioContextMock });
const flakyStore = { store: {}, getItem(key) { return this.store[key] ?? null; }, setItem(key, value) { this.store[key] = String(value); } };
const blankTarget = { target: { closest() { return null; } } };
assert.equal(handleBgmGesture(blankTarget, flakyStore), true);
assert.equal(flakyGraph.instances[0].resumes >= 1, true);
assert.equal(flaky.element.paused, true);
assert.equal(handleBgmGesture(blankTarget, flakyStore), true);
assert.equal(flaky.element.plays, 2);
rejectPlay = false;
assert.equal(handleBgmGesture(blankTarget, flakyStore), true);
assert.equal(flaky.element.paused, false);
assert.equal(flaky.element.plays, 3);
assert.equal(handleBgmGesture(blankTarget, flakyStore), false);
assert.equal(flaky.element.plays, 3);
useBgmDrivers({});
assert.match(passageHtml("1 甲\n2 乙\n7 丙"), /verse-gap">……<\/p>/);
assert.doesNotMatch(passageHtml("1 甲\n2 乙"), /verse-gap/);
assert.match(passageHtml("3:4 甲\n4:5 乙"), /verse-gap/);
assert.doesNotMatch(passageHtml("3:4 甲\n4:1 乙"), /verse-gap/);
const sample = "1 耶西的殘幹必長出嫩枝";
const segmented = "1 耶西的｜殘幹｜必｜長出｜嫩枝";
assert.equal(segmentMode(sample, ""), "empty");
assert.equal(segmentMode(sample, "1 耶西的｜殘幹｜必｜長出"), "mismatch");
assert.equal(segmentMode(sample, segmented), "tokens");
const tokenHtml = passageHtml(sample, segmented, ["殘幹"]);
assert.match(tokenHtml, /<sup class="vnum">1<\/sup>/);
assert.match(tokenHtml, /data-word="殘幹"[^>]*aria-pressed="true"/);
assert.match(tokenHtml, /class="token is-on is-run-start is-run-end"[^>]*data-word="殘幹"/);
assert.doesNotMatch(tokenHtml, /role="button"[^>]*>1<\/span>/);
const glued = passageHtml("1 側耳而聽！他說，「嫩枝」。", "1 側耳而｜聽｜！｜他｜說｜，｜「｜嫩枝｜」。", ["嫩枝"]);
assert.match(glued, /class="token-glue"><span class="token"[^>]*data-word="聽"[^>]*>聽<\/span><span class="token-punct">！<\/span>/);
assert.match(glued, /class="token-glue"><span class="token"[^>]*data-word="說"[^>]*>說<\/span><span class="token-punct">，<\/span>/);
assert.match(
  glued,
  /class="token-glue"><span class="token-punct">「<\/span><span class="token is-on[^"]*"[^>]*data-word="嫩枝"[^>]*>嫩枝<\/span><span class="token-punct">」。<\/span>/
);
assert.doesNotMatch(glued, /aria-pressed="true"[^>]*>[^<]*[！，。？、；：」』]/);
assert.doesNotMatch(glued, /data-word="聽"[^>]*>聽！/);
const inlineVerse = passageHtml("來！2 在以法蓮", "來｜！2 ｜在｜以法蓮", []);
assert.match(inlineVerse, /class="token-glue"><span class="token"[^>]*data-word="來"[^>]*>來<\/span><span class="token-punct">！<\/span>/);
assert.match(inlineVerse, /<sup class="vnum">2<\/sup>/);
assert.doesNotMatch(inlineVerse, /data-word="2"/);
assert.doesNotMatch(inlineVerse, /data-word="！"/);
assert.equal(toggleWord([], "，").words.length, 0);
assert.equal(toggleWord([], "2").words.length, 0);
assert.deepEqual(toggleWord([], "看哪").words, ["看哪"]);
assert.deepEqual(toggleWord([], "主上帝").words, ["主上帝"]);
const chain = [
  { text: "甲", joinNext: true },
  { text: "乙", joinNext: true },
  { text: "丙", joinNext: false },
];
let chainWords = toggleWord([], "甲", { slots: chain, slotIndex: 0 }).words;
chainWords = toggleWord(chainWords, "丙", { slots: chain, slotIndex: 2 }).words;
assert.equal(chainWords.length, 2);
assert.deepEqual(chainWords, [
  { verse: "", from: 1, to: 1, shen: "甲", shangdi: "甲" },
  { verse: "", from: 3, to: 3, shen: "丙", shangdi: "丙" },
]);
chainWords = toggleWord(chainWords, "乙", { slots: chain, slotIndex: 1 }).words;
assert.equal(chainWords.length, 1);
assert.deepEqual(chainWords, [{ verse: "", from: 1, to: 3, shen: "甲乙丙", shangdi: "甲乙丙" }]);
assert.equal(formatMarkedWords(chainWords, chain), "「甲乙丙」");
const chainHtml = passageHtml("1 甲乙丙。", "1 ｜甲｜乙｜丙｜。", chainWords);
assert.match(chainHtml, /class="token is-on is-run-start"[^>]*data-word="甲"/);
assert.match(chainHtml, /class="token is-on"[^>]*data-word="乙"/);
assert.doesNotMatch(chainHtml, /class="token[^"]*is-run-(start|end)[^"]*"[^>]*data-word="乙"/);
assert.match(chainHtml, /class="token is-on is-run-end"[^>]*data-word="丙"/);
assert.deepEqual(toggleWord(chainWords, "甲", { slots: chain, slotIndex: 0 }).words, []);
assert.deepEqual(toggleWord(chainWords, "乙", { slots: chain, slotIndex: 1 }).words, []);
assert.deepEqual(toggleWord(chainWords, "丙", { slots: chain, slotIndex: 2 }).words, []);
assert.deepEqual(toggleWord(["甲乙丙"], "甲", { slots: chain, slotIndex: 0 }).words, []);
assert.deepEqual(toggleWord(["甲乙丙"], "丙", { slots: chain, slotIndex: 2 }).words, []);
const punctuated = "1 甲，乙。";
const punctuatedSlots = passageSlots(punctuated, "1 ｜甲｜，｜乙｜。");
assert.equal(punctuatedSlots[0].joinNext, false);
let punctWords = toggleWord([], "甲", { slots: punctuatedSlots, slotIndex: 0 }).words;
punctWords = toggleWord(punctWords, "乙", { slots: punctuatedSlots, slotIndex: 1 }).words;
assert.equal(punctWords.length, 2);
assert.equal(punctWords[0].verse, "1");
assert.equal(punctWords[1].from, punctWords[0].from + 1);
const across = "1 甲乙。\n2 丙。";
const acrossSlots = passageSlots(across, "1 ｜甲｜乙｜。\n2 ｜丙｜。");
assert.equal(acrossSlots.map((slot) => slot.text).join(","), "甲,乙,丙");
assert.equal(acrossSlots[0].joinNext, true);
assert.equal(acrossSlots[1].joinNext, false);
assert.equal(acrossSlots[0].verse, "1");
assert.equal(acrossSlots[2].verse, "2");
let acrossWords = toggleWord([], "乙", { slots: acrossSlots, slotIndex: 1 }).words;
acrossWords = toggleWord(acrossWords, "丙", { slots: acrossSlots, slotIndex: 2 }).words;
assert.equal(acrossWords.length, 2);
assert.equal(acrossWords[0].verse, "1");
assert.equal(acrossWords[1].verse, "2");
const quotaSlots = [
  { text: "一", joinNext: false },
  { text: "二", joinNext: false },
  { text: "三", joinNext: false },
  { text: "四", joinNext: false },
  { text: "五", joinNext: true },
  { text: "六", joinNext: false },
  { text: "七", joinNext: false },
];
let quotaWords = [];
for (let index = 0; index < 5; index += 1) {
  quotaWords = toggleWord(quotaWords, quotaSlots[index].text, { slots: quotaSlots, slotIndex: index }).words;
}
assert.equal(quotaWords.length, 5);
const blocked = toggleWord(quotaWords, "七", { slots: quotaSlots, slotIndex: 6 });
assert.equal(blocked.limited, true);
assert.deepEqual(blocked.words, quotaWords);
const mergedAtLimit = toggleWord(quotaWords, "六", { slots: quotaSlots, slotIndex: 5 });
assert.equal(mergedAtLimit.limited, false);
assert.equal(mergedAtLimit.words.length, 5);
assert.equal(formatMarkedWords(mergedAtLimit.words, quotaSlots), "「一」、「二」、「三」、「四」、「五六」");
assert.deepEqual(normalizeWords(["量出", "滿碗"]), ["量出", "滿碗"]);
assert.equal(formatMarkedWords(["量出", "滿碗"]), "「量出」、「滿碗」");
assert.equal(formatMarkedWords(["量出滿碗"]), "「量出滿碗」");
for (const edition of ["shen", "shangdi"]) {
  const day = plan.days[0];
  const slots = passageSlots(day.passage[edition], day.segments[edition]);
  const liang = slots.findIndex((slot) => slot.text === "量出");
  const bowl = slots.findIndex((slot) => slot.text === "滿碗");
  assert.equal(slots[liang].joinNext, true);
  assert.equal(slots[liang + 1].text, "滿碗");
  assert.equal(slots[liang].verse, "5");
  let marked = toggleWord([], "量出", { slots, slotIndex: liang }).words;
  marked = toggleWord(marked, "滿碗", { slots, slotIndex: bowl }).words;
  assert.equal(marked.length, 1);
  assert.equal(marked[0].verse, "5");
  assert.equal(marked[0].from, slots[liang].index);
  assert.equal(marked[0].to, slots[bowl].index);
  assert.equal(formatMarkedWords(marked, slots), "「量出滿碗」");
  const html = passageHtml(day.passage[edition], day.segments[edition], marked);
  assert.match(html, /data-word="量出"[^>]*aria-pressed="true"/);
  assert.match(html, /data-word="滿碗"[^>]*aria-pressed="true"/);
  assert.match(html, /class="token is-on is-run-start"[^>]*data-word="量出"/);
  assert.match(html, /class="token is-on is-run-end"[^>]*data-word="滿碗"/);
  assert.doesNotMatch(html, /class="token[^"]*is-run-end[^"]*"[^>]*data-word="量出"/);
  assert.doesNotMatch(html, /class="token[^"]*is-run-start[^"]*"[^>]*data-word="滿碗"/);
  assert.doesNotMatch(html, /aria-pressed="true"[^>]*>[^<]*[！，。？、；：」』]/);
  const legacy = passageHtml(day.passage[edition], day.segments[edition], ["量出", "滿碗"]);
  assert.match(legacy, /data-word="量出"[^>]*aria-pressed="true"/);
  assert.match(legacy, /data-word="滿碗"[^>]*aria-pressed="true"/);
  assert.equal(resolveWords(["量出", "滿碗"], slots).length, 1);
  assert.equal(resolveWords(["滿碗", "量出"], slots).length, 1);
  assert.equal(formatMarkedWords(["量出", "滿碗"], slots), "「量出滿碗」");
  assert.equal(formatMarkedWords(["量出滿碗"], slots), "「量出滿碗」");
}
const uiCopy = JSON.parse(readFileSync(new URL("../ui-strings.json", import.meta.url), "utf8"));
assert.match(uiCopy.read.tokenHint, /最多 5 處/);
assert.match(uiCopy.read.selectHint, /最多 5 處/);
assert.equal(uiCopy.words.limit, "最多選 5 處");
assert.equal(uiCopy.read.tokenHint.includes("5 個"), false);
assert.equal(uiCopy.read.selectHint.includes("5 個"), false);
assert.equal(uiCopy.read.markOn, undefined);
assert.equal(uiCopy.read.markOff, undefined);
const bgmCopy = "預設開啟，音量兩成。第一次點按後開始播放。可在頁頂關掉，並會記住。";
assert.equal(uiCopy.bgm.help, bgmCopy);
assert.equal(uiCopy.bgm.aboutBody, bgmCopy);
assert.equal(uiCopy.about.shareHelp, "開啟後只會匿名送出日序、感受代號和強度。");
assert.equal(uiCopy.about.statsOn, undefined);
assert.equal(uiCopy.about.statsOff, undefined);
assert.equal((JSON.stringify(uiCopy.bgm).match(/預設關閉/g) || []).length, 0);
for (const day of plan.days) {
  for (const edition of ["shen", "shangdi"]) {
    assert.equal(
      segmentMode(day.passage[edition], day.segments[edition]),
      "tokens",
      `第 ${day.day} 日 ${edition} 分詞與經文全文不一致`
    );
    const html = passageHtml(day.passage[edition], day.segments[edition], []);
    for (const match of html.matchAll(/data-word="([^"]*)"/g)) {
      assert.match(match[1], /[\u4e00-\u9fff]/, `第 ${day.day} 日 ${edition} 不應點選 ${match[1]}`);
    }
    const words = day.segments[edition]
      .split("｜")
      .map((token) => token.trim())
      .filter((token) => /[\u4e00-\u9fff]/.test(token));
    const single = words.filter((token) => token.length === 1).length;
    assert.ok(words.length > 0 && single < words.length, `第 ${day.day} 日 ${edition} 不應整段退回逐字分詞`);
  }
}
const psalm = plan.days.find((day) => day.reference.startsWith("詩 80"));
assert.equal(psalm.day, 1);
for (const edition of ["shen", "shangdi"]) {
  const tokens = psalm.segments[edition].split("｜");
  assert.equal(tokens.includes("量出"), true, `${edition} 應把「量出」收成一個詞`);
  assert.equal(tokens.includes("滿碗"), true, `${edition} 應把「滿碗」收成一個詞`);
  assert.equal(psalm.segments[edition].includes("量｜出"), false);
  assert.equal(psalm.segments[edition].includes("滿｜碗"), false);
  const marked = passageHtml(psalm.passage[edition], psalm.segments[edition], ["量出", "滿碗"]);
  assert.match(marked, /data-word="量出"[^>]*aria-pressed="true"/);
  assert.match(marked, /data-word="滿碗"[^>]*aria-pressed="true"/);
}
assert.equal(reviewIntensity(4), "4");
assert.equal(reviewIntensity(1), "1");
assert.equal(reviewIntensity(5), "5");
assert.equal(reviewIntensity("2"), "2");
assert.equal(reviewIntensity(0), "");
assert.equal(reviewIntensity(6), "");
assert.equal(reviewIntensity(2.5), "");
assert.equal(reviewIntensity(null), "");
assert.equal(reviewIntensity(undefined), "");
assert.equal(reviewIntensity(""), "");
assert.match(appSource, /reviewIntensity\(pick\.intensity\)/);
assert.match(appSource, /class="feel-level"/);
const countToken = (edition, word) =>
  plan.days.reduce(
    (sum, day) => sum + day.segments[edition].split("｜").filter((token) => token === word).length,
    0
  );
assert.deepEqual(
  plan.days.filter((day) => day.experience).map((day) => day.day),
  [4, 11, 17, 26]
);
assert.equal(plan.days.filter((day) => !day.experience).length, 23);
assert.equal(editionGuide(plan.days[16].experience, "shen"), plan.days[16].experience);
assert.equal(editionGuide(plan.days[16].experience, "shangdi").includes("帶到上帝面前"), true);
assert.equal(editionGuide(plan.days[16].experience, "shangdi").includes("帶到神面前"), false);
assert.equal(editionGuide("主上帝與神", "shangdi"), "主上帝與上帝");
assert.equal(editionGuide("神啊", "shangdi"), "上帝啊");
assert.equal(editionGuide("主神", "shangdi"), "主上帝");
assert.equal(editionGuide("主上帝", "shangdi"), "主上帝");
assert.equal(editionGuide("上帝", "shangdi"), "上帝");
assert.equal(editionGuide("主上帝啊", "shangdi"), "主上帝啊");
assert.equal(editionGuide("主神與上帝", "shangdi"), "主上帝與上帝");
assert.equal(editionGuide("主神與上帝", "shangdi").includes("上上帝"), false);
assert.equal(SHEN_KEEP_WORDS.includes("神奇"), false);
assert.equal(SHEN_KEEP_WORDS.includes("天神"), false);
const keptSentence = "這是神聖的時刻，我把這份安靜交給神。";
assert.equal(editionGuide(keptSentence, "shen"), keptSentence);
assert.equal(editionGuide(keptSentence, "shangdi"), "這是神聖的時刻，我把這份安靜交給上帝。");
for (const word of SHEN_KEEP_WORDS) {
  assert.equal(editionGuide(`請留心${word}，也把神交託`, "shangdi"), `請留心${word}，也把上帝交託`);
}
assert.equal(countToken("shen", "看哪"), 12);
assert.equal(countToken("shangdi", "看哪"), 12);
assert.equal(plan.days.some((day) => day.segments.shen.includes("看｜哪") || day.segments.shangdi.includes("看｜哪")), false);
const day19 = plan.days.find((day) => day.day === 19);
for (const edition of ["shen", "shangdi"]) {
  const tokens = day19.segments[edition].split("｜");
  assert.equal(tokens.filter((token) => token === "懷的胎").length, 2, `${edition} 第 19 日應有兩處「懷的胎」`);
  assert.equal(day19.segments[edition].includes("懷｜的｜胎"), false);
  const slots = passageSlots(day19.passage[edition], day19.segments[edition]);
  const places = slots.filter((slot) => slot.text === "懷的胎");
  assert.deepEqual(
    places.map((slot) => `${slot.verse}:${slot.index}`),
    ["41:7", "42:13"]
  );
  const first = slots.indexOf(places[0]);
  const second = slots.indexOf(places[1]);
  let marked = toggleWord([], "懷的胎", { slots, slotIndex: first }).words;
  assert.equal(marked.length, 1);
  let html = passageHtml(day19.passage[edition], day19.segments[edition], marked);
  assert.deepEqual(
    [...html.matchAll(/data-word="懷的胎"[^>]*aria-pressed="(true|false)"/g)].map((match) => match[1]),
    ["true", "false"]
  );
  marked = toggleWord(marked, "懷的胎", { slots, slotIndex: second }).words;
  assert.equal(marked.length, 2);
  assert.equal(marked[0].verse, "41");
  assert.equal(marked[1].verse, "42");
  html = passageHtml(day19.passage[edition], day19.segments[edition], marked);
  assert.deepEqual(
    [...html.matchAll(/data-word="懷的胎"[^>]*aria-pressed="(true|false)"/g)].map((match) => match[1]),
    ["true", "true"]
  );
  marked = toggleWord(marked, "懷的胎", { slots, slotIndex: first }).words;
  assert.equal(marked.length, 1);
  assert.equal(marked[0].verse, "42");
  assert.deepEqual(resolveWords(["懷的胎"], slots), ["懷的胎"]);
  assert.equal(formatMarkedWords(["懷的胎"], slots), "「懷的胎」");
  assert.doesNotMatch(
    passageHtml(day19.passage[edition], day19.segments[edition], ["懷的胎"]),
    /data-word="懷的胎"[^>]*aria-pressed="true"/
  );
}
const day7 = plan.days.find((day) => day.day === 7);
const shenSlots = passageSlots(day7.passage.shen, day7.segments.shen);
const shangdiSlots = passageSlots(day7.passage.shangdi, day7.segments.shangdi);
const god = shenSlots.find((slot) => slot.verse === "8" && slot.text === "神");
const godWords = [{ verse: "8", from: god.index, to: god.index + 2 }];
assert.equal(shenSlots.find((slot) => slot.verse === "8" && slot.index === god.index + 1).text, "的");
assert.equal(shenSlots.find((slot) => slot.verse === "8" && slot.index === god.index + 2).text, "話");
assert.equal(formatMarkedWords(godWords, shenSlots), "「神的話」");
assert.equal(formatMarkedWords(godWords, shangdiSlots), "「上帝的話」");
let spokenMark = toggleWord([], "神", {
  slots: shenSlots,
  slotIndex: shenSlots.findIndex((slot) => slot.verse === "8" && slot.text === "神"),
  edition: "shen",
  shen: shenSlots,
  shangdi: shangdiSlots,
}).words;
spokenMark = toggleWord(spokenMark, "話", {
  slots: shenSlots,
  slotIndex: shenSlots.findIndex((slot) => slot.verse === "8" && slot.index === god.index + 2),
  edition: "shen",
  shen: shenSlots,
  shangdi: shangdiSlots,
}).words;
spokenMark = toggleWord(spokenMark, "的", {
  slots: shenSlots,
  slotIndex: shenSlots.findIndex((slot) => slot.verse === "8" && slot.index === god.index + 1),
  edition: "shen",
  shen: shenSlots,
  shangdi: shangdiSlots,
}).words;
assert.equal(spokenMark.length, 1);
assert.equal(spokenMark[0].shen, "神的話");
assert.equal(spokenMark[0].shangdi, "上帝的話");
assert.equal(formatMarkedWords(spokenMark, shangdiSlots, "shangdi"), "「上帝的話」");
const shiftedText = "1 別字甲量出滿碗。";
const shiftedSegments = "1 ｜別字｜甲｜量出｜滿碗｜。";
const shiftedSlots = passageSlots(shiftedText, shiftedSegments);
const shiftedMark = [{ verse: "1", from: 1, to: 2, shen: "量出滿碗", shangdi: "量出滿碗" }];
const shifted = resolveWords(shiftedMark, shiftedSlots, "shen");
assert.equal(shifted.length, 1);
assert.equal(shifted[0].from, 3);
assert.equal(shifted[0].to, 4);
assert.equal(wordLabel(shifted[0], shiftedSlots), "量出滿碗");
const shiftedHtml = passageHtml(shiftedText, shiftedSegments, shiftedMark, "shen");
assert.doesNotMatch(shiftedHtml, /data-word="別字"[^>]*aria-pressed="true"/);
assert.doesNotMatch(shiftedHtml, /data-word="甲"[^>]*aria-pressed="true"/);
assert.match(shiftedHtml, /data-word="量出"[^>]*aria-pressed="true"/);
assert.match(shiftedHtml, /data-word="滿碗"[^>]*aria-pressed="true"/);
const repeatedText = "1 別字量出滿碗量出滿碗。";
const repeatedSegments = "1 ｜別字｜量出｜滿碗｜量出｜滿碗｜。";
const repeatedSlots = passageSlots(repeatedText, repeatedSegments);
const repeatedMark = [{ verse: "1", from: 1, to: 1, shen: "量出滿碗", shangdi: "量出滿碗" }];
assert.deepEqual(resolveWords(repeatedMark, repeatedSlots, "shen"), ["量出滿碗"]);
assert.equal(formatMarkedWords(repeatedMark, repeatedSlots, "shen"), "「量出滿碗」");
assert.doesNotMatch(passageHtml(repeatedText, repeatedSegments, repeatedMark, "shen"), /aria-pressed="true"/);
const keptText = "1 量出滿碗，量出滿碗。";
const keptSegments = "1 ｜量出｜滿碗｜，｜量出｜滿碗｜。";
const keptSlots = passageSlots(keptText, keptSegments);
const keptMark = [{ verse: "1", from: 1, to: 2, shen: "量出滿碗", shangdi: "量出滿碗" }];
const kept = resolveWords(keptMark, keptSlots, "shen");
assert.equal(kept.length, 1);
assert.equal(kept[0].from, 1);
assert.equal(kept[0].to, 2);
const keptHtml = passageHtml(keptText, keptSegments, keptMark, "shen");
assert.deepEqual(
  [...keptHtml.matchAll(/data-action="toggle-word"[^>]*data-word="量出"[^>]*aria-pressed="(true|false)"/g)].map((match) => match[1]),
  ["true", "false"]
);
const switched = passageHtml(day7.passage.shangdi, day7.segments.shangdi, godWords);
assert.equal(
  [...switched.matchAll(/data-action="toggle-word"[^>]*data-word="上帝"[^>]*aria-pressed="(true|false)"/g)].filter((match) => match[1] === "true").length,
  1
);
assert.equal(resolveWords(["沒有這個詞"], shenSlots).join(","), "沒有這個詞");
assert.equal(formatMarkedWords(["沒有這個詞"], shenSlots), "「沒有這個詞」");
assert.doesNotThrow(() => passageHtml(day7.passage.shen, day7.segments.shen, ["沒有這個詞", { verse: "8", from: 9, to: 11 }]));
let verseTotal = 0;
for (const day of plan.days) {
  const left = passageSlots(day.passage.shen, day.segments.shen);
  const right = passageSlots(day.passage.shangdi, day.segments.shangdi);
  assert.equal(left.length, right.length, `第 ${day.day} 日兩版本詞數不同`);
  const verses = new Set();
  for (let index = 0; index < left.length; index += 1) {
    assert.equal(left[index].verse, right[index].verse, `第 ${day.day} 日節號不對應`);
    assert.equal(left[index].index, right[index].index, `第 ${day.day} 日詞序不對應`);
    assert.equal(left[index].joinNext, right[index].joinNext, `第 ${day.day} 日相鄰關係不對應`);
    const aligned = left[index].text === right[index].text || left[index].text.replaceAll("神", "上帝") === right[index].text;
    assert.equal(aligned, true, `第 ${day.day} 日第 ${left[index].verse} 節第 ${left[index].index} 詞不是「神」對「上帝」`);
    verses.add(left[index].verse);
  }
  verseTotal += verses.size;
}
assert.equal(verseTotal, 246);
assert.equal(editionGuide(day19.reflect1, "shen"), day19.reflect1);
assert.equal(editionGuide(day19.reflect1, "shangdi").includes("蒙上帝奇妙懷孕"), true);
assert.equal(editionGuide(day19.reflect1, "shangdi").includes("神奇"), false);
const day27 = plan.days.find((day) => day.day === 27);
assert.equal(editionGuide(day27.review.prompt, "shen"), day27.review.prompt);
assert.match(editionGuide(day27.review.prompt, "shangdi"), /哪一天上帝特別親近你/);
assert.equal(editionGuide(day27.review.prompt, "shangdi").includes("天神"), false);
const uiKept = new Set(["read.shen", "about.editionBody"]);
function walkUi(value, path, found) {
  if (typeof value === "string") found.push([path, value]);
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) walkUi(item, path ? `${path}.${key}` : key, found);
  }
}
const uiStrings = [];
walkUi(uiCopy, "", uiStrings);
for (const [path, text] of uiStrings) {
  if (!text.includes("神") || uiKept.has(path)) continue;
  assert.equal(editionGuide(text, "shangdi").includes("神"), false, path);
  assert.equal(editionGuide(text, "shen"), text, path);
}
let keptShen = [];
for (const day of plan.days) {
  for (const [field, raw] of teamTextEntries(day)) {
    assert.equal(editionGuide(raw, "shen"), raw, `第 ${day.day} 日 ${field} 神版應與原文相同`);
    const converted = editionGuide(raw, "shangdi");
    if (converted.includes("神")) keptShen.push(`第 ${day.day} 日 ${field}`);
  }
  assert.equal(editionGuide(day.passage.shen, "shen"), day.passage.shen);
  assert.equal(editionGuide(day.passage.shangdi, "shen"), day.passage.shangdi);
}
assert.deepEqual(keptShen, []);
assert.equal(plan.days[0].passage.shen.includes("神"), true);
assert.equal(appSource.includes("shown(day.passage"), false);
assert.equal(appSource.includes("editionGuide(day.passage"), false);
assert.ok(appSource.includes("shown(day.reflect1)"));
assert.ok(appSource.includes("shown(day.reflect2)"));
assert.ok(appSource.includes("shown(day.samplePrayer)"));
assert.ok(appSource.includes("shown(day.openingPrayer)"));
assert.ok(appSource.includes("shown(ui.prayer.lead)"));
assert.ok(appSource.includes("paragraphsHtml(shown(day.review?.prompt))"));
assert.ok(appSource.includes("shown(item.title)"));
assert.equal(appSource.includes("esc(item.title)"), false);
assert.equal(appSource.includes("esc(day.title)"), false);
const day24 = plan.days.find((day) => day.day === 24);
assert.equal(day24.title, "神為大衛建立家室");
assert.equal(editionGuide(day24.title, "shen"), "神為大衛建立家室");
assert.equal(editionGuide(day24.title, "shangdi"), "上帝為大衛建立家室");
const day18 = plan.days.find((day) => day.day === 18);
assert.equal(day18.segments.shen.split("｜").includes("主神"), true);
assert.equal(day18.segments.shangdi.split("｜").includes("主上帝"), true);
assert.equal(day18.segments.shangdi.includes("主｜上帝"), false);
assert.doesNotMatch(passageHtml(sample, "1 耶西的｜別的"), /toggle-word/);
let marked = [];
for (const word of ["殘幹", "嫩枝", "必", "長出", "耶西的"]) marked = addWord(marked, word).words;
const sixth = addWord(marked, "新枝");
assert.equal(sixth.limited, true);
assert.equal(sixth.words.length, 5);
assert.deepEqual(toggleWord(sixth.words, "殘幹").words.includes("殘幹"), false);
assert.equal(formatMarkedWords(["殘幹", "嫩枝"]), "「殘幹」、「嫩枝」");
const shift = "主啊，讀經前我感到〔讀經前感受〕，讀完經文，我感到〔讀經後感受〕。〔字詞〕提醒我＿＿。無論我的感受怎樣，求你與我同在。奉主耶穌的名，阿們。";
const sameFeeling = fillPrayerFrame(shift, {
  words: ["殘幹", "嫩枝"],
  before: { feelingZh: "平靜", coreZh: "平安" },
  after: { feelingZh: "平靜", coreZh: "平安" },
});
assert.equal(sameFeeling.startsWith("主啊，讀經前後我都感到平靜。「殘幹」、「嫩枝」提醒我＿＿。"), true);
assert.equal(sameFeeling.includes("讀經前我感到"), false);
const changedFeeling = fillPrayerFrame(shift, {
  words: ["殘幹"],
  before: { feelingZh: "", coreZh: "悲傷" },
  after: { feelingZh: "盼望", coreZh: "喜樂" },
});
assert.match(changedFeeling, /讀經前我感到悲傷，讀完經文，我感到盼望。「殘幹」提醒我/);
assert.match(prayerFrameHtml("說：＿＿。"), /class="pray-blank"/);
assert.equal(plan.prayerFrames.map((item) => item.name).join(","), "字詞觸動,感受轉變,交託與回應");
const day1Passage = passageHtml(plan.days[0].passage.shen);
assert.equal((day1Passage.match(/verse-gap/g) || []).length, 1);
assert.ok(readFileSync(new URL("../ui-strings.json", import.meta.url), "utf8").includes("匿名分享我今天的感受"));
assert.ok(readFileSync(new URL("../ui-strings.json", import.meta.url), "utf8").includes("有多強烈？"));
assert.equal(appSource.includes("匿名分享我今日嘅感受"), false);
assert.ok(appSource.includes("scriptureCopyright"));
assert.match(readFileSync(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"), /deploy-pages/);
assert.equal(appSource.includes('data-action="toggle-marking"'), false);
assert.equal(appSource.includes("markOff"), false);
assert.equal(appSource.includes("app.marking"), false);
assert.ok(appSource.includes('data-setting="bgm"'));
assert.ok(appSource.includes('data-setting="bgm-volume"'));
assert.ok(appSource.includes("aria-valuetext"));
assert.ok(appSource.includes("bindBgmGesture"));
assert.ok(appSource.includes('aria-label="${esc(name)}"') || appSource.includes("ui.bgm.status"));
assert.ok(appSource.includes("Escape"));
assert.ok(appSource.includes("pick-feeling"));
assert.ok(appSource.includes("pick-intensity"));
assert.ok(appSource.includes("selectBgmTrack"));
const day1mark = plan.days[0];
const plainVerse = passageHtml(day1mark.passage.shen, day1mark.segments.shen, [], "shen");
const plainTabs = plainVerse.match(/tabindex="0"/g) || [];
const plainVerses = plainVerse.match(/<p class="verse[\s"]/g) || [];
assert.equal(plainTabs.length, plainVerses.length);
assert.match(plainVerse, /class="sr-only">第1節，/);
assert.doesNotMatch(plainVerse, /aria-label=/);
assert.match(plainVerse, /verse-visual" aria-hidden="true"/);
assert.doesNotMatch(plainVerse, /未圈選|已圈選|role="button"/);
const day19Html = passageHtml(day19.passage.shen, day19.segments.shen, [], "shen");
const day19Tabs = (day19Html.match(/tabindex="0"/g) || []).length;
const day19Verses = (day19Html.match(/<p class="verse[\s"]/g) || []).length;
const day19Words = (day19Html.match(/data-word="/g) || []).length;
assert.equal(day19Tabs, day19Verses);
assert.ok(day19Words > day19Tabs);
assert.doesNotMatch(day19Html, /未圈選/);
assert.match(day19Html, /class="sr-only">第/);
assert.doesNotMatch(day19Html, /aria-label=/);
const legacyLocked = withoutMarkLock({ words: ["量出"], locked: true, marking: false, markingLocked: true, wordsLocked: true, markLocked: true, reached: "read" });
assert.equal(legacyLocked.locked, undefined);
assert.equal(legacyLocked.marking, undefined);
assert.equal(legacyLocked.markingLocked, undefined);
assert.deepEqual(legacyLocked.words, ["量出"]);
assert.equal(legacyLocked.reached, "read");
const markSlots = passageSlots(day1mark.passage.shen, day1mark.segments.shen);
const liangAt = markSlots.findIndex((slot) => slot.text === "量出" && slot.verse === "5");
let markWords = toggleWord([], "量出", { slots: markSlots, slotIndex: liangAt }).words;
markWords = toggleWord(markWords, "滿碗", { slots: markSlots, slotIndex: liangAt + 1 }).words;
const markingHtml = passageHtml(day1mark.passage.shen, day1mark.segments.shen, markWords, "shen", { speakingVerse: "5" });
assert.match(markingHtml, /data-word="量出"/);
assert.match(markingHtml, /class="token is-on/);
assert.doesNotMatch(markingHtml, /未圈選|已圈選/);
assert.match(markingHtml, /class="verse is-speaking" data-verse="5"/);
assert.doesNotMatch(markingHtml, /data-verse="6"[^>]*is-speaking|is-speaking[^>]*data-verse="6"/);
const day7speak = plan.days.find((day) => day.day === 7);
const shenSpeak = passageUtterances(day7speak.reference, day7speak.passage.shen).map((line) => line.text).join("\n");
const shangdiSpeak = passageUtterances(day7speak.reference, day7speak.passage.shangdi).map((line) => line.text).join("\n");
assert.match(shenSpeak, /神的話/);
assert.match(shangdiSpeak, /上帝的話/);
assert.equal(shangdiSpeak.includes("神的話"), false);

for (const match of sw.matchAll(/"(\.\/[^"]+)"/g)) {
  const relative = match[1].replace(/^\.\//, "");
  if (!relative) continue;
  readFileSync(new URL(`../${relative}`, import.meta.url));
}

console.log("logic tests passed");

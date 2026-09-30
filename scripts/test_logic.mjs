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
  addWord,
  fillPrayerFrame,
  flowSteps,
  formatMarkedWords,
  normalizeWords,
  hongKongDate,
  nextStepId,
  passageHtml,
  passageSlots,
  prayerFrameHtml,
  segmentMode,
  toggleWord,
  parseVerses,
  reviewBounds,
  reviewIntensity,
  reviewSummary,
  seasonPhase,
} from "../js/logic.js";
import { initDeviceSpeech, speakDeviceText, deviceSpeechSupported, cancelDeviceSpeech } from "../js/speech.js";

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
assert.match(config, /goatcounter:\s*""/);
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
assert.equal(event.path, "anon-feeling/3/sad/lonely/4/peace/cared_for/2");
assert.equal(event.event, true);
assert.equal(JSON.stringify(event).includes("我好驚"), false);
assert.equal(JSON.stringify(event).includes("有人在"), false);
assert.equal(anonymousFeelingEvent(1, { coreId: "sad" }, { coreId: "joy", feelingEn: "Hopeful", intensity: 1 }), null);

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
const spoken = { speak() { throw new Error("不應朗讀"); }, cancel() { throw new Error("不應停止"); } };
assert.equal(initDeviceSpeech(spoken), true);
assert.equal(deviceSpeechSupported(), true);
assert.equal(speakDeviceText("主啊"), false);
assert.equal(cancelDeviceSpeech(), undefined);
assert.equal(initDeviceSpeech(null), false);
assert.equal(deviceSpeechSupported(), false);
assert.ok(appSource.includes("initDeviceSpeech"));
assert.equal(appSource.includes("speechSynthesis.speak"), false);
assert.equal(appSource.includes("new Audio"), false);
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
assert.doesNotMatch(tokenHtml, /role="button"[^>]*>1<\/span>/);
const glued = passageHtml("1 側耳而聽！他說，「嫩枝」。", "1 側耳而｜聽｜！｜他｜說｜，｜「｜嫩枝｜」。", ["嫩枝"]);
assert.match(glued, /class="token-glue"><span role="button"[^>]*data-word="聽"[^>]*>聽<\/span><span class="token-punct">！<\/span>/);
assert.match(glued, /class="token-glue"><span role="button"[^>]*data-word="說"[^>]*>說<\/span><span class="token-punct">，<\/span>/);
assert.match(
  glued,
  /class="token-glue"><span class="token-punct">「<\/span><span role="button"[^>]*data-word="嫩枝"[^>]*aria-pressed="true"[^>]*>嫩枝<\/span><span class="token-punct">」。<\/span>/
);
assert.doesNotMatch(glued, /aria-pressed="true"[^>]*>[^<]*[！，。？、；：」』]/);
assert.doesNotMatch(glued, /data-word="聽"[^>]*>聽！/);
const inlineVerse = passageHtml("來！2 在以法蓮", "來｜！2 ｜在｜以法蓮", []);
assert.match(inlineVerse, /class="token-glue"><span role="button"[^>]*data-word="來"[^>]*>來<\/span><span class="token-punct">！<\/span>/);
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
assert.deepEqual(chainWords, ["甲", "丙"]);
chainWords = toggleWord(chainWords, "乙", { slots: chain, slotIndex: 1 }).words;
assert.deepEqual(chainWords, ["甲乙丙"]);
assert.deepEqual(toggleWord(chainWords, "乙", { slots: chain, slotIndex: 1 }).words, []);
assert.deepEqual(toggleWord(["甲乙丙"], "甲", { slots: chain, slotIndex: 0 }).words, []);
assert.deepEqual(toggleWord(["甲乙丙"], "丙", { slots: chain, slotIndex: 2 }).words, []);
const punctuated = "1 甲，乙。";
const punctuatedSlots = passageSlots(punctuated, "1 ｜甲｜，｜乙｜。");
assert.equal(punctuatedSlots[0].joinNext, false);
let punctWords = toggleWord([], "甲", { slots: punctuatedSlots, slotIndex: 0 }).words;
punctWords = toggleWord(punctWords, "乙", { slots: punctuatedSlots, slotIndex: 1 }).words;
assert.deepEqual(punctWords, ["甲", "乙"]);
const across = "1 甲乙。\n2 丙。";
const acrossSlots = passageSlots(across, "1 ｜甲｜乙｜。\n2 ｜丙｜。");
assert.equal(acrossSlots.map((slot) => slot.text).join(","), "甲,乙,丙");
assert.equal(acrossSlots[0].joinNext, true);
assert.equal(acrossSlots[1].joinNext, false);
let acrossWords = toggleWord([], "乙", { slots: acrossSlots, slotIndex: 1 }).words;
acrossWords = toggleWord(acrossWords, "丙", { slots: acrossSlots, slotIndex: 2 }).words;
assert.deepEqual(acrossWords, ["乙", "丙"]);
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
assert.deepEqual(mergedAtLimit.words, ["一", "二", "三", "四", "五六"]);
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
  let marked = toggleWord([], "量出", { slots, slotIndex: liang }).words;
  marked = toggleWord(marked, "滿碗", { slots, slotIndex: bowl }).words;
  assert.deepEqual(marked, ["量出滿碗"]);
  const html = passageHtml(day.passage[edition], day.segments[edition], marked);
  assert.match(html, /data-word="量出"[^>]*aria-pressed="true"/);
  assert.match(html, /data-word="滿碗"[^>]*aria-pressed="true"/);
  assert.doesNotMatch(html, /aria-pressed="true"[^>]*>[^<]*[！，。？、；：」』]/);
  const legacy = passageHtml(day.passage[edition], day.segments[edition], ["量出", "滿碗"]);
  assert.match(legacy, /data-word="量出"[^>]*aria-pressed="true"/);
  assert.match(legacy, /data-word="滿碗"[^>]*aria-pressed="true"/);
}
const uiCopy = JSON.parse(readFileSync(new URL("../ui-strings.json", import.meta.url), "utf8"));
assert.match(uiCopy.read.tokenHint, /最多 5 處/);
assert.match(uiCopy.read.selectHint, /最多 5 處/);
assert.equal(uiCopy.words.limit, "最多選 5 處");
assert.equal(uiCopy.read.tokenHint.includes("5 個"), false);
assert.equal(uiCopy.read.selectHint.includes("5 個"), false);
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
assert.equal(editionGuide(plan.days[16].experience, "shen").includes("帶到神面前"), true);
assert.equal(editionGuide(plan.days[16].experience, "shangdi").includes("帶到上帝面前"), true);
assert.equal(editionGuide(plan.days[16].experience, "shangdi").includes("帶到神面前"), false);
assert.equal(editionGuide("主上帝與神", "shangdi"), "主上帝與上帝");
assert.equal(countToken("shen", "看哪"), 12);
assert.equal(countToken("shangdi", "看哪"), 12);
assert.equal(plan.days.some((day) => day.segments.shen.includes("看｜哪") || day.segments.shangdi.includes("看｜哪")), false);
const day19 = plan.days.find((day) => day.day === 19);
for (const edition of ["shen", "shangdi"]) {
  const tokens = day19.segments[edition].split("｜");
  assert.equal(tokens.filter((token) => token === "懷的胎").length, 2, `${edition} 第 19 日應有兩處「懷的胎」`);
  assert.equal(day19.segments[edition].includes("懷｜的｜胎"), false);
}
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

for (const match of sw.matchAll(/"(\.\/[^"]+)"/g)) {
  const relative = match[1].replace(/^\.\//, "");
  if (!relative) continue;
  readFileSync(new URL(`../${relative}`, import.meta.url));
}

console.log("logic tests passed");

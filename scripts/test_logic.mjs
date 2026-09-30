import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SCRIPTURE_COPYRIGHT,
  activeStepId,
  addDays,
  anonymousFeelingEvent,
  canOpenStep,
  careMessage,
  careStreak,
  comparisonNote,
  daysBetween,
  flowSteps,
  hongKongDate,
  nextStepId,
  passageHtml,
  parseVerses,
  reviewBounds,
  reviewSummary,
  seasonPhase,
} from "../js/logic.js";

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
  "這幾天你好像背著沉重的感受。你不必獨自承受，可以找牧者或信得過的弟兄姊妹傾談。歡迎聯絡石守賢傳道。如有即時危險，請致電 999。"
);

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
assert.deepEqual(flowSteps(plain).map((step) => step.id), ["quiet", "before", "read", "after", "reflect", "prayer"]);
assert.ok(flowSteps(reviewDay).some((step) => step.id === "review"));
assert.equal(flowSteps(plan.days[26]).find((step) => step.id === "review").label, "總回顧");
const entry = { reached: "quiet", completed: false };
assert.equal(canOpenStep(reviewDay, entry, "read"), false);
assert.equal(activeStepId(reviewDay, entry, "prayer"), "quiet");
entry.reached = "after";
assert.equal(nextStepId(reviewDay, "after"), "reflect");
assert.equal(activeStepId(reviewDay, entry, "read"), "read");
entry.completed = true;
assert.equal(activeStepId(reviewDay, entry, "review"), "review");

assert.equal(SCRIPTURE_COPYRIGHT, "經文取自《聖經．和合本修訂版》，香港聖經公會，蒙允准使用。");
assert.ok(readFileSync(new URL("../ui-strings.json", import.meta.url), "utf8").includes("匿名分享我今天的感受"));
assert.equal(appSource.includes("匿名分享我今日嘅感受"), false);
assert.ok(appSource.includes("SCRIPTURE_COPYRIGHT"));
assert.match(readFileSync(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"), /deploy-pages/);

for (const match of sw.matchAll(/"(\.\/[^"]+)"/g)) {
  const relative = match[1].replace(/^\.\//, "");
  if (!relative) continue;
  readFileSync(new URL(`../${relative}`, import.meta.url));
}

console.log("logic tests passed");

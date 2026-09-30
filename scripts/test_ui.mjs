import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = JSON.parse(readFileSync(new URL("../ui-strings.json", import.meta.url), "utf8"));
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
const plan = readFileSync(new URL("../data/plan.json", import.meta.url), "utf8");
const feelings = readFileSync(new URL("../data/feelings.json", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

function stringsOf(value, found = []) {
  if (typeof value === "string") found.push(value);
  else if (Array.isArray(value)) value.forEach((item) => stringsOf(item, found));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => stringsOf(item, found));
  return found;
}

const copy = stringsOf(ui).filter((line) => line !== ui._note);
const banned = /嘅|揀|咗|唔|佢|今日|\u7740/;
for (const line of copy) {
  assert.equal(banned.test(line), false, line);
}
assert.ok(copy.includes("匿名分享我今天的感受"));
assert.ok(copy.includes("再選一次就好。和剛才不同，或是一樣，都可以。"));
assert.ok(copy.includes("點外面一圈，再選更細緻的感受，然後強度。"));
assert.ok(copy.includes("你選的感受、寫下的「因為……」和反思，都只存在這部裝置的瀏覽器裏。沒有帳號，沒有姓名，這些文字也不會上傳。"));

for (const value of [
  ui.shell.documentTitle,
  ui.shell.description,
  ui.shell.appleTitle,
  ui.shell.brand,
  ui.shell.brandYear,
  ui.shell.loading,
  ui.shell.navLabel,
  ui.shell.navHome,
  ui.shell.navPlan,
  ui.shell.navAbout,
  ui.shell.noscript,
]) {
  assert.ok(html.includes(value), value);
}
assert.equal(manifest.name, ui.pwa.name);
assert.equal(manifest.short_name, ui.pwa.shortName);
assert.equal(manifest.description, ui.pwa.description);

assert.equal(appSource.includes("匿名分享"), false);
assert.equal(appSource.includes("再揀"), false);
assert.equal(appSource.includes("你揀"), false);

for (const file of [plan, feelings]) {
  for (const word of ["着", "有少少", "背着"]) {
    assert.equal(file.includes(word), false, word);
  }
}
assert.ok(feelings.includes("少許"));
assert.ok(feelings.includes("背著"));

console.log("ui tests passed");

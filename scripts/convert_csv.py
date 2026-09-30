#!/usr/bin/env python3
"""Convert the Advent CSV sources (UTF-8 with BOM) into JSON the site reads.

Source files live in content/ and can be replaced when the plan is edited.
Re-run from the repo root:

    python3 scripts/convert_csv.py

Passage text is copied from the CSV only. This script never fetches or
invents scripture. If a passage cell is empty, the JSON stores an empty
string and the site shows a placeholder.
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
DATA = ROOT / "data"
CONFIG = ROOT / "config.js"

WEEK_INDEX = {"第一週": 1, "第二週": 2, "第三週": 3, "第四週": 4}

# Segment ids match emotion_wheel.svg (seg-joy … seg-mad).
CORE_META = {
    "joyful": ("joy", "seg-joy", "#F3D98B"),
    "peaceful": ("peace", "seg-peace", "#BFD8B8"),
    "powerful": ("powerful", "seg-powerful", "#A9C4DE"),
    "sad": ("sad", "seg-sad", "#B8BCC8"),
    "scared": ("scared", "seg-scared", "#C9B8DC"),
    "mad": ("mad", "seg-mad", "#EDB98A"),
}

CORE_ZH_TO_ID = {
    "喜樂": "joy",
    "平安": "peace",
    "有力": "powerful",
    "悲傷": "sad",
    "懼怕": "scared",
    "憤怒": "mad",
}


def find_one(pattern: str) -> Path:
    matches = sorted(CONTENT.glob(pattern))
    if len(matches) != 1:
        raise SystemExit(f"Expected one file matching content/{pattern}, found {matches}")
    return matches[0]


def read_csv(path: Path) -> list[list[str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return [row for row in csv.reader(handle)]


def rows_as_dicts(rows: list[list[str]]) -> list[dict[str, str]]:
    if not rows:
        raise SystemExit("CSV is empty")
    header = [cell.strip() for cell in rows[0]]
    records = []
    for row in rows[1:]:
        if not any(cell.strip() for cell in row):
            continue
        item = {header[i]: (row[i].strip() if i < len(row) else "") for i in range(len(header))}
        records.append(item)
    return records


def pick(row: dict[str, str], *names: str) -> str:
    for name in names:
        if name in row and row[name].strip():
            return row[name].strip()
    return ""


def clean_passage(text: str) -> str:
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.strip() for line in text.split("\n")]
    return "\n".join(line for line in lines if line)


def parse_care(rows: list[list[str]]) -> dict:
    header = ""
    message = ""
    for index, row in enumerate(rows):
        first = row[0].strip() if row else ""
        if first.startswith("關懷提示"):
            header = first
            if index + 1 < len(rows) and rows[index + 1]:
                message = rows[index + 1][0].strip()
            break
    if not message:
        raise SystemExit("Care prompt row not found in the feelings CSV")

    days_match = re.search(r"連續\s*(\d+)\s*日", header)
    level_match = re.search(r"強度\s*(\d+)", header)
    core_ids = [CORE_ZH_TO_ID[zh] for zh in ("悲傷", "懼怕") if zh in header]
    if not core_ids:
        core_ids = ["sad", "scared"]

    contact_match = re.search(r"^(.*?傾談。)(.*?)(如有即時危險，請致電 999。)\s*$", message)
    if not contact_match:
        raise SystemExit(f"Could not split church contact out of care prompt: {message}")
    contact = contact_match.group(2).strip().rstrip("。")
    template = contact_match.group(1) + "{churchContact}" + contact_match.group(3)
    return {
        "consecutiveDays": int(days_match.group(1)) if days_match else 3,
        "minIntensity": int(level_match.group(1)) if level_match else 4,
        "coreIds": core_ids,
        "template": template,
        "contact": contact,
    }


def convert_feelings(path: Path) -> dict:
    rows = read_csv(path)
    header = [cell.strip() for cell in rows[0]]
    try:
        zh_i = header.index("核心情緒")
        en_i = header.index("Core (EN)")
        fine_i = header.index("細分感受")
        fine_en_i = header.index("Feeling (EN)")
        order_i = header.index("序號")
    except ValueError as exc:
        raise SystemExit(f"Feelings CSV is missing a column: {exc}") from exc

    cores: list[dict] = []
    by_zh: dict[str, dict] = {}
    intensities: list[dict] = []
    mode = "feelings"
    for row in rows[1:]:
        if not any(cell.strip() for cell in row):
            continue
        first = row[0].strip()
        if first.startswith("強度"):
            mode = "intensity"
            continue
        if first.startswith("關懷提示"):
            break
        if mode == "feelings":
            zh = row[zh_i].strip()
            en = row[en_i].strip()
            key = en.lower()
            if key not in CORE_META:
                raise SystemExit(f"Unknown core emotion {zh!r} / {en!r}")
            core_id, segment, color = CORE_META[key]
            if zh not in by_zh:
                core = {
                    "id": core_id,
                    "zh": zh,
                    "en": en,
                    "color": color,
                    "segment": segment,
                    "feelings": [],
                }
                by_zh[zh] = core
                cores.append(core)
            by_zh[zh]["feelings"].append(
                {
                    "order": int(row[order_i].strip()),
                    "zh": row[fine_i].strip(),
                    "en": row[fine_en_i].strip(),
                }
            )
        elif mode == "intensity":
            if not first.isdigit():
                continue
            label = row[1].strip() if len(row) > 1 else ""
            intensities.append({"level": int(first), "label": label})

    if len(cores) != 6 or any(len(core["feelings"]) != 6 for core in cores):
        raise SystemExit("Expected 6 core emotions with 6 feelings each")
    if [item["level"] for item in intensities] != [1, 2, 3, 4, 5]:
        raise SystemExit(f"Unexpected intensity scale: {intensities}")

    care = parse_care(rows)
    return {"cores": cores, "intensities": intensities, "care": care}


def convert_plan(scripture_path: Path, guide_path: Path) -> dict:
    scripture = rows_as_dicts(read_csv(scripture_path))
    guide = rows_as_dicts(read_csv(guide_path))
    guide_by_day = {row["日序"]: row for row in guide}
    if len(scripture) != 27 or len(guide_by_day) != 27:
        raise SystemExit(f"Expected 27 days, found scripture={len(scripture)} guide={len(guide_by_day)}")

    days = []
    for row in scripture:
        day_no = row["日序"].strip()
        emo = guide_by_day.get(day_no)
        if emo is None:
            raise SystemExit(f"Day {day_no} is missing from the guidance CSV")
        if emo["日期"] != row["日期"]:
            raise SystemExit(f"Day {day_no} dates differ: {row['日期']} vs {emo['日期']}")

        week_label = row["週次"].strip()
        if week_label not in WEEK_INDEX:
            raise SystemExit(f"Unknown week label {week_label!r}")

        prompt = pick(emo, "一週感受回顧提示")
        review = None
        if prompt:
            scope = "season" if "總回顧" in prompt else "week"
            review = {"scope": scope, "prompt": prompt}

        shen = clean_passage(pick(row, "經文全文（神版）", "經文全文(神版)", "經文全文"))
        shangdi = clean_passage(pick(row, "經文全文（上帝版）", "經文全文(上帝版)"))
        for label, text in (("神版", shen), ("上帝版", shangdi)):
            for line in text.split("\n") if text else []:
                if not re.match(r"^\d+(?::\d+)?\s+\S", line):
                    raise SystemExit(f"Day {day_no} {label} has a line that is not a numbered verse: {line!r}")

        days.append(
            {
                "day": int(day_no),
                "date": row["日期"].strip(),
                "weekday": row["星期"].strip(),
                "week": WEEK_INDEX[week_label],
                "weekLabel": week_label,
                "weekTheme": row["週主題"].strip(),
                "reference": pick(row, "經文（和合本修訂版）", "經文"),
                "title": row["標題"].strip(),
                "kind": row["類型"].strip(),
                "focus": pick(emo, "情感焦點"),
                "openingPrayer": pick(emo, "開場禱文"),
                "reflect1": pick(emo, "反思一（觀察經文）"),
                "reflect2": pick(emo, "反思二（連繫自己）"),
                "samplePrayer": pick(emo, "示範禱文"),
                "review": review,
                "passage": {"shen": shen, "shangdi": shangdi},
            }
        )

    days.sort(key=lambda item: item["day"])
    start = days[0]["date"]
    if start != "2026-11-29" or days[-1]["date"] != "2026-12-25":
        raise SystemExit(f"Season dates must be 2026-11-29 through 2026-12-25, got {start}..{days[-1]['date']}")
    from datetime import date, timedelta

    cursor = date(2026, 11, 29)
    for item in days:
        if item["date"] != cursor.isoformat():
            raise SystemExit(f"Day {item['day']} date {item['date']} is not consecutive (expected {cursor})")
        if not item["openingPrayer"] or not item["reflect1"] or not item["reflect2"] or not item["samplePrayer"]:
            raise SystemExit(f"Day {item['day']} is missing prayer or reflection text")
        if not item["reference"] or not item["title"]:
            raise SystemExit(f"Day {item['day']} is missing a reference or title")
        cursor += timedelta(days=1)

    review_days = [item["day"] for item in days if item["review"]]
    if review_days != [8, 15, 22, 27]:
        raise SystemExit(f"Unexpected review days: {review_days}")
    if days[26]["review"]["scope"] != "season":
        raise SystemExit("25 Dec should be the whole-season review")

    return {
        "season": {
            "id": "advent-2026",
            "title": "將臨期情感讀經",
            "start": days[0]["date"],
            "end": days[-1]["date"],
            "timezone": "Asia/Hong_Kong",
        },
        "copyright": "經文取自《聖經．和合本修訂版》，香港聖經公會，蒙允准使用。",
        "days": days,
    }


def patch_church_contact(contact: str) -> None:
    if not CONFIG.exists():
        return
    text = CONFIG.read_text(encoding="utf-8")
    pattern = re.compile(r'(churchContact:\s*")([^"]*)(")')
    updated, count = pattern.subn(lambda match: match.group(1) + contact + match.group(3), text, count=1)
    if count != 1:
        raise SystemExit("config.js has no churchContact string to update")
    CONFIG.write_text(updated, encoding="utf-8")


def main() -> None:
    scripture_path = find_one("將臨期每日經文*.csv")
    guide_path = find_one("將臨期每日情感引導*.csv")
    feelings_path = find_one("感受之輪詞彙*.csv")

    plan = convert_plan(scripture_path, guide_path)
    feelings = convert_feelings(feelings_path)
    contact = feelings["care"].pop("contact")

    DATA.mkdir(exist_ok=True)
    (DATA / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (DATA / "feelings.json").write_text(
        json.dumps(feelings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    patch_church_contact(contact)
    print(f"Wrote {len(plan['days'])} days from {scripture_path.name} + {guide_path.name}")
    print(f"Wrote feelings from {feelings_path.name}; church contact: {contact}")


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        sys.exit(0)

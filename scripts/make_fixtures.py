"""Rebuild the test fixtures from the local ESPN cache (.cache/espn, filled by scripts/espn-cache.ts or calibrate.ts).

The fixtures are ESPN's own play text, so they stay out of git (ESPN's terms don't grant redistributing it); the
tests that read them skip, with a console line, where they're missing. Run this once after filling the cache:

  python -X utf8 -I scripts/make_fixtures.py [--cache .cache/espn] [--out test/fixtures]

Writes:
  espn-plays.json            the play rows the Story tests name (PLAYS below), trimmed to the fields Gridiron reads
  espn-game-401872656.json   one whole game (NE @ SEA, 2026), trimmed, for the player tests
Stdlib only.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

# The rows the Story tests read, by game: every kind of event, injuries and returns, glitch scores (TEN @ IND).
PLAYS = {
    "401872656": ["401872656180", "401872656535", "401872656761", "401872656835", "4018726561118", "4018726561540",
                  "4018726561881", "4018726562032", "401872656111", "4018726563810"],
    "401872657": ["4018726573452", "4018726573620"],
    "401872660": ["4018726602704", "4018726604152"],
    "401872661": ["4018726611812", "4018726614523"],
    "401872926": ["4018729263223"],
    "401872938": ["4018729381149"],
    "401872927": ["4018729273630"],
    "401872659": ["401872659257"],
    "401872930": ["4018729303720"],
    "401872955": ["4018729554262"],
    "401872922": ["4018729223282"],
    "401873060": ["4018730602380", "4018730602402", "4018730602516"],
    "401873003": ["4018730032849", "4018730032871", "4018730032893", "4018730032918", "4018730033063", "4018730033284"],
}
WHOLE_GAME = "401872656"


def spot(e: dict | None) -> dict:
    if not e:
        return {}
    out = {k: e[k] for k in ("down", "distance", "yardsToEndzone", "yardLine") if k in e}
    if (e.get("team") or {}).get("id"):
        out["team"] = {"id": e["team"]["id"]}
    return out


def play(p: dict) -> dict:
    out = {
        "id": p["id"],
        "type": {"id": (p.get("type") or {}).get("id", ""), "text": (p.get("type") or {}).get("text", "")},
        "text": p["text"],
        "awayScore": p["awayScore"],
        "homeScore": p["homeScore"],
        "period": {"number": p["period"]["number"]},
        "clock": {"displayValue": p["clock"]["displayValue"]},
    }
    for k in ("scoringPlay", "isPenalty", "isTurnover", "statYardage"):
        if k in p:
            out[k] = p[k]
    out["start"] = spot(p.get("start"))
    out["end"] = spot(p.get("end"))
    return out


def teams(d: dict) -> dict:
    cs = d["header"]["competitions"][0]["competitors"]
    side = {c["homeAway"]: {"id": c["team"]["id"], "abbr": c["team"]["abbreviation"]} for c in cs}
    return {"home": side["home"], "away": side["away"]}


def all_plays(d: dict) -> list[dict]:
    drives = (d.get("drives") or {})
    rows = [p for dr in drives.get("previous") or [] for p in dr.get("plays") or []]
    cur = drives.get("current")
    if cur:
        rows += cur.get("plays") or []
    return rows


def whole_game(d: dict) -> dict:
    comp = d["header"]["competitions"][0]

    def drive(dr: dict) -> dict:
        return {
            "id": dr["id"],
            "team": {"id": dr["team"].get("id"), "abbreviation": dr["team"]["abbreviation"]},
            "start": {"period": {"number": dr["start"]["period"]["number"]}, "yardLine": dr["start"].get("yardLine"),
                      "clock": {"displayValue": (dr["start"].get("clock") or {}).get("displayValue", "")}},
            "end": {"period": {"number": ((dr.get("end") or {}).get("period") or {}).get("number", 0)},
                    "yardLine": (dr.get("end") or {}).get("yardLine")},
            "result": dr.get("result", ""),
            "offensivePlays": dr.get("offensivePlays", 0),
            "yards": dr.get("yards", 0),
            "plays": [play(p) for p in dr.get("plays") or []],
        }

    cats = ("passing", "rushing", "receiving", "defensive", "interceptions", "kicking")
    return {
        "_source": f"ESPN game summary {d['header']['id']}, trimmed to the fields Gridiron reads (scripts/make_fixtures.py)",
        "header": {
            "id": d["header"]["id"],
            "season": d["header"].get("season"),
            "competitions": [{
                "id": comp["id"],
                "date": comp["date"],
                "status": {"period": comp["status"].get("period"), "displayClock": comp["status"].get("displayClock"),
                           "type": {k: comp["status"]["type"][k] for k in ("name", "state", "completed")}},
                "competitors": [{
                    "id": c["id"], "homeAway": c["homeAway"], "score": c.get("score"),
                    "team": {k: c["team"][k] for k in ("id", "abbreviation", "displayName", "color", "alternateColor") if k in c["team"]},
                } for c in comp["competitors"]],
            }],
        },
        "drives": {"previous": [drive(x) for x in (d.get("drives") or {}).get("previous") or []]},
        "boxscore": {"players": [{
            "team": {"id": t["team"]["id"], "abbreviation": t["team"]["abbreviation"], "displayName": t["team"]["abbreviation"]},
            "statistics": [{
                "name": c["name"], "labels": c["labels"],
                "athletes": [{"athlete": {"id": a["athlete"]["id"], "displayName": a["athlete"]["displayName"]}, "stats": a["stats"]}
                             for a in c["athletes"]],
            } for c in t["statistics"] if c["name"] in cats],
        } for t in d["boxscore"]["players"]]},
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(ROOT, ".cache", "espn"))
    ap.add_argument("--out", default=os.path.join(ROOT, "test", "fixtures"))
    a = ap.parse_args()

    def load(gid: str) -> dict:
        path = os.path.join(a.cache, f"summary-{gid}.json")
        if not os.path.exists(path):
            sys.exit(f"missing {path}: fill the ESPN cache first (npx tsx scripts/espn-cache.ts)")
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    games = []
    for gid, ids in PLAYS.items():
        d = load(gid)
        by_id = {p["id"]: p for p in all_plays(d)}
        missing = [i for i in ids if i not in by_id]
        if missing:
            sys.exit(f"game {gid} has no rows {missing} in the cache")
        games.append({"id": gid, **teams(d), "plays": [play(by_id[i]) for i in ids]})
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, "espn-plays.json"), "w", encoding="utf-8") as f:
        json.dump({"source": "ESPN game summaries, 2026 season (play rows trimmed to the fields Gridiron reads)", "games": games}, f, indent=2)
    with open(os.path.join(a.out, f"espn-game-{WHOLE_GAME}.json"), "w", encoding="utf-8") as f:
        json.dump(whole_game(load(WHOLE_GAME)), f, separators=(",", ":"))
    print(f"wrote {sum(len(g['plays']) for g in games)} story rows and game {WHOLE_GAME} to {a.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

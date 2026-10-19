"""Nightly nflverse build: the expected-points table for live EPA, and post-game advanced stats per game.

Reads nflverse play-by-play (CC-BY 4.0) from its GitHub release, writes small JSON the static site serves:
  public/data/ep_table.json        EP by down x distance bucket x yards-to-go, plus its calibration
  public/data/games/<espn id>.json  per-game EPA / success / CPOE / pass rate over expected / top plays
Stdlib only, so a GitHub Action can run it with no installs.

Usage: python -X utf8 -I scripts/nflverse_build.py [--season 2026] [--ep-seasons 2023,2024,2025,2026] [--out public/data]
"""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import math
import os
import sys
import time
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone

PBP_URL = "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.csv.gz"
GAMES_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
DIST_BUCKETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 21]
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".cache")

csv.field_size_limit(10_000_000)


def fetch(url: str, dest: str, max_age_h: float) -> str:
    """Download once per max_age_h hours into the cache; returns the local path."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, dest)
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < max_age_h * 3600:
        return path
    print(f"  downloading {url}", file=sys.stderr)
    req = urllib.request.Request(url, headers={"User-Agent": "gridiron-nflverse-build"})
    with urllib.request.urlopen(req, timeout=120) as r, open(path + ".part", "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    os.replace(path + ".part", path)
    return path


def read_pbp(season: int, max_age_h: float) -> list[dict]:
    path = fetch(PBP_URL.format(season=season), f"pbp_{season}.csv.gz", max_age_h)
    keep = {
        "game_id", "home_team", "away_team", "season_type", "week", "posteam", "defteam", "yardline_100",
        "game_half", "qtr", "down", "time", "ydstogo", "desc", "play_type", "yards_gained", "qb_dropback",
        "air_yards", "yards_after_catch", "td_team", "ep", "epa", "wpa", "touchdown", "safety", "pass", "rush",
        "success", "passer", "passer_id", "complete_pass", "incomplete_pass", "interception", "passing_yards",
        "cpoe", "xpass", "qb_epa", "season", "two_point_attempt",
    }
    rows = []
    with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
        r = csv.reader(f)
        head = next(r)
        idx = [(i, h) for i, h in enumerate(head) if h in keep]
        for row in r:
            rows.append({h: row[i] for i, h in idx})
    print(f"  {season}: {len(rows)} plays", file=sys.stderr)
    return rows


def fnum(s: str) -> float | None:
    if s in ("", "NA", "NaN"):
        return None
    try:
        v = float(s)
    except ValueError:
        return None
    return None if math.isnan(v) else v


def inum(s: str) -> int | None:
    v = fnum(s)
    return None if v is None else int(v)


def dist_bucket(d: int) -> int:
    i = 0
    for k, lo in enumerate(DIST_BUCKETS):
        if d >= lo:
            i = k
    return i


# ---------- EP table ----------

def build_ep_table(plays: list[dict]) -> list[list[list[float]]]:
    """Mean nflfastR EP per (down, distance bucket, yards to go), smoothed along the field."""
    sums = defaultdict(float)
    counts = defaultdict(int)
    for p in plays:
        down, ytg, dist, ep = inum(p["down"]), inum(p["yardline_100"]), inum(p["ydstogo"]), fnum(p["ep"])
        if down is None or ytg is None or dist is None or ep is None or not (1 <= down <= 4) or not (1 <= ytg <= 99):
            continue
        if p["play_type"] in ("", "NA", "kickoff", "extra_point"):
            continue
        key = (down - 1, dist_bucket(max(1, dist)), ytg - 1)
        sums[key] += ep
        counts[key] += 1

    table = []
    for d in range(4):
        dd = []
        for b in range(len(DIST_BUCKETS)):
            row = []
            for y in range(99):
                # Triangular window over nearby yard lines, weighted by sample count; widen until it has data.
                for radius in (3, 6, 12, 25, 99):
                    num = den = 0.0
                    for yy in range(max(0, y - radius), min(99, y + radius + 1)):
                        c = counts.get((d, b, yy), 0)
                        if c:
                            w = c * (radius + 1 - abs(yy - y))
                            num += sums[(d, b, yy)] / c * w
                            den += w
                    if den >= 20 or radius == 99:
                        break
                row.append(round(num / den, 3) if den else None)
            dd.append(row)
        table.append(dd)

    # A distance bucket with no data at all (rare: 4th & 21+ in the red zone) borrows the nearest bucket.
    for d in range(4):
        for b in range(len(DIST_BUCKETS)):
            for y in range(99):
                if table[d][b][y] is None:
                    for off in range(1, len(DIST_BUCKETS)):
                        for bb in (b - off, b + off):
                            if 0 <= bb < len(DIST_BUCKETS) and table[d][bb][y] is not None:
                                table[d][b][y] = table[d][bb][y]
                                break
                        if table[d][b][y] is not None:
                            break
                if table[d][b][y] is None:
                    table[d][b][y] = 0.0
    return table


def ep_of(table, down: int, dist: int, ytg: int) -> float:
    d = min(4, max(1, down)) - 1
    y = min(99, max(1, ytg)) - 1
    return table[d][dist_bucket(max(1, dist))][y]


def is_scrimmage(p: dict) -> bool:
    return (
        p["play_type"] in ("pass", "run")
        and inum(p["down"]) is not None
        and inum(p["ydstogo"]) is not None
        and inum(p["yardline_100"]) is not None
        and fnum(p["epa"]) is not None
        and p["two_point_attempt"] != "1"
    )


def estimate_game(table, plays: list[dict]) -> list[tuple[dict, float]]:
    """The same estimate the live page computes: EP of the next snap's state minus EP before, with scoring cases."""
    out = []
    for i, p in enumerate(plays):
        if not is_scrimmage(p):
            continue
        down, dist, ytg = inum(p["down"]), inum(p["ydstogo"]), inum(p["yardline_100"])
        before = ep_of(table, down, dist, ytg)
        if p["touchdown"] == "1":
            est = (7 if p["td_team"] == p["posteam"] else -7) - before
        elif p["safety"] == "1":
            est = -2 - before
        else:
            nxt = None
            for q in plays[i + 1:]:
                if q["game_half"] != p["game_half"]:
                    break
                if inum(q["down"]) is not None and q["posteam"] not in ("", "NA") and inum(q["yardline_100"]) is not None:
                    nxt = q
                    break
            if nxt is None:
                continue
            e_next = ep_of(table, inum(nxt["down"]), inum(nxt["ydstogo"]), inum(nxt["yardline_100"]))
            est = (e_next if nxt["posteam"] == p["posteam"] else -e_next) - before
        out.append((p, est))
    return out


# ---------- per-game advanced ----------

def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def r3(x):
    return None if x is None else round(x, 3)


def team_block(plays: list[dict], team: str) -> dict:
    mine = [p for p in plays if p["posteam"] == team and (p["pass"] == "1" or p["rush"] == "1") and fnum(p["epa"]) is not None]
    passes = [p for p in mine if p["pass"] == "1"]
    rushes = [p for p in mine if p["rush"] == "1"]
    early = [p for p in mine if inum(p["down"]) in (1, 2)]
    xp = [p for p in mine if fnum(p["xpass"]) is not None]

    def explosive(p):
        y = fnum(p["yards_gained"]) or 0
        return (p["rush"] == "1" and y >= 10) or (p["pass"] == "1" and y >= 20)

    return {
        "abbr": team,
        "plays": len(mine),
        "dropbacks": len(passes),
        "rushes": len(rushes),
        "epa_play": r3(mean(fnum(p["epa"]) for p in mine)),
        "pass_epa": r3(mean(fnum(p["epa"]) for p in passes)),
        "rush_epa": r3(mean(fnum(p["epa"]) for p in rushes)),
        "success": r3(mean(fnum(p["success"]) for p in mine)),
        "pass_success": r3(mean(fnum(p["success"]) for p in passes)),
        "rush_success": r3(mean(fnum(p["success"]) for p in rushes)),
        "early_epa": r3(mean(fnum(p["epa"]) for p in early)),
        "proe": r3(mean((1.0 if p["pass"] == "1" else 0.0) - fnum(p["xpass"]) for p in xp)) if xp else None,
        "explosive_rate": r3(sum(1 for p in mine if explosive(p)) / len(mine)) if mine else None,
    }


def qb_rows(plays: list[dict], home: str) -> list[dict]:
    by = defaultdict(list)
    for p in plays:
        if p["qb_dropback"] == "1" and p["passer_id"] not in ("", "NA") and fnum(p["qb_epa"]) is not None:
            by[(p["posteam"], p["passer_id"], p["passer"])].append(p)
    out = []
    for (team, _pid, name), ps in by.items():
        if len(ps) < 5:
            continue
        atts = [p for p in ps if fnum(p["air_yards"]) is not None and (p["complete_pass"] == "1" or p["incomplete_pass"] == "1" or p["interception"] == "1")]
        comps = [p for p in ps if p["complete_pass"] == "1"]
        pass_yds = sum(fnum(p["passing_yards"]) or 0 for p in comps)
        yac = sum(fnum(p["yards_after_catch"]) or 0 for p in comps)
        out.append({
            "side": "home" if team == home else "away",
            "name": name,
            "dropbacks": len(ps),
            "epa_db": r3(mean(fnum(p["qb_epa"]) for p in ps)),
            "cpoe": r3(mean(fnum(p["cpoe"]) for p in ps)),
            "adot": r3(mean(fnum(p["air_yards"]) for p in atts)),
            "yac_share": r3(yac / pass_yds) if pass_yds > 0 else None,
        })
    out.sort(key=lambda q: -q["dropbacks"])
    return out


def top_plays(plays: list[dict], home: str, key: str, n: int = 5) -> list[dict]:
    cand = [p for p in plays if fnum(p[key]) is not None and p["posteam"] not in ("", "NA") and p["play_type"] not in ("no_play", "", "NA")]
    cand.sort(key=lambda p: -abs(fnum(p[key])))
    out = []
    for p in cand[:n]:
        v = fnum(p[key])
        # WPA is from the possession team's view; flip it so the badge credits whoever gained.
        side = "home" if p["posteam"] == home else "away"
        if v < 0:
            side = "away" if side == "home" else "home"
        out.append({
            "side": side,
            "qtr": inum(p["qtr"]) or 0,
            "clock": p["time"],
            "down": inum(p["down"]),
            "ydstogo": inum(p["ydstogo"]),
            "desc": p["desc"],
            "epa": r3(abs(fnum(p["epa"]) or 0)) if key == "epa" else r3(fnum(p["epa"])),
            "wpa": r3(abs(v)) if key == "wpa" else r3(fnum(p["wpa"])),
        })
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    # Past seasons only: the calibration on this season's games then measures the table on games it never saw.
    ap.add_argument("--ep-seasons", default="2022,2023,2024,2025")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "data"))
    ap.add_argument("--max-age-h", type=float, default=6.0, help="re-download cached files older than this")
    a = ap.parse_args()

    ep_seasons = [int(s) for s in a.ep_seasons.split(",") if s]
    seasons = sorted(set(ep_seasons) | {a.season})
    pbp = {s: read_pbp(s, a.max_age_h) for s in seasons}

    print("building EP table", file=sys.stderr)
    table = build_ep_table([p for s in ep_seasons for p in pbp[s]])

    games_path = fetch(GAMES_URL, "games.csv", a.max_age_h)
    with open(games_path, encoding="utf-8", newline="") as f:
        espn_of = {g["game_id"]: g["espn"] for g in csv.DictReader(f) if g.get("espn") not in (None, "", "NA")}

    by_game = defaultdict(list)
    for p in pbp[a.season]:
        by_game[p["game_id"]].append(p)

    # Calibration on this season's finished games: our estimate vs nflfastR's EPA, per play and per team-game.
    play_err, tg_err, pairs = [], [], []
    games_dir = os.path.join(a.out, "games")
    os.makedirs(games_dir, exist_ok=True)
    built = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    written = 0
    for gid, plays in by_game.items():
        home, away = plays[0]["home_team"], plays[0]["away_team"]
        est = estimate_game(table, plays)
        est_team = {}
        for team in (home, away):
            e = [v for p, v in est if p["posteam"] == team]
            m = [fnum(p["epa"]) for p, _ in est if p["posteam"] == team]
            if e:
                est_team[team] = sum(e) / len(e)
                tg_err.append(abs(est_team[team] - sum(m) / len(m)))
        for p, v in est:
            play_err.append(abs(v - fnum(p["epa"])))
            pairs.append((v, fnum(p["epa"])))

        espn = espn_of.get(gid)
        if not espn:
            continue
        doc = {
            "game_id": gid,
            "espn": espn,
            "built": built,
            "source": f"play_by_play_{a.season}",
            "home": team_block(plays, home),
            "away": team_block(plays, away),
            "qbs": qb_rows(plays, home),
            "top_epa": top_plays(plays, home, "epa"),
            "top_wpa": top_plays(plays, home, "wpa"),
        }
        with open(os.path.join(games_dir, f"{espn}.json"), "w", encoding="utf-8") as f:
            json.dump(doc, f, separators=(",", ":"))
        written += 1

    n = len(pairs)
    corr = None
    if n > 2:
        mx = sum(x for x, _ in pairs) / n
        my = sum(y for _, y in pairs) / n
        sxy = sum((x - mx) * (y - my) for x, y in pairs)
        sxx = sum((x - mx) ** 2 for x, _ in pairs)
        syy = sum((y - my) ** 2 for _, y in pairs)
        corr = sxy / math.sqrt(sxx * syy) if sxx and syy else None
    calibration = {
        "games": len(by_game),
        "plays": n,
        "playMae": r3(mean(play_err)),
        "teamGameMae": r3(mean(tg_err)),
        "corr": r3(corr),
    }
    ep_doc = {
        "version": 1,
        "built": built,
        "seasons": ep_seasons,
        "distBuckets": DIST_BUCKETS,
        "ep": table,
        "calibration": calibration,
    }
    with open(os.path.join(a.out, "ep_table.json"), "w", encoding="utf-8") as f:
        json.dump(ep_doc, f, separators=(",", ":"))
    print(json.dumps({"games_written": written, "calibration": calibration}), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

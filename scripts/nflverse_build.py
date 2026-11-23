"""Nightly nflverse build: the expected-points table for live EPA, and post-game advanced stats per game.

Reads nflverse play-by-play (CC-BY 4.0) from its GitHub release, writes small JSON the static site serves:
  public/data/ep_table.json        EP by down x distance bucket x yards-to-go, plus its calibration
  public/data/games/<espn id>.json  per-game EPA / success / CPOE / pass rate over expected / top plays
  public/data/baselines.json        league averages (this season, the last 3 seasons) and the standouts' weights
Stdlib only, so a GitHub Action can run it with no installs.

Usage: python -X utf8 -I scripts/nflverse_build.py [--season 2026] [--ep-seasons 2022,2023,2024,2025] [--out public/data]
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
        # league averages (baselines.json)
        "fumble_lost", "sack", "qb_scramble", "qb_kneel", "qb_spike", "third_down_converted", "third_down_failed",
        "fixed_drive", "fixed_drive_result", "drive_inside20", "first_down", "penalty_team", "penalty_yards",
        "rusher_player_id", "receiver_player_id", "pass_attempt", "field_goal_result", "kick_distance",
        "extra_point_result", "punt_attempt", "tackled_for_loss", "pass_defense_1_player_id",
        "quarter_seconds_remaining", "posteam_score", "posteam_score_post", "receiving_yards", "rushing_yards",
        "pass_touchdown", "rush_touchdown",
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
    # Snaps from scrimmage only: two-point tries are flagged pass/rush in nflverse but aren't part of a team's EPA/play.
    mine = [p for p in plays if p["posteam"] == team and (p["pass"] == "1" or p["rush"] == "1")
            and fnum(p["epa"]) is not None and p["two_point_attempt"] != "1"]
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
        # EPA/play through the end of Q1, Q2, Q3: what the live estimate should match at those moments.
        "thru_q": [r3(mean(fnum(p["epa"]) for p in mine if (inum(p["qtr"]) or 9) <= q)) for q in (1, 2, 3)],
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


# ---------- league averages (baselines.json) ----------
# What the page compares a game against: the league average this season so far, and over the three completed seasons
# before it. No all-time window: the passing era and rule changes (the 2024 kickoff) make old numbers a different sport.
# Regular-season games only. Rates are pooled (sum over sum) across the window; totals are means per team-game.
# The definitions match the page's own live numbers (src/stats/live.ts, src/stats/players.ts), not nflverse's.

KICKOFF_RULE_SEASON = 2024
# Stats the 2024 kickoff rule moved: left out of any window that reaches back before it, with the reason.
KICKOFF_AFFECTED = {
    "avgStart": "Drive starts moved with the 2024 kickoff rule; this window includes older seasons, so it has no average for them.",
}
# A player-game counts toward its group's average only with this much volume (the page shows the text).
QUALIFIERS = {
    "qb": {"min": 14, "unit": "dropbacks", "text": "quarterbacks with 14+ dropbacks in a game"},
    "rb": {"min": 8, "unit": "carries", "text": "runners with 8+ designed carries in a game"},
    "wr": {"min": 4, "unit": "targets", "text": "receivers and backs with 4+ targets in a game"},
    "k": {"min": 1, "unit": "kicks", "text": "every field goal, extra point and punt"},
}
FG_BUCKETS = [0, 30, 40, 50, 55]  # lower bounds of the field-goal distance bands for make rates


def col(p: dict, k: str) -> str:
    return p.get(k, "")


def is1(p: dict, k: str) -> bool:
    return col(p, k) == "1"


def counted(p: dict) -> bool:
    """A snap the page counts for EPA: a pass or run (a flagged one too), not a kneel, spike or two-point try."""
    return ((is1(p, "pass") or is1(p, "rush")) and inum(col(p, "down")) is not None and fnum(col(p, "epa")) is not None
            and not is1(p, "two_point_attempt") and not is1(p, "qb_kneel") and not is1(p, "qb_spike"))


def stood(p: dict) -> bool:
    """A counted snap that a flag didn't wipe out: what success rate, yards and explosives count."""
    return counted(p) and col(p, "play_type") != "no_play"


def lost_ball(p: dict) -> bool:
    return is1(p, "interception") or is1(p, "fumble_lost")


def rule_success(p: dict) -> bool:
    """The page's 40/60/100 rule (src/espn/model.ts isSuccess), not nflverse's EPA > 0."""
    if lost_ball(p):
        return False
    if is1(p, "touchdown") and col(p, "td_team") == col(p, "posteam"):
        return True
    down = inum(col(p, "down")) or 1
    need = 0.4 if down == 1 else 0.6 if down == 2 else 1.0
    return (fnum(col(p, "yards_gained")) or 0) >= need * (inum(col(p, "ydstogo")) or 0)


def yds(p: dict) -> float:
    return fnum(col(p, "yards_gained")) or 0.0


class Pool:
    """Rates as (numerator, denominator) pairs and totals as per-game lists, summed across a window."""

    def __init__(self):
        self.num = defaultdict(float)
        self.den = defaultdict(float)
        self.tot = defaultdict(list)

    def rate(self, k: str, num: float, den: float):
        self.num[k] += num
        self.den[k] += den

    def total(self, k: str, v: float):
        self.tot[k].append(v)

    def out(self, digits: int = 4) -> dict:
        rates = {k: round(self.num[k] / self.den[k], digits) for k in self.num if self.den[k] > 0}
        totals = {k: round(sum(v) / len(v), 2) for k, v in self.tot.items() if v}
        return {"rates": rates, "totals": totals}


def team_game(pool: Pool, game: list[dict], team: str):
    mine = [p for p in game if col(p, "posteam") == team]
    snaps = [p for p in mine if counted(p)]
    real = [p for p in snaps if stood(p)]
    passes = [p for p in real if is1(p, "pass")]
    pool.rate("successRate", sum(1 for p in real if rule_success(p)), len(real))
    pool.rate("epaPerPlay", sum(fnum(col(p, "epa")) for p in snaps), len(snaps))
    pool.rate("yardsPerPlay", sum(yds(p) for p in real), len(real))
    conv = sum(1 for p in mine if is1(p, "third_down_converted"))
    fail = sum(1 for p in mine if is1(p, "third_down_failed"))
    pool.rate("thirdDownRate", conv, conv + fail)
    early = [p for p in real if inum(col(p, "down")) in (1, 2)
             and not ((inum(col(p, "qtr")) or 1) in (2, 4, 5, 6) and (inum(col(p, "quarter_seconds_remaining")) or 900) <= 120)]
    pool.rate("earlyDownPassRate", sum(1 for p in early if is1(p, "pass")), len(early))
    thirds = [p for p in real if inum(col(p, "down")) == 3]
    pool.rate("avgThirdDistance", sum(inum(col(p, "ydstogo")) or 0 for p in thirds), len(thirds))

    drives = defaultdict(list)
    for p in mine:
        if col(p, "fixed_drive") not in ("", "NA"):
            drives[col(p, "fixed_drive")].append(p)
    pts_sum, n_drives, rz_trips, rz_tds, starts = 0.0, 0, 0, 0, []
    for rows in drives.values():
        plays = [p for p in rows if counted(p)]
        if not plays:
            continue
        pts = sum(max(0.0, (fnum(col(p, "posteam_score_post")) or 0) - (fnum(col(p, "posteam_score")) or 0)) for p in rows)
        result = col(rows[-1], "fixed_drive_result")
        starts.append(100 - (inum(col(plays[0], "yardline_100")) or 75))
        if any(is1(p, "drive_inside20") for p in rows):
            rz_trips += 1
            rz_tds += result == "Touchdown"
        # The page leaves out a kneel-out or two-snap end of half that scored nothing (src/stats/live.ts).
        if result == "End of half" and len(plays) <= 2 and pts == 0:
            continue
        pts_sum += pts
        n_drives += 1
    pool.rate("pointsPerDrive", pts_sum, n_drives)
    pool.rate("redZoneTdRate", rz_tds, rz_trips)
    pool.rate("avgStart", sum(starts), len(starts))

    pool.total("totalYards", sum(yds(p) for p in real))
    pool.total("netPassingYards", sum(yds(p) for p in passes if col(p, "qb_scramble") != "1"))
    pool.total("rushingYards", sum(yds(p) for p in real if is1(p, "rush") or is1(p, "qb_scramble")))
    pool.total("firstDowns", sum(1 for p in mine if is1(p, "first_down")))
    pool.total("turnovers", sum(1 for p in mine if lost_ball(p) and col(p, "play_type") in ("pass", "run")))
    pool.total("sacksTaken", sum(1 for p in passes if is1(p, "sack")))
    pool.total("penaltyYards", sum(fnum(col(p, "penalty_yards")) or 0 for p in game if col(p, "penalty_team") == team))
    pool.total("explosives", sum(1 for p in real if not lost_ball(p)
                                 and ((is1(p, "rush") and yds(p) >= 10) or (is1(p, "pass") and yds(p) >= 20))))


def player_games(pools: dict, game: list[dict]):
    qb, rb, wr = defaultdict(list), defaultdict(list), defaultdict(list)
    for p in game:
        if not counted(p):
            continue
        if is1(p, "qb_dropback") and col(p, "passer_id") not in ("", "NA"):
            qb[col(p, "passer_id")].append(p)
        if is1(p, "rush") and col(p, "rusher_player_id") not in ("", "NA"):
            rb[col(p, "rusher_player_id")].append(p)
        if is1(p, "pass_attempt") and not is1(p, "sack") and col(p, "receiver_player_id") not in ("", "NA"):
            wr[col(p, "receiver_player_id")].append(p)
    for rows in qb.values():
        real = [p for p in rows if stood(p)]
        if len(real) < QUALIFIERS["qb"]["min"]:
            continue
        att = [p for p in real if is1(p, "pass_attempt") and not is1(p, "sack") and not is1(p, "qb_scramble")]
        pl = pools["qb"]
        pl.rate("compPct", sum(1 for p in att if is1(p, "complete_pass")), len(att))
        pl.rate("yardsPerAttempt", sum(fnum(col(p, "passing_yards")) or 0 for p in att), len(att))
        pl.rate("sackRate", sum(1 for p in real if is1(p, "sack")), len(real))
        pl.rate("epaPerDropback", sum(fnum(col(p, "epa")) for p in rows), len(rows))
        pl.rate("successRate", sum(1 for p in real if rule_success(p)), len(real))
        pl.total("passYards", sum(fnum(col(p, "passing_yards")) or 0 for p in att))
        pl.total("passTd", sum(1 for p in att if is1(p, "pass_touchdown")))
        pl.total("interceptions", sum(1 for p in att if is1(p, "interception")))
    for rows in rb.values():
        real = [p for p in rows if stood(p)]
        if len(real) < QUALIFIERS["rb"]["min"]:
            continue
        pl = pools["rb"]
        pl.rate("yardsPerCarry", sum(yds(p) for p in real), len(real))
        pl.rate("epaPerCarry", sum(fnum(col(p, "epa")) for p in rows), len(rows))
        pl.rate("successRate", sum(1 for p in real if rule_success(p)), len(real))
        pl.total("rushYards", sum(yds(p) for p in real))
        pl.total("rushTd", sum(1 for p in real if is1(p, "rush_touchdown")))
    for rows in wr.values():
        real = [p for p in rows if stood(p)]
        if len(real) < QUALIFIERS["wr"]["min"]:
            continue
        pl = pools["wr"]
        catches = [p for p in real if is1(p, "complete_pass")]
        pl.rate("catchRate", len(catches), len(real))
        pl.rate("yardsPerTarget", sum(yds(p) for p in catches), len(real))
        pl.rate("epaPerTarget", sum(fnum(col(p, "epa")) for p in rows), len(rows))
        pl.total("recYards", sum(yds(p) for p in catches))
        pl.total("recTd", sum(1 for p in catches if is1(p, "pass_touchdown")))
    kp = pools["k"]
    for p in game:
        fg = col(p, "field_goal_result")
        if fg in ("made", "missed", "blocked"):
            kp.rate("fgPct", fg == "made", 1)
        xp = col(p, "extra_point_result")
        if xp in ("good", "failed", "blocked", "aborted"):
            kp.rate("xpPct", xp == "good", 1)
        if is1(p, "punt_attempt") and fnum(col(p, "kick_distance")) is not None:
            kp.rate("puntAvg", fnum(col(p, "kick_distance")), 1)


def impact_weights(plays: list[dict]) -> dict:
    """What a defensive play is worth, in expected points the offense lost on it (the mean over the window), and how
    often kicks are made by distance: the page's standouts score credits defenders and kickers with these."""
    def lost(pred) -> float | None:
        v = [-fnum(col(p, "epa")) for p in plays if fnum(col(p, "epa")) is not None and pred(p)]
        return round(sum(v) / len(v), 3) if v else None

    fg = defaultdict(lambda: [0, 0])
    xp = [0, 0]
    for p in plays:
        r = col(p, "field_goal_result")
        d = inum(col(p, "kick_distance"))
        if r in ("made", "missed", "blocked") and d is not None:
            b = max(lo for lo in FG_BUCKETS if d >= lo)
            fg[b][0] += r == "made"
            fg[b][1] += 1
        x = col(p, "extra_point_result")
        if x in ("good", "failed", "blocked", "aborted"):
            xp[0] += x == "good"
            xp[1] += 1
    return {
        "sack": lost(lambda p: is1(p, "sack") and stood(p)),
        "interception": lost(lambda p: is1(p, "interception")),
        "fumbleLost": lost(lambda p: is1(p, "fumble_lost") and counted(p)),
        "tackleForLoss": lost(lambda p: is1(p, "tackled_for_loss") and not is1(p, "sack") and stood(p)),
        "passDefended": lost(lambda p: is1(p, "incomplete_pass") and col(p, "pass_defense_1_player_id") not in ("", "NA")),
        "fgMake": [[b, round(fg[b][0] / fg[b][1], 3)] for b in FG_BUCKETS if fg[b][1]],
        "xpMake": round(xp[0] / xp[1], 3) if xp[1] else None,
    }


Schedule = dict[tuple[int, int], set[str]]  # (season, week) -> the regular-season game ids scheduled that week


def read_schedule(path: str) -> Schedule:
    out: Schedule = defaultdict(set)
    with open(path, encoding="utf-8", newline="") as f:
        for g in csv.DictReader(f):
            if g.get("game_type") == "REG" and inum(g.get("season", "")) and inum(g.get("week", "")):
                out[(int(g["season"]), int(g["week"]))].add(g["game_id"])
    return out


def final_weeks(plays: list[dict], schedule: Schedule | None) -> int:
    """Weeks whose every scheduled game is in the play-by-play: a Thursday game alone doesn't make week 4 count.
    Without a schedule (the test hook), every week with a game counts."""
    played = {col(p, "game_id") for p in plays}
    pairs = {(inum(col(p, "season")), inum(col(p, "week"))) for p in plays if inum(col(p, "week")) is not None}
    if schedule is not None:
        pairs = {k for k in pairs if schedule.get(k) and schedule[k] <= played}
    return len({w for _, w in pairs})


def baseline_window(label: str, seasons: list[int], pbp: dict[int, list[dict]], schedule: Schedule | None) -> dict:
    plays = [p for s in seasons for p in pbp.get(s, []) if col(p, "season_type") == "REG"]
    games = defaultdict(list)
    for p in plays:
        games[col(p, "game_id")].append(p)
    team = Pool()
    players = {k: Pool() for k in QUALIFIERS}
    for rows in games.values():
        for t in {col(rows[0], "home_team"), col(rows[0], "away_team")}:
            team_game(team, rows, t)
        player_games(players, rows)
    excluded = {k: why for k, why in KICKOFF_AFFECTED.items() if seasons and min(seasons) < KICKOFF_RULE_SEASON}
    team_out = team.out()
    for k in excluded:
        team_out["rates"].pop(k, None)
        team_out["totals"].pop(k, None)
    return {
        "label": label,
        "seasons": seasons,
        "weeks": final_weeks(plays, schedule),
        "games": len(games),
        "team": team_out,
        "players": {k: v.out() for k, v in players.items()},
        "excluded": excluded,
    }


def build_baselines(pbp: dict[int, list[dict]], season: int, built: str, schedule: Schedule | None) -> dict:
    last3 = [season - 3, season - 2, season - 1]
    return {
        "version": 1,
        "built": built,
        "season": season,
        "windows": {
            "season": baseline_window("This season", [season], pbp, schedule),
            "last3": baseline_window("Last 3 seasons", last3, pbp, schedule),
        },
        "qualifiers": {k: v["text"] for k, v in QUALIFIERS.items()},
        # From the three completed seasons: steadier than a few weeks of this one.
        "impact": impact_weights([p for s in last3 for p in pbp.get(s, []) if col(p, "season_type") == "REG"]),
    }


def write_baselines(pbp: dict[int, list[dict]], season: int, out: str, built: str, schedule: Schedule | None) -> dict:
    doc = build_baselines(pbp, season, built, schedule)
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "baselines.json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, separators=(",", ":"))
    w = doc["windows"]
    print(f"  baselines: this season {w['season']['games']} games over {w['season']['weeks']} weeks; "
          f"last 3 seasons {w['last3']['games']} games", file=sys.stderr)
    return doc


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    # Past seasons only: the calibration on this season's games then measures the table on games it never saw.
    ap.add_argument("--ep-seasons", default="2022,2023,2024,2025")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "data"))
    ap.add_argument("--max-age-h", type=float, default=6.0, help="re-download cached files older than this")
    ap.add_argument("--baselines-from", help="test hook: build only baselines.json from this play-by-play CSV (no downloads)")
    ap.add_argument("--games-from", help="test hook: the schedule CSV (nfldata games.csv columns) for --baselines-from")
    a = ap.parse_args()

    if a.baselines_from:
        fixture = defaultdict(list)
        with open(a.baselines_from, encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                fixture[int(row["season"])].append(row)
        write_baselines(fixture, a.season, a.out, "fixture", read_schedule(a.games_from) if a.games_from else None)
        return 0

    ep_seasons = [int(s) for s in a.ep_seasons.split(",") if s]
    # This season, the EP table's seasons, and the three completed seasons the league averages use.
    seasons = sorted(set(ep_seasons) | {a.season} | {a.season - k for k in (1, 2, 3)})
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
    write_baselines(pbp, a.season, a.out, built, read_schedule(games_path))
    print(json.dumps({"games_written": written, "calibration": calibration}), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

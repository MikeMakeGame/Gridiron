"""Contrast of every NFL team's colours as Gridiron shows them, on night and on day. Read-only; exits 1 on a failure.

Team colours come from cached ESPN game summaries.

1. Accents (lines, bars, chart labels). The pick mirrors format.ts teamVars (a grey-ish primary falls back to the
   alternate); the transforms mirror styles.css:
     night: oklch(from tc max(l, .64) calc(c * 1.35) h) on #050607
     day:   oklch(from tc min(l, .46) calc(c * 1.1) h)  on #f7f6f2 (and white cards)
   Bars need 3:1; colour used as text (team abbreviations on the WP chart) wants 4.5:1.

2. Fills (team tiles). The rules mirror src/espn/colors.ts: the fill is the shown colour (as above), its text is
   white or ink by contrast (pure black in the band where ink falls short), the stripe is the other colour unless it
   sits closer than CLASH in OKLab. Every team's primary AND alternate is checked as a fill with its chosen text.
   A fill is the same colour in both looks (Day draws an edge round the tile instead of muting it), so its text
   contrast is one number for both; the tile-against-page column shows, per look, why the edge is there.

3. Pairings (colors.ts pairHome: one colour per team per view). Every away/home pairing whose fills sit closer than
   CLASH, and what the rule does: the home side's other colour for tile and lines, or a divider when that colour is
   neutral or clashes too. Then every pairing whose lines would still read as one gets the home lines lifted in
   lightness; each lifted line's contrast against the pages is checked again.

Colours load as model.ts coloursOf loads them (no usable alternate: the primary stands in). It exits 1 when an
accent or a lifted line falls under 3:1 on a page, or a fill's text under 4.5:1; the text pick rules the last out by
construction, so that column cross-checks this mirror against colors.ts rather than the teams.
"""
import glob
import json
import math
import re
import sys

def hex_rgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]

def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def delin(c):
    c = min(1.0, max(0.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055

def to_oklch(rgb):
    r, g, b = (lin(c) for c in rgb)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = (math.copysign(abs(x) ** (1 / 3), x) for x in (l, m, s))
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L, math.hypot(a, bb), math.atan2(bb, a)

def from_oklch(L, C, h):
    a, b = C * math.cos(h), C * math.sin(h)
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return [delin(x) for x in (r, g, bl)]  # clipped into sRGB, as the screen shows it

def lum(rgb):
    r, g, b = (lin(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

def neutral(h):
    r, g, b = (int(h.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
    return max(r, g, b) - min(r, g, b) < 24

# Loaded as model.ts coloursOf loads them: no usable primary, no fill (left out here); no usable alternate, the
# primary stands in for it (a primary-only fill striped in its text colour).
HEX6 = re.compile(r"^#?[0-9a-f]{6}$", re.I)

def usable(c):
    return bool(c) and bool(HEX6.match(c))

def hexed(c):
    return c if c.startswith("#") else "#" + c

teams = {}
for f in glob.glob(sys.argv[1] + "/summary-*.json"):
    s = json.load(open(f, encoding="utf-8"))
    for c in s.get("header", {}).get("competitions", [{}])[0].get("competitors", []):
        t = c.get("team", {})
        if not t.get("abbreviation"):
            continue
        if not usable(t.get("color")):
            if t["abbreviation"] not in teams:
                print(f"note: {t['abbreviation']} has no usable colour ({t.get('color')!r}); the page keeps its plain tile")
            continue
        c1 = hexed(t["color"])
        if not usable(t.get("alternateColor")):
            print(f"note: {t['abbreviation']} has no usable alternate ({t.get('alternateColor')!r}); primary only")
        teams[t["abbreviation"]] = (c1, hexed(t["alternateColor"]) if usable(t.get("alternateColor")) else c1)

night_bg, day_bg, day_card = hex_rgb("#050607"), hex_rgb("#f7f6f2"), hex_rgb("#ffffff")
rows = []
for abbr, (c1, c2) in sorted(teams.items()):
    tc = c2 if neutral(c1) else c1
    L, C, H = to_oklch(hex_rgb(tc))
    night = from_oklch(max(L, 0.64), C * 1.35, H)
    day = from_oklch(min(L, 0.46), C * 1.1, H)
    rows.append((abbr, tc, contrast(night, night_bg), contrast(day, day_bg), contrast(day, day_card)))

print(f"{len(rows)} teams")
print("ACCENTS")
print("team  colour   night  day-bg  day-card")
failed = False
for abbr, tc, n, d, dc in rows:
    flag = "  <3 BAR FAIL" if min(n, d, dc) < 3 else ("  <4.5 as text" if min(n, d, dc) < 4.5 else "")
    failed = failed or min(n, d, dc) < 3
    print(f"{abbr:4}  {tc}  {n:5.2f}  {d:6.2f}  {dc:8.2f}{flag}")
print("worst night", min(r[2] for r in rows), "worst day", min(min(r[3], r[4]) for r in rows))

# --- fills: mirrors src/espn/colors.ts ---------------------------------------------------------------------------
WHITE, INK, BLACK = "#ffffff", "#0b0d10", "#000000"
TEXT_MIN, CLASH = 4.5, 0.08

def oklab(rgb):
    r, g, b = (lin(c) for c in rgb)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = (math.copysign(abs(x) ** (1 / 3), x) for x in (l, m, s))
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)

def distance(a, b):
    return math.dist(oklab(hex_rgb(a)), oklab(hex_rgb(b)))

def text_on(fill):
    f = hex_rgb(fill)
    if contrast(hex_rgb(WHITE), f) >= contrast(hex_rgb(BLACK), f):
        return WHITE
    return INK if contrast(hex_rgb(INK), f) >= TEXT_MIN else BLACK

def paint(bg, other):
    fg = text_on(bg)
    return {"bg": bg, "fg": fg, "accent": other if distance(other, bg) >= CLASH else fg, "divider": False}

def team_fill(c1, c2):
    bg = c2 if neutral(c1) else c1
    return paint(bg, c2 if bg == c1 else c1)

LINE = {"night": (0.64, 1.35), "day": (0.46, 1.1)}

def line_lab(hexc, look, l=None):
    L, C, H = to_oklch(hex_rgb(hexc))
    floor, gain = LINE[look]
    L2 = l if l is not None else (max(L, floor) if look == "night" else min(L, floor))
    return (L2, C * gain * math.cos(H), C * gain * math.sin(H))

def lines_clash(a, b, lift=None):
    return any(math.dist(line_lab(a, k), line_lab(b, k, lift[k] if lift else None)) < CLASH for k in LINE)

def lift_for(away):
    n, d = line_lab(away, "night")[0], line_lab(away, "day")[0]
    return {"night": n + 0.18 if n < 0.8 else n - 0.16, "day": d - 0.16 if d >= 0.26 else d + 0.16}

def shown(c1, c2):
    return c2 if neutral(c1) else c1

def pair_home(away_colours, home_colours):
    """Mirrors colors.ts pairHome: returns (home fill, what happened, the home's shown colour, its line lift)."""
    af = team_fill(*away_colours)
    c1, c2 = home_colours
    home, how, home_shown = team_fill(c1, c2), "apart", shown(c1, c2)
    if distance(af["bg"], home["bg"]) < CLASH:
        other = c2 if home["bg"] == c1 else c1
        if not neutral(other) and distance(af["bg"], other) >= CLASH:
            home, how, home_shown = paint(other, home["bg"]), "other colour", other
        else:
            home, how = dict(home, divider=True), "divider (other colour " + ("neutral" if neutral(other) else "clashes") + ")"
    a = shown(*away_colours)
    lift = lift_for(a) if lines_clash(a, home_shown) else None
    return home, how, home_shown, lift

name = {WHITE: "white", INK: "ink", BLACK: "black"}
print()
print("FILLS (text contrast holds in both looks; the tile-vs-page columns are why each tile has an edge)")
print("team  fill     text   ratio  stripe   | alternate as fill: text ratio | tile vs night page  vs day page")
worst = 99.0
for abbr, (c1, c2) in sorted(teams.items()):
    f = team_fill(c1, c2)
    ratio = contrast(hex_rgb(f["fg"]), hex_rgb(f["bg"]))
    other = c2 if f["bg"] == c1 else c1
    ofg = text_on(other)
    oratio = contrast(hex_rgb(ofg), hex_rgb(other))
    worst = min(worst, ratio, oratio)
    bad = min(ratio, oratio) < TEXT_MIN
    failed = failed or bad
    tn, td = contrast(hex_rgb(f["bg"]), night_bg), contrast(hex_rgb(f["bg"]), day_bg)
    print(f"{abbr:4}  {f['bg']}  {name[f['fg']]:5}  {ratio:5.2f}  {f['accent']}  | {other} {name[ofg]:5} {oratio:5.2f}       |"
          f" {tn:5.2f}              {td:5.2f}{'  <4.5 FAIL' if bad else ''}")
print("worst text on a fill", round(worst, 2))

print()
print("PAIRINGS whose fills clash (away @ home): what the home side wears, tile and lines alike")
clashes, lifts, worst_lift = 0, 0, 99.0
lifted = []
for a in sorted(teams):
    af = team_fill(*teams[a])
    for h in sorted(teams):
        if a == h:
            continue
        hf, how, home_shown, lift = pair_home(teams[a], teams[h])
        if lift:
            lifts += 1
            lifted.append((a, h, home_shown, lift))
        if how == "apart":
            continue
        clashes += 1
        print(f"{a:4} @ {h:4}  {af['bg']} vs {team_fill(*teams[h])['bg']}  -> {how}: {hf['bg']}{'  (lines lifted)' if lift else ''}")
print(f"{clashes} of {len(teams) * (len(teams) - 1)} pairings clash as fills")

# A lifted line is drawn at its own lightness, so its contrast against each page is checked again (bars need 3:1).
print()
print("LIFTED LINES (the home side's lines moved in lightness so they read apart from the away side's)")
for a, h, home_shown, lift in lifted:
    L, C, H = to_oklch(hex_rgb(home_shown))
    night = from_oklch(lift["night"], C * LINE["night"][1], H)
    day = from_oklch(lift["day"], C * LINE["day"][1], H)
    n, d, dc = contrast(night, night_bg), contrast(day, day_bg), contrast(day, day_card)
    worst_lift = min(worst_lift, n, d, dc)
    bad = min(n, d, dc) < 3
    failed = failed or bad
    print(f"{a:4} @ {h:4}  {home_shown}  night l {lift['night']:.2f} {n:5.2f}  day l {lift['day']:.2f} {d:5.2f} / {dc:5.2f}"
          f"{'  <3 BAR FAIL' if bad else ('  <4.5 as text' if min(n, d, dc) < 4.5 else '')}")
print(f"{lifts} pairings lift the home lines; worst lifted contrast {worst_lift:.2f}" if lifts else "no pairing lifts a line")
sys.exit(1 if failed else 0)

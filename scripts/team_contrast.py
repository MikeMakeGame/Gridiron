"""Contrast of every NFL team's accent colour as Gridiron's CSS transforms it, on night and on day. Read-only.

Team colours come from cached ESPN game summaries. The pick mirrors format.ts teamVars (a grey-ish primary falls back
to the alternate); the transforms mirror styles.css:
  night: oklch(from tc max(l, .64) calc(c * 1.35) h) on #050607
  day:   oklch(from tc min(l, .46) calc(c * 1.1) h)  on #f7f6f2 (and white cards)
Bars need 3:1; colour used as text (team abbreviations on the WP chart) wants 4.5:1.
"""
import glob
import json
import math
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

teams = {}
for f in glob.glob(sys.argv[1] + "/summary-*.json"):
    s = json.load(open(f, encoding="utf-8"))
    for c in s.get("header", {}).get("competitions", [{}])[0].get("competitors", []):
        t = c.get("team", {})
        if t.get("abbreviation") and t.get("color"):
            teams[t["abbreviation"]] = ("#" + t["color"], "#" + (t.get("alternateColor") or t["color"]))

night_bg, day_bg, day_card = hex_rgb("#050607"), hex_rgb("#f7f6f2"), hex_rgb("#ffffff")
rows = []
for abbr, (c1, c2) in sorted(teams.items()):
    tc = c2 if neutral(c1) else c1
    L, C, H = to_oklch(hex_rgb(tc))
    night = from_oklch(max(L, 0.64), C * 1.35, H)
    day = from_oklch(min(L, 0.46), C * 1.1, H)
    rows.append((abbr, tc, contrast(night, night_bg), contrast(day, day_bg), contrast(day, day_card)))

print(f"{len(rows)} teams")
print("team  colour   night  day-bg  day-card")
for abbr, tc, n, d, dc in rows:
    flag = "  <3 BAR FAIL" if min(n, d, dc) < 3 else ("  <4.5 as text" if min(n, d, dc) < 4.5 else "")
    print(f"{abbr:4}  {tc}  {n:5.2f}  {d:6.2f}  {dc:8.2f}{flag}")
print("worst night", min(r[2] for r in rows), "worst day", min(min(r[3], r[4]) for r in rows))

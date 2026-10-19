# Gridiron DOM contract

The builder writes the Preact components; the stylist owns `src/styles.css`.
Both sides keep these class names. Add classes freely; never rename these.

Viewport target: 390x844 portrait phone first; must not break at 320 or look silly at 1280 (center a max-width column, ~560px).
Dark by default. Tabular numerals everywhere numbers sit in columns.
Team colors arrive as CSS custom properties on the element: `--tc` (primary hex, e.g. `#AA0000`) and `--tc2` (alternate). Some team primaries are near-black (e.g. LV `#000000`), so the stylist must keep marks visible on dark (lift luminance / use outline).

## Root
- `.app` root; `.view-scoreboard` or `.view-game` modifier.
- `.topbar` app header on the scoreboard: `.brand`, `.week` (e.g. "Week 6"), `.fresh`.
- `.fresh` freshness pill, everywhere: text like "7s ago". States: `.is-live` (green, under 30s), `.is-stale` (amber, 45s+), `.is-dead` (red, 2min+, text "tap to refresh"), `.is-idle` (no polling: pre/final). It is a button.

## Scoreboard
- `.sb-list` list of cards. Group headings `.sb-group` ("Live", "Today", "Final", "Upcoming").
- `.sb-game` card (a button/link). State modifier: `.is-live` | `.is-pre` | `.is-final`. `.is-close` when live and within 8 points in the 4th.
  - two `.sb-team` rows (away first), each with `--tc`: `img.logo`, `.abbr`, `.rec` (record "4-2"), `.score`, `.poss` (a small ball marker, present only for the team with the ball), `.is-winner` modifier on the final winner, `.is-loser` on the final loser.
  - `.sb-status`: "Q3 4:12" / "Final" / "Final/OT" / "Mon 5:15 PM".
  - `.sb-sit` (live only): "3rd & 4 · SF 38". `.is-redzone` modifier.
  - `.sb-wp` (live only): a 2-segment bar, `.sb-wp-away` and `.sb-wp-home` with inline `width:%` and `--tc`.
  - `.sb-meta` (pre only): broadcast + spread, e.g. "ESPN · SF -7.5".

## Game page (one scroll, no tabs)
- `.scorebar` sticky at top (stays while scrolling):
  - `.sbar-team.away` and `.sbar-team.home`, each with `--tc`: `img.logo`, `.abbr`, `.score`, `.tos` holding three `.to` dots (`.to.used` when spent), `.poss` ball marker when that team has it.
  - `.sbar-mid`: `.clock` ("Q2 2:14" / "Half" / "Final"), `.fresh`.
  - `.back` button (to scoreboard), top-left.
- `.situation`: "3rd & 4 · SF 38" plus `.sit-extra` ("Red zone", "2-min"). `.is-redzone` modifier.
- `.lastplay`: `.lp-label` ("Last play"), `.lp-text`, `.wpd` badge.
- `.wpd` (WP delta badge, reused in play lists): text like "SF +4.1%". Modifiers `.big` (|delta| >= 10%), and `--tc` of the team that gained.
- `.epa` (EPA badge, reused): "+1.8" with `.pos` / `.neg` modifiers and `.est` when estimated.
- `.wpchart`: an inline SVG, full width, ~96px tall. Inside: `path.wp-line`, `line.wp-mid` (50% rule), `circle.wp-now`, `rect.wp-q` quarter bands (alternate subtle shading), `.wp-label` text for the two team abbreviations at top/bottom edges. Home on top (100%) and away on bottom (0%); the line takes `stroke` from a gradient or plain currentColor, stylist's call.
- `.curdrive`: the current drive strip: `.cd-track` (100-yard track, own goal left, opponent goal right), `.cd-bar` (start-to-now span, `--tc`), `.cd-tick` per play, `.cd-meta` ("6 plays · 41 yds · 3:02").
- `.section` wrapper for every block below, with an `id` for the jump bar: `#now`, `#drives`, `#numbers`, `#players`. Each has `h2.section-title`.
- `.nums` live-numbers grid: a header row `.nums-head` (two team abbr cells with `--tc`), then `.nums-row` per stat: `.k` (label), `.v.away`, `.v.home`, `.better` on whichever side wins that stat. `.nums-note` small footnote line. `.tag-model` chip ("nflverse") and `.tag-est` chip ("est.").
- `.drives` list:
  - `.qrule` divider between quarters: "Q2 · 7-3".
  - `.drive` row (a button), `--tc`: `.drive-team` (abbr + quarter), `.drive-track` (100-yard track, always attacking rightward), `.drive-bar` (start-to-end span), `.drive-cap` end glyph with modifiers `.cap-td` `.cap-fg` `.cap-punt` `.cap-to` (turnover) `.cap-downs` `.cap-half` `.cap-miss` (missed FG) `.cap-live`, `.drive-res` (result code "TD", "PUNT"), `.drive-sub` ("6p 41y 3:02"). `.is-open` when expanded. `.is-live` for the current drive (pulsing end cap allowed; nothing else animates).
  - `.drive-plays` (inside an open drive): `.play` rows: `.play-dd` ("2nd & 7 · SF 41"), `.play-text`, `.play-badges` holding `.wpd` / `.epa`. `.play.is-score`, `.play.is-turnover`, `.play.is-penalty`, `.play.is-new` (just arrived; one-shot highlight, fades over ~2s).
- `.players`: per-team blocks `.pl-team` with `--tc`; per category `table.pl-table` with `caption`, `th`, `td`; first column `.pl-name`.
- `.adv` post-game nflverse block: same `.nums` grid + `.topplays` list of `.play`.
- `.jumpbar`: fixed bottom bar of `button.jump` (Now, Drives, Numbers, Players); `.is-active`.
- `.footer`: data credits ("Live data: ESPN (unofficial). Advanced: nflverse, CC-BY 4.0.").
- `.empty`, `.error` states (one line, centered).

## Motion
Only two things animate: `.play.is-new` (one-shot fade) and `.drive-cap.cap-live` / `.wp-now` (slow pulse). Respect `prefers-reduced-motion`.

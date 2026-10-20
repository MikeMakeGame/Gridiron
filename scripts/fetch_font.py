"""One-time: copy Barlow Condensed 500/700 (latin, woff2; SIL Open Font License) into src/fonts so the site
loads no third-party font host (Vite bundles them from the stylesheet). Prints the @font-face rules for
src/styles.css. Usage: python -X utf8 -I scripts/fetch_font.py
"""
import os, re, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "fonts")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"}
css = urllib.request.urlopen(urllib.request.Request(
    "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;700&display=swap", headers=UA), timeout=30).read().decode()
os.makedirs(OUT, exist_ok=True)
rules = []
# Google serves one block per unicode subset; keep the latin one for each weight.
for block in re.findall(r"/\* ([\w-]+) \*/\s*@font-face \{(.*?)\}", css, re.S):
    subset, body = block
    if subset != "latin":
        continue
    weight = re.search(r"font-weight:\s*(\d+)", body).group(1)
    url = re.search(r"url\((https://[^)]+\.woff2)\)", body).group(1)
    rng = re.search(r"unicode-range:\s*([^;]+);", body).group(1)
    name = f"barlow-condensed-{weight}-latin.woff2"
    data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read()
    open(os.path.join(OUT, name), "wb").write(data)
    rules.append(
        "@font-face { font-family: 'Barlow Condensed'; font-style: normal; font-weight: %s; font-display: swap;\n"
        "  src: url('./fonts/%s') format('woff2'); unicode-range: %s; }" % (weight, name, rng)
    )
    print(f"saved {name} ({len(data)} bytes)")
print("\n".join(rules))

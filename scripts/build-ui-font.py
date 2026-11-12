"""Rebuild the self-hosted OFL font; requires developer-only fontTools.
Usage: python scripts/build-ui-font.py /path/to/NotoSansCJK-Regular.ttc
The SC face is collection index 2. No downloaded font or CDN at runtime.
"""
import sys
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
root = Path(__file__).resolve().parents[1]
asset = root / 'src/assets/season-ui.woff'
codepoints = set(TTFont(asset).getBestCmap())
for path in (root / 'src').rglob('*'):
    if path.suffix in ('.ts', '.tsx'):
        codepoints.update(ord(c) for c in path.read_text() if 0x3000 <= ord(c) <= 0x9fff)
font = TTFont(sys.argv[1], fontNumber=2, recalcTimestamp=False)
missing = codepoints - set(font.getBestCmap())
# Keep existing ASCII/control coverage; fail only for missing UI CJK glyphs.
assert not {c for c in missing if 0x3000 <= c <= 0x9fff}, missing
options = subset.Options()
options.flavor = 'woff'
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=codepoints)
subsetter.subset(font)
font.flavor = 'woff'
font.save(asset)
print('Wrote', asset.name, len(codepoints), 'codepoints')

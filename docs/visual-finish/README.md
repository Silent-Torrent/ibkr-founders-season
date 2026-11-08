# Visual finish comparison

All screenshots use the built-in fictional demo. No account files were imported.

- Before: main `4fa8c315187392786841bb724ff715936290a03d`.
- After source: `9e7d67f5c014caecb56def75d150cd5dc2d625ee`.
- Browser viewports: mobile 390 × 844; desktop 1440 × 900.
- Views: feast share preview, arena self comparison, demo leaderboard, battle-code form.
- Defaults: amounts hidden, roast enabled; zh-CN red gains. Browser assertions also cover zh-TW and English theme colors and overflow.
- Capture: `scripts/capture-visual-finish.mjs` against the two production builds.
- Full checks and screenshot run: https://github.com/Silent-Torrent/ibkr-founders-season/actions/runs/42443427625

The CI screenshot artifact also includes the actual before/after downloaded PNGs, with pixel assertions for the diagonal stripe. The source fixes do not alter business copy, ranking data, backend, or financial calculations.

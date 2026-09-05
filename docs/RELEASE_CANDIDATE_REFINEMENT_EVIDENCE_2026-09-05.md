# Checkpoint 0.17 release-candidate refinement evidence

Date: 2026-09-05

Scope: local UI and presentation refinement using repository-owned fully fictional data only

Deployment: not performed; decision L remains active

## Outcome

Checkpoint 0.17 completes the approved local release-candidate refinement without changing the parser, accounting calculations, achievement thresholds, report-capacity limits, current-tab storage rule, network boundary, or deployment freeze.

The work improves visual identity, hierarchy, responsive layout, wording, and unavailable states. It is a presentation-quality checkpoint, not proof that the product is ready for a public or Production release.

## Visual identity and hierarchy

- The product name is consistently `P&L Arena` in English, Simplified Chinese, and Traditional Chinese.
- A first code-native mark combines an arena ring, a zero line, and a P/L trace. The same geometry, colors, and opacity rules are used in the welcome screen, application sidebar, web share preview, generated PNG, and favicon.
- The chartreuse brand color is separated from financial meaning: mint remains positive P&L or a passed calculation check; amber remains warning or Self-reported; blue remains synthetic/demo; red remains loss or error.
- Guide and Arena headings use `report.seasonYear` rather than a hard-coded display year. The Founding Degenerate achievement deliberately remains a 2026-only rule and will require a separate product decision for a future season.
- Metric, table, ranking, division, and share-card numerals use tabular lining figures. The decorative Arena year is visually subordinate to the page title.

This mark is a first code-native identity, not a completed brand or trademark package. Original trophy illustrations remain a later workstream.

## Missing, zero, and reconciliation states

- A non-zero reconciliation difference no longer disappears as a rounded currency zero. Precision increases with the value's scale whenever ordinary currency formatting would hide the difference, up to 20 decimal places; values below that display range use scientific notation.
- A true zero remains a numeric zero. Missing evidence is shown as `Unavailable`; numeric zero is never used as a missing-data test.
- Realized YTD P&L is available when the dedicated realized section exists or when a validated Month/YTD fallback carries a source reference.
- Current unrealized P&L is available only when the supported dedicated realized/unrealized section exists.
- Ledger rows and the symbol drawer apply the same rules. The three reconciliation cards now include separate plain-language explanations of what each calculation checks.
- A missing Season return/TWR is explicitly labelled unavailable in the Arena, web share card, copied summary, and generated PNG; the app does not estimate it.

## Achievement and Arena states

- Achievement cards distinguish Preview, Unlocked, Not met, Unavailable, Not applicable, and Not supported yet.
- Synthetic Demo and Fully Synthetic Test data remain preview-only. They do not become local achievements.
- A presentation-level Unavailable state overrides a stale numeric trigger and is excluded from the header's unlocked count. The core `getTrophies` calculation and all thresholds remain unchanged.
- Bagholder explains when current-unrealized evidence is missing. Cash Gang explains when cash or a usable non-zero net liquidation value is missing.
- Reverse Buffett and IV Crush Survivor say `Not supported yet`; no delivery date or future-season promise is made.
- Threshold descriptions are explicitly introduced as unlock conditions and use the same YTD mark-to-market terminology as the implemented calculations.
- The local Arena snapshot states Not ranked, Self-reported, TWR availability, and the independent Internal calculation check. Demo rows remain an interface demonstration, not a real leaderboard.

## Responsive and sharing behavior

- At 500 px and below, the Ledger keeps Symbol, YTD P&L, and Details; the Arena keeps Rank, Trader, and Return. Secondary values remain available through the existing detail drawer or wider layout.
- At 768 px, the first-use screen keeps its two main choices side by side, while the bottom navigation is capped at 560 px and uses 10 px labels.
- At 1,120 px and below, the Import page and local Arena snapshot switch to a readable single-column structure; the snapshot metrics use three columns, then two columns at 780 px and one column at 500 px.
- At 980 px and below, the demo leaderboard becomes horizontally scrollable rather than clipping columns. A production-Chrome regression checks the complete local snapshot and scrolling boundary at 812 px.
- Locked achievement cards keep full-opacity copy and at least 10 px status/body text; only decorative artwork and dots are dimmed.
- The generated 1200x1500 PNG uses the same mark and separates the privacy sentence from the brand row. Automated canvas measurements require gaps between the privacy line, mark, and brand label.
- The product UI says `PNG download started` after triggering a browser download. It does not claim that every browser has already written the file. The isolated Chrome regression separately waits for and verifies the actual completed test download.
- Share actions expose visible Preparing, Download started, Shared, Cancelled, Failed, and Preview ready states.

## Automated and visual evidence

Focused checks passed under Node.js 22.23.2:

- TypeScript typecheck;
- explicit three-locale contract;
- accessibility structure and keyboard contract;
- product policy and privacy contract;
- production-Chrome import, cancellation, capacity, responsive-layout, and PNG regression.

The final production-Chrome run accepted the exact-capacity 5 MiB / 100,000-row / 500-symbol / 1,000-event fictional file in approximately 0.78 seconds on this Mac. Its maximum observed long task was 0 ms, maximum animation-frame gap was approximately 16.8 ms, and maximum timer gap was approximately 78.1 ms. The generated PNG measured 1200x1500 pixels and 1,279,488 bytes in that isolated run. Separate 501-symbol and 1,001-event cases still failed closed and preserved the accepted report.

The complete `VERIFY_MAC.command` gate passed under Node.js 22.23.2 and npm 10.9.8 after the checkpoint changes: clean locked installation, two dependency vulnerability checks with zero reported vulnerabilities, every automated suite, and the final production build.

Manual local visual inspection covered the Ledger, Arena, Trophies, and Import pages at the current 812 px application viewport. The Arena decorative year and generated-card footer were adjusted after visual and independent review exposed overlaps that assertion-only testing had initially missed.

## Explicit non-claims

Checkpoint 0.17 does not prove:

- that an arbitrary imported CSV is authentic, unedited, or issued by IBKR;
- that AI-edited statements can be reliably detected;
- that the Arena is a real public leaderboard or that local achievements are official awards;
- PDF parsing or automated PDF reconciliation;
- qualified Exercise-event parsing;
- the supported iOS/Safari 16.4 floor, device rotation, or measured browser-Worker peak memory;
- complete VoiceOver speech/focus order;
- HTTPS native file sharing or exact requested-filename preservation;
- deployed Network, Storage, headers, MIME, or access-control behavior;
- readiness for public or Production release.

No private statement was opened, copied, modified, or added to the repository during this checkpoint. No iPhone test, hosting action, or deployment was performed. Source changes are backed up only to the approved private GitHub repository; no user statement or generated user data is uploaded.

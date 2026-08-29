# P&L Arena — 2026 Founders Season

Privacy-first Web App MVP for analyzing an Interactive Brokers Year-to-Date Activity Statement and presenting annual stock-and-options performance as a season.

## Current coded checkpoint 0.6

The repository already contains:

- React + TypeScript + Vite application shell.
- English, Simplified Chinese, and Traditional Chinese UI.
- A three-locale Privacy & Data notice with explicit local-processing, storage, authenticity, PDF, disclaimer, and clearing boundaries.
- Accessible dialog behavior for the Privacy & Data notice: initial focus, contained Tab/Shift+Tab navigation, Escape and backdrop close, focus return, and background interaction lock.
- Local-only CSV reading; no server or database. File reading and parsing run in a dedicated Web Worker rather than on the UI thread.
- A 12-second total import timeout covers worker-side file reading, parsing and result return. A replacement that passes the filename, non-empty and size preflight, an explicit cancel, a Demo switch or page unmount terminates the old worker before the replacement is parsed.
- Worker result caps stop reports with more than 5,000 underlyings, 25,000 lifecycle events or 100,000 source-reference occurrences from being copied back to the UI.
- Strict current-year YTD validation that rejects nonexistent dates, reversed periods, future period ends, and non-current seasons.
- Consistent three-letter base-currency validation with a crash-safe display fallback.
- IBKR multi-section CSV parser.
- YTD mark-to-market aggregation by underlying.
- Canonical accounting fields `reportedAllAssetsYtdMtm`, `parsedAllAssetsYtdMtm`, and `mtmReconciliationDifference`, with the signed difference defined as `reported - parsed`.
- Three diagnostics for all-assets MTM, statement-period P/L, and the NAV bridge, using a fixed CSV epsilon of `0.000001`.
- Local `SourceRef` provenance for portfolio metrics, reconciliation checks, underlying metrics, and lifecycle events. References retain section/record type/row/header/field metadata, not the raw row.
- Expandable source references in the Ledger for major portfolio metrics and the three reconciliation checks.
- Per-underlying source drawers for total, stock, option, other, realized and current-unrealized metrics, plus each detected lifecycle event.
- Stock, option, realized, and current-unrealized breakdowns.
- Assignment, exercise, and expiration event detection.
- Ledger, Arena Demo, Trophies, and Import pages.
- Current-session memory for the latest accepted YTD snapshot; the complete report is not persisted by default.
- Duplicate statements are detected, older YTD snapshots are blocked, and a different same-date file cannot silently replace the current account-season snapshot.
- Downloadable PNG season card and copyable text summary whose default outputs omit underlying symbols, account identifiers, and exact net liquidation value.
- Explicit Synthetic Demo, Fully Synthetic Test, Self-Reported, and Internal Checks Passed statuses. “Internal Checks Passed” appears only when every configured reconciliation check passed; unavailable checks require review. Local results are unranked, synthetic data does not unlock achievements, and missing or non-USD NAV does not invent a USD capital division.
- Responsive desktop and mobile layouts.
- Frozen browser support baseline: iOS 16.4+ and Safari 16.4+. The production build target is explicit and covered by a compatibility contract check; the development server is not used as proof of that floor.
- Desktop browser keyboard/focus checks have passed for page changes, both dialogs, controls, status messages, and focus return. A 320 px simulated narrow-screen check also covered bottom navigation, the Ledger table and share card, the Arena scroll region, the privacy dialog, and the symbol drawer. This is not a real-iPhone or VoiceOver result.
- Synthetic sample statement, a fully fictional current-schema regression fixture, parser smoke tests, and a product-policy/privacy regression suite.

## Run on macOS

### Easiest route

Double-click `START_MAC.command`. It checks Node.js, installs the pinned dependencies, runs the parser/type checks, and opens the local app. Keep the Terminal window open while using it.

### Terminal route

```bash
cd ibkr-founders-season
export PATH="/opt/homebrew/opt/node@22/bin:/usr/local/opt/node@22/bin:$PATH"
node --version
npm ci
npm run check
npm run dev
```

`node --version` must show Node 22.12 or newer within the Node 22 line; this Mac currently uses v22.23.2. Repeat the `export PATH=...` line in each new Terminal window. Open the local URL printed by Vite, normally `http://localhost:5173`.

## Frozen source-control and deployment boundary

- Browser support begins at iOS 16.4 and Safari 16.4.
- The remote must be a GitHub private repository.
- Git commits must use the user's approved GitHub `noreply` email rather than a personal email address.
- The earlier access-protected Vercel Preview authorization is paused because Vercel forced the empty project's first Preview request into Production.
- The user selected A + C on 2026-08-30: keep Vercel empty and research private-test alternatives only. No alternate provider or external upload is approved yet.
- The user then selected L: continue local development and private-GitHub backup, and revisit deployment only after the local product is ready.
- Do not create, publish, or expose any external deployment or public/Production domain without a separate future approval and provider-specific release-gate review.
- The local `main` branch now tracks the private GitHub remote `Silent-Torrent/ibkr-founders-season`. Commits use the approved GitHub `noreply` identity, and this Mac connects through a repository-scoped read/write deploy key. The Standard-Protected Vercel project remains at zero deployments. The read-only alternative comparison is recorded in `docs/PRIVATE_TEST_HOSTING_RESEARCH_2026-08-30.md`.

## Validate before a commit

```bash
npm run check
```

This runs TypeScript checking, the parser smoke suite, the Worker lifecycle contract suite, the accessibility structure/keyboard contract suite, the frozen browser-compatibility contract, and the product-policy/privacy suite. Then run `npm run build`; only the production bundle is eligible for Safari/iOS 16.4 testing. The expected bundled sample result is:

```text
Season P&L:  $20,040
Stock P&L:   $13,690
Options P&L:  $6,350
Symbols:             6
Option events:       5
```

The smoke suite also parses `tests/fixtures/ibkr-current-schema-synthetic.csv`. That fixture is fully invented and covers repeated and multiple header shapes, `Data`/`SubTotal`/`Total` rows, and the tested empty-record-type Total P/L row. Its MTM, statement-period P/L, and NAV-bridge checks must all return `PASS_EXACT`.

## MVP import contract

The importer accepts only:

- Report type: Activity Statement
- Period: Year to Date
- Format: CSV
- Language: English
- Account scope: one account
- Season: current natural year

A newer YTD statement replaces the older local season snapshot. Statements are never added together. A different same-date file for the same account-season is rejected instead of silently replacing the current snapshot.

## Accounting hierarchy

Primary season result:

```text
Season P&L = IBKR YTD Mark-to-Market P&L
```

Per underlying:

```text
Underlying season P&L
= Stock YTD MTM
+ Options YTD MTM
+ Other YTD MTM, if present
```

The current unrealized P&L is displayed separately. It is not added again to YTD MTM, because doing so can double-count gains from positions opened in a prior year.

## Privacy boundary

The selected CSV is converted to a filename-free browser `Blob`, then read and parsed inside a dedicated Web Worker. The current MVP does not have a backend. The raw account identifier is discarded after parsing; a session-salted SHA-256 comparison key is retained only in the current tab so two snapshots can be compared without relying on a collision-prone four-character mask. The raw file and complete normalized report remain in current-session memory and are not written to browser persistent storage by default. `localStorage` is used only for non-sensitive preferences such as locale. Default share preview/copy/PNG output excludes holdings, account identifiers, the comparison key, and exact net liquidation value; a displayed capital division may still reveal a broad USD balance range. A PNG season card that the user deliberately downloads is a separate browser file and must be deleted from its download location if no longer wanted.

CSV is the required calculation input. A matching PDF is optional reconciliation evidence and is not currently parsed by the Web App. PDF-only does not create a ranked result.

## Project structure

```text
src/
  components/       reusable UI, including the Privacy & Data dialog
  data/             synthetic demo report
  lib/
    csv.ts          RFC-style CSV reader and primitive parsing
    ibkr.ts         IBKR section parser and season aggregation
    parseInWorker.ts  worker lifecycle, cancellation and timeout boundary
    reportSource.ts source/trust labels and synthetic/local boundaries
    season.ts       divisions and badge rules
    sessionIdentity.ts current-tab random comparison salt
    sha256.ts       synchronous SHA-256 for local content/account comparison
    snapshot.ts     duplicate and latest-snapshot replacement decisions
    shareCard.ts    browser-canvas PNG export
  pages/
    LedgerPage.tsx
    ArenaPage.tsx
    TrophiesPage.tsx
    ImportPage.tsx
  i18n.ts           three-locale dictionary
  types.ts          domain models
  workers/
    ibkrParser.worker.ts  worker-side file reading and parsing
public/
  sample-ibkr-ytd.csv
tests/
  fixtures/
    ibkr-current-schema-synthetic.csv
    README.md       fixture privacy statement, schema coverage, and expected equations
scripts/
  smoke-parser.mjs
  test-product-policy.mjs
  test-worker-boundary.mjs
docs/
  IPHONE_SAFARI_TEST_CHECKLIST.md  beginner-safe real-device test steps using only fictional CSV data
  PRIVATE_TEST_HOSTING_RESEARCH_2026-08-30.md  A + C private-host comparison, proposed gates and stop conditions
```

## Known MVP limitations

- The parser has been locally calibrated against one private English single-account 2026 YTD Activity Statement. The private source remains outside the repository; the committed current-schema fixture is fully synthetic, not a transformed or anonymized copy.
- The matching PDF has been manually cross-reconciled, but the Web App does not yet automate PDF checks.
- Other IBKR report variants, locales, account structures and future template changes still require fixtures and aliases.
- The Worker boundary prevents parsing from blocking the UI thread and enforces a total timeout, but near-limit performance still needs confirmation on the supported iOS/Safari 16.4+ baseline and on a protected Preview.
- Desktop keyboard/focus behavior and the principal narrow-screen surfaces have been checked, including at a simulated 320 px width. VoiceOver and real iPhone Safari have not been tested.
- Assignment and expiration are covered by the private calibration and synthetic fixture; exercise detection still lacks a qualified real or independently proven fixture.
- The arena is intentionally a synthetic interface demo; it is not a real public leaderboard.
- Ordinary user CSV uploads are Self-Reported and must not be labelled broker-verified.
- The two exact repository-owned fictional CSVs are matched by normalized SHA-256 content digest and labelled Fully Synthetic Test when imported; this does not detect whether arbitrary third-party statements are authentic or AI-edited.
- Capital-division thresholds are currently USD-only. Non-USD reports can be parsed locally, but their division remains unavailable until an explicit exchange-rate policy exists.
- Internal arithmetic closure is not proof that an uploaded statement is authentic; it is labelled only Internal Checks Passed.
- Season return is shown only when a usable IBKR TWR/YTD-return field exists.
- No server, account login, social feed, payment, automatic IBKR connection, or historical season archive yet.
- Badge art is currently a geometric placeholder system; original meme character artwork is a later visual workstream.

## Immediate next workstream

1. Continue the local product-integrity and security gates: surface conflicting underlying aliases, strengthen the Worker serialized-response boundary, localize parser errors, and automate the synthetic browser-import check.
2. Keep all hosting work deferred under the L decision. The researched routes remain reference material only.
3. Follow `docs/IPHONE_SAFARI_TEST_CHECKLIST.md` later to verify real iPhone Safari 16.4+ import, cancellation, timeout and share-card export with fictional data only.
4. Run VoiceOver checks on the supported real iPhone; do not treat the desktop keyboard or simulated-width result as a substitute. A public or Production release remains outside the approved current scope.

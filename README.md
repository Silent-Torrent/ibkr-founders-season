# P&L Arena — 2026 Founders Season

Privacy-first Web App MVP for analyzing an Interactive Brokers Year-to-Date Activity Statement and presenting annual stock-and-options performance as a season.

## Current coded checkpoint 0.5

The repository already contains:

- React + TypeScript + Vite application shell.
- English, Simplified Chinese, and Traditional Chinese UI.
- A three-locale Privacy & Data notice with explicit local-processing, storage, authenticity, PDF, disclaimer, and clearing boundaries.
- Accessible dialog behavior for the Privacy & Data notice: initial focus, contained Tab/Shift+Tab navigation, Escape and backdrop close, focus return, and background interaction lock.
- Local-only CSV reading; no server or database. File reading and parsing run in a dedicated Web Worker rather than on the UI thread.
- A 12-second total import timeout covers worker-side file reading, parsing and result return. A valid replacement, explicit cancel, Demo switch or page unmount terminates the old worker.
- Worker result caps stop reports with more than 5,000 underlyings, 25,000 lifecycle events or 100,000 source-reference occurrences from being copied back to the UI.
- Current-year YTD statement validation.
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
- Duplicate statements are detected, and older YTD snapshots are blocked from replacing a newer local snapshot.
- Downloadable PNG season card and copyable text summary.
- Responsive desktop and mobile layouts.
- Frozen browser support baseline: iOS 16.4+ and Safari 16.4+. The production build target is explicit and covered by a compatibility contract check; the development server is not used as proof of that floor.
- Desktop browser keyboard/focus checks have passed for page changes, both dialogs, controls, status messages, and focus return. A 320 px simulated narrow-screen check also covered bottom navigation, the Ledger table and share card, the Arena scroll region, the privacy dialog, and the symbol drawer. This is not a real-iPhone or VoiceOver result.
- Synthetic sample statement, a fully fictional current-schema regression fixture, and parser smoke tests.

## Run on macOS

### Easiest route

Double-click `START_MAC.command`. It checks Node.js, installs the pinned dependencies, runs the parser/type checks, and opens the local app. Keep the Terminal window open while using it.

### Terminal route

```bash
cd ibkr-founders-season
npm ci
npm run check
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`. Vite 8 requires Node.js 20.19+ or 22.12+.

## Frozen source-control and deployment boundary

- Browser support begins at iOS 16.4 and Safari 16.4.
- The remote must be a GitHub private repository.
- Git commits must use the user's approved GitHub `noreply` email rather than a personal email address.
- The only permitted external deployment in the current stage is an access-protected Vercel Preview.
- Do not create, publish, or expose a Vercel Production deployment or production domain. Public/Production release requires a separate future approval and release-gate review.
- The local `main` branch now tracks the private GitHub remote `Silent-Torrent/ibkr-founders-season`. Commits use the approved GitHub `noreply` identity, and this Mac connects through a repository-scoped read/write deploy key. An empty, Standard-Protected Vercel project exists with zero deployments. Vercel currently forces the first deployment to Production even when Preview is requested, so deployment is paused pending a new user decision.

## Validate before a commit

```bash
npm run check
```

This runs TypeScript checking, the parser smoke suite, the Worker lifecycle contract suite, the accessibility structure/keyboard contract suite, and the frozen browser-compatibility contract. Then run `npm run build`; only the production bundle is eligible for Safari/iOS 16.4 testing. The expected bundled sample result is:

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

A newer YTD statement replaces the older local season snapshot. Statements are never added together.

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

The selected CSV is converted to a filename-free browser `Blob`, then read and parsed inside a dedicated Web Worker. The current MVP does not have a backend. The raw file and complete normalized report remain in current-session memory and are not written to browser persistent storage by default. `localStorage` is used only for non-sensitive preferences such as locale. A PNG season card that the user deliberately downloads is a separate browser file and must be deleted from its download location if no longer wanted.

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
    season.ts       divisions and badge rules
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
  test-worker-boundary.mjs
docs/
  IPHONE_SAFARI_TEST_CHECKLIST.md  beginner-safe real-device test steps using only fictional CSV data
```

## Known MVP limitations

- The parser has been locally calibrated against one private English single-account 2026 YTD Activity Statement. The private source remains outside the repository; the committed current-schema fixture is fully synthetic, not a transformed or anonymized copy.
- The matching PDF has been manually cross-reconciled, but the Web App does not yet automate PDF checks.
- Other IBKR report variants, locales, account structures and future template changes still require fixtures and aliases.
- The Worker boundary prevents parsing from blocking the UI thread and enforces a total timeout, but near-limit performance still needs confirmation on the supported iOS/Safari 16.4+ baseline and on a protected Preview.
- Desktop keyboard/focus behavior and the principal narrow-screen surfaces have been checked, including at a simulated 320 px width. VoiceOver and real iPhone Safari have not been tested.
- Assignment and expiration are covered by the private calibration and synthetic fixture; exercise detection still lacks a qualified real or independently proven fixture.
- The arena is intentionally a synthetic interface demo; it is not a real public leaderboard.
- CSV uploads are self-reported and must not be labelled broker-verified.
- Season return is shown only when a usable IBKR TWR/YTD-return field exists.
- No server, account login, social feed, payment, automatic IBKR connection, or historical season archive yet.
- Badge art is currently a geometric placeholder system; original meme character artwork is a later visual workstream.

## Immediate next workstream

1. Resolve Vercel's forced-first-Production blocker without weakening the frozen access boundary. Do not retry the empty project's upload before a user decision; after a safe route is approved, verify Network/Storage, Worker response headers/MIME and security headers on the protected non-public deployment.
2. Follow `docs/IPHONE_SAFARI_TEST_CHECKLIST.md` to verify real iPhone Safari 16.4+ import, cancellation, timeout and share-card export with fictional data only.
3. Run VoiceOver checks on the supported real iPhone; do not treat the desktop keyboard or simulated-width result as a substitute.
4. Refine the dashboard after real-data density is known. A public or Production release remains outside the approved current scope.

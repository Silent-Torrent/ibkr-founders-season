# Verification record — coding checkpoint 0.5

Last updated: 2026-08-29

## Frozen release decisions and execution status

- The supported baseline is iOS 16.4+ and Safari 16.4+.
- The production build target is explicitly frozen to Chrome 111, Edge 111, Firefox 114, Safari 16.4, and iOS 16.4. A contract check also requires every standard `backdrop-filter` declaration to retain its Safari 16.4 `-webkit-` counterpart.
- TypeScript's application target/library guard is ES2022 to reduce accidental use of newer built-in APIs. This guard does not provide runtime polyfills or replace versioned browser testing.
- The remote must be a GitHub private repository, and commits must use the user's approved GitHub `noreply` email rather than a personal email address.
- The only permitted external deployment in the current stage is an access-protected Vercel Preview.
- A Vercel Production deployment or production domain must not be created, published, or exposed without a new explicit user decision.
- The local `main` branch tracks the private GitHub remote `Silent-Torrent/ibkr-founders-season`. Commits use the approved GitHub `noreply` identity, and a repository-scoped read/write deploy key authenticates this Mac.
- An empty Vercel project exists with Standard Protection enabled and build settings frozen to Vite, `npm ci`, `npm run build`, `dist`, and Node 22.x. It currently has zero deployments.
- A first upload explicitly requested as Preview was classified by Vercel as Production and received the default production alias. It was immediately removed; both generated URLs were then verified as `404 DEPLOYMENT_NOT_FOUND`. This is a failed release-gate attempt, not a successful Preview or Production release.
- These configuration checks do not establish a real iOS/Safari 16.4 pass; only the production bundle may be used for that later version/device test.

## Passed in the current workspace

- Synthetic 2026 YTD Activity Statement parsed without errors.
- Season P&L: 20,040 USD.
- Stock YTD MTM: 13,690 USD.
- Options YTD MTM: 6,350 USD.
- Six underlyings created.
- Five option lifecycle events detected.
- IBKR reported YTD total reconciled with a zero difference.
- Non-YTD period rejected.
- Multi-account file rejected.
- Combined assignment code (`A;P`) recognized.
- Explicit Forex performance classified as Other, not Stock.
- Current `Mark-to-Market Performance Summary` aliases covered by a synthetic compatibility test.
- Repository-safe `tests/fixtures/ibkr-current-schema-synthetic.csv` added. Every value, identifier and instrument in it is fictional; it is not copied, anonymized or transformed from a private statement.
- The current-schema fixture covers repeated and multiple header shapes, `Data`/`SubTotal`/`Total` rows, and the tested empty-record-type Total P/L row.
- Canonical fields are `reportedAllAssetsYtdMtm`, `parsedAllAssetsYtdMtm`, and `mtmReconciliationDifference`; signed difference tests confirm the direction is `reported - parsed`.
- The CSV accounting epsilon is fixed at `0.000001`.
- MTM, statement-period P/L, and NAV-bridge diagnostics all return `PASS_EXACT` for the current-schema fixture.
- Missing NAV components become `NOT_AVAILABLE` instead of being assumed to be zero; statement-period mismatches become visible warnings.
- A supported non-zero `Other` bucket remains a visible scope note but no longer falsely changes an otherwise exact reconciliation to `Review needed`.
- Major portfolio metrics, reconciliation checks, underlying metrics, and lifecycle events carry local `SourceRef` metadata. Tests confirm references omit raw rows, raw values, filenames and account identifiers.
- The Ledger provides expandable source references for major portfolio metrics and all three reconciliation checks.
- The symbol drawer provides expandable source references for total, stock, option, other, realized and current-unrealized values, and for every displayed lifecycle event.
- Source cards display only source type, section, one-based row, record type, field and technical header signature; they do not display raw rows, financial values, filenames, account identifiers or instrument values.
- CSV file reading and parsing run in a dedicated module Web Worker. The main thread passes a filename-free `Blob`, not a `File` or filename.
- The Worker has a 12,000 ms total timeout, explicit cancellation and single-settlement termination handling for success, parser failure, worker error, `messageerror`, malformed response, `postMessage` failure, abort and timeout.
- Valid replacement imports, explicit cancel, Demo switching and page unmount cancel the active worker. An invalid replacement file is rejected before it can cancel a valid active task.
- Worker output is rejected before main-thread transfer above 5,000 underlyings, 25,000 events or 100,000 source-reference occurrences.
- The 100,000-row CSV limit is enforced while rows are being read, rather than only after a full row table has been created.
- A dedicated Worker contract suite is included in `npm run check` and passed.
- A non-Activity Statement title is rejected.
- Unterminated quoted fields, oversized payloads, oversized individual fields, and row-exhaustion payloads are rejected by regression tests.
- Real TypeScript checking passed with installed dependencies.
- Production Vite build passed locally.
- Dependency lockfile created; installed dependency audit reported zero known vulnerabilities.
- A dedicated Privacy & Data dialog is available from both the desktop privacy card and the page footer.
- English, Simplified Chinese, and Traditional Chinese privacy copy covers local Worker parsing, current-tab memory, locale-only persistence, no statement upload, the Self-Reported authenticity limit, the optional and currently unparsed PDF boundary, the investment-advice disclaimer, and clearing instructions.
- The privacy dialog exposes `role="dialog"`, `aria-modal`, a labelled title and description, initial focus, Tab/Shift+Tab containment, Escape close, backdrop close, background interaction lock, and focus return to the opening control.
- The symbol drawer now uses the same modal focus, Escape, background-lock, scroll-lock and focus-return behavior, including native `summary` controls in its focus loop.
- Page changes update the document title and language, identify the current navigation item, and move focus to the main region without stealing focus on first load.
- Search, sorting, filters, table-detail actions, leaderboard cells, trophy lists/progress, copy feedback, and import messages now expose explicit accessibility semantics.
- The import live status sits outside the `aria-busy` subtree, cancellation has a localized polite announcement, and clearing a local report restores focus to the main region while announcing Demo status.
- The mobile Arena scroll region has a keyboard focus entry and visible focus indicator. The narrow share-card footer remains in normal flow to prevent overlap.
- Clearing browser-session data does not delete a PNG season card that the user deliberately downloaded; the three-locale privacy notice now states this boundary.

## Private real-statement calibration

- One private English single-account 2026 YTD CSV parsed successfully from outside the repository.
- The MTM, statement-period P/L, and NAV-bridge diagnostics all returned `PASS_EXACT` in a read-only local verification.
- All-assets YTD MTM matched the parsed Stocks + Options + Other detail sum at the fixed CSV epsilon.
- Stock, option, Forex/Other, TWR, statement period and account scope matched the independent CSV/PDF audit.
- Financial Instrument Information was used for option-underlying aliases.
- Assignment and expiration were observed; exercise remains unverified.
- The matching PDF key totals were manually reconciled; the app does not yet parse PDF.
- No private source file, identity, account number, position, trade or exact private total was copied into this repository.
- The full normalized report is no longer written to persistent browser storage by default.

## Local browser smoke check

- Desktop browser keyboard and focus checks passed for both the privacy dialog and symbol drawer: opening moves focus inside, Tab and Shift+Tab wrap at the boundaries, Escape closes, the background remains inert, and focus returns to the opening control.
- Both the sidebar and footer privacy controls opened the dialog. Backdrop close and the visible close controls worked.
- The privacy notice was visually checked in English, Simplified Chinese, and Traditional Chinese.
- At a simulated 320 px browser width, the bottom navigation, Ledger table, share card, Arena horizontal scroll region, privacy dialog, and symbol drawer remained contained. The table and Arena use their own scroll regions, and the share-card content no longer overlaps its footer. This was a desktop simulation, not a real iPhone test.
- The fully synthetic current-schema CSV imported successfully through the visible file chooser.
- The import completed through the Worker-backed path and changed the UI from Demo to Local Report.
- All three reconciliation checks displayed `PASS_EXACT`, and expandable source cards exposed only CSV section, one-based row, record type, field, and a technical header signature.
- The first underlying drawer exposed six source groups: total, stock, option, realized, current unrealized and one lifecycle event. Its source-card text contained neither currency/financial values nor the fictional instrument/contract values shown elsewhere in the drawer.
- Reloading the page returned to Demo, confirming that the complete imported report was not restored.
- Clearing an imported synthetic report from the Ledger returned focus to the main region and changed the polite report-status message to Demo.
- The revised privacy copy correctly states that parsed results remain only in the current tab session.
- Local CSP produced no browser console warnings or errors in this smoke check.
- A static source scan found no application `fetch`, XHR, WebSocket, external script, remote font or analytics endpoint.
- The private real statement was not selected in the browser test; it was verified only through the local command-line parser.

## Not yet verified

- The private source remains outside the repository. The synthetic current-schema fixture prevents regressions for the proven shapes but does not prove every IBKR variant.
- Automated PDF parsing/reconciliation is not implemented; current PDF comparison remains manual.
- Exercise remains uncovered by a qualified real or independently proven fixture.
- Protected-Preview header/Worker MIME inspection, complete Network/Storage instrumentation, near-5 MB responsiveness on the iOS/Safari 16.4+ baseline, real iPhone Safari and PNG export remain unverified.
- VoiceOver has not been tested. The desktop keyboard/focus pass and 320 px simulated-width pass do not establish real-device screen-reader accessibility.
- Node 25.8.1 was used for this local run; Node 22 LTS remains the recommended repeatable user environment.
- The private GitHub remote exists and the `main` history has been pushed successfully. The Vercel project exists but has zero deployments; the frozen Preview-only gate is blocked by Vercel's current forced-first-Production behavior.

# P&L Arena — 2026 Founders Season

Privacy-first Web App MVP for analyzing an Interactive Brokers Year-to-Date Activity Statement and presenting annual stock-and-options performance as a season.

## Current coded checkpoint 0.13

The repository already contains:

- React + TypeScript + Vite application shell.
- English, Simplified Chinese, and Traditional Chinese UI.
- A three-locale Privacy & Data notice with explicit local-processing, storage, authenticity, PDF, disclaimer, and clearing boundaries.
- Accessible dialog behavior for the Privacy & Data notice: initial focus, contained Tab/Shift+Tab navigation, Escape and backdrop close, focus return, and background interaction lock.
- Local-only CSV reading; no server or database. File reading and parsing run in a dedicated Web Worker rather than on the UI thread.
- A 12-second total import timeout covers worker-side file reading, parsing and result return. A replacement that passes the filename, non-empty and size preflight, an explicit cancel, a Demo switch or page unmount terminates the old worker before the replacement is parsed.
- A versioned Worker protocol validates both requests and complete returned reports on both sides. It rejects malformed objects, unknown fields, sparse arrays, invalid dates/currencies/hashes/numbers, unsafe diagnostics, or parser facts that disagree with the returned TWR evidence and deterministic warnings. It also rejects files above 5 MiB, salts outside 16–128 characters, and reports above the unpaginated-UI budgets. Shared `reportCapacity` constants keep the parser and final Worker validator aligned at 500 retained underlyings, 1,000 deduplicated lifecycle events, 256 distinct section strings after known IBKR codes are mapped to names, 20,000 total source-reference occurrences, 501 references in one rendered collection (500 detail references plus one broker-total reference), 25,000 total array items, 1,000,000 actual string characters, and the same per-field length/control-character limits for input-derived report strings.
- The production IBKR parser now tokenizes CSV one logical row at a time instead of first constructing a full-file `string[][]`. It materializes records only for the registered sections consumed by the parser. Financial Instrument Information (FII) is handled by a second row-by-row scan: scope, schema, identity, and alias conflicts are still checked globally, including unused aliases, while underlying mappings and source references are retained only for aliases the accounting/event sections actually need. A CSV row may contain at most 4,096 fields; a 4,097th field returns the fixed `csv_too_many_fields` diagnostic.
- The parser returns the fixed `report_capacity_exceeded` diagnostic before constructing or appending the 1,001st deduplicated final event, and before portfolio aggregation or `PortfolioReport` construction when a 501st symbol satisfies the existing retained-output predicate. Known section codes are mapped to names during the selective first scan; exactly 256 distinct exact section strings remain allowed, and a 257th returns the same fixed diagnostic before the FII second pass or report construction. During parsing, explicit canonical-key collectors retain at most 501 accepted source references plus one overflow sentinel; repeated references do not consume the boundary, invalid-number evidence retains only its first reference, and large invalid-reference arrays are never spread into function arguments. Per-collection and 20,000-total-occurrence checks run before report construction. After the report is assembled, its input-derived strings and actual item/string footprint must also fit the shared Worker budgets, so an overlong field or long-reference report returns the fixed capacity error instead of degrading to `worker_failure`; the aggregate string budget may fail earlier than the independent 20,000-reference maximum. The final Worker schema validator repeats every output boundary.
- A runtime-only fully fictional capacity generator combines four headline exact caps: 5,242,880 bytes (5 MiB), 100,000 rows, 500 underlyings, and 1,000 assignment/expiration events. The production-Chrome gate imports and renders it through the real Worker, measures main-thread gaps, searches the last underlying, opens its event drawer, exercises the visible cancel control and confirms Worker termination. Separate 501-symbol and 1,001-event adversarial CSVs are each padded to exactly 5 MiB and 100,000 rows; both return the fixed capacity error through the production Worker in under 10 seconds, terminate that Worker, and preserve the prior 500-row report. A 5 MiB plus one-byte file is rejected before a Worker starts. Every generated CSV is deleted with the isolated browser profile and is not shipped or committed as a large fixture.
- A dedicated selective-materialization regression adds two more exact-5-MiB/100,000-row statements with 20,000 valid, alias-and-description-unique option FII rows that are never referenced, placing that noise both before and after the consumed FII block. Both orders preserve the same core symbol, event, P&L, and source references. Separate cases scan and cross-check 10,000 distinct FII/Trades mapping candidates while retaining one final symbol, and deduplicate 25,001 identical valid Trades rows into one final event. The 10,000 candidates are not claimed as 10,000 final demanded mappings. A Node 22 same-machine process measurement reduced the ordinary exact-capacity fixture's observed `maxRSS` increase from roughly 48 MiB before this change to roughly 10 MiB now. That comparison is a diagnostic proxy, not an automated threshold, browser-Worker measurement, real-iPhone peak-memory result, or release claim.
- Strict current-year YTD validation that rejects nonexistent dates, reversed periods, future period ends, and non-current seasons.
- Consistent three-letter base-currency validation with a crash-safe display fallback.
- Heterogeneous IBKR CSV parser with section-scoped repeated headers and explicit source-selection rules.
- Exact normalized section allowlists: registered full section names and known IBKR section codes are accepted. BOS descriptions are treated as non-authoritative metadata; generic partial names such as `Summary` cannot impersonate an accounting section or leak `Statement` metadata into the Total P/L check.
- Strict field-specific English-CSV grammar: unitless accounting amounts accept ordinary decimals, correctly grouped commas, signs, and accounting parentheses; TWR fields separately accept percentages. Currency comes from its own validated field. Currency wrappers, embedded letters, exponent notation, loose whitespace (including inside accounting parentheses), malformed grouping/parentheses, and empty currency markers are rejected rather than rewritten.
- Decimal-safe aggregation and signed-difference checks reject values whose exact result cannot cross the Number-based Worker contract without precision loss. Required accounting placeholders cannot become zero silently. Duplicate or partially drifted accounting schemas, repeated detail rows, conflicting broker totals/section sources, mandatory metadata, and critical headers with no following data fail closed. Detail Asset Class values cannot be blank. MTM row components must equal their row total when IBKR exposes the complete component set; every present per-asset subtotal must also equal the exact detail block for each exposed accounting metric, and later details cannot reopen a closed asset subtotal. An All Assets total must have a standalone neutral identity and cannot be a SubTotal or coexist with a contradictory asset identity. Current Flex layouts without the retired `Other` field still require Position, Transaction, Commissions, row totals, and section-level reconciliation, but the hidden retired component cannot be independently reconstructed. Total/SubTotal rows never become instruments. Realized/unrealized component and combined totals are checked. Exposed Account ID and Model scope on YTD, realized/FIFO, Financial Instrument Information, and selected event sections must remain the same full account. Row-oriented NAV must close Current Long + Current Short to Current Total, Prior + Change to Current, and detail rows to the broker Total; current wide Flex NAV requires the complete registered asset field set, closes it to `Total`, requires any embedded Account ID/Report Date to agree with the statement, and rejects non-empty Model slices. Ordinary `Cash` is matched exactly rather than confused with `SLB Cash Collateral`. A present horizontal or vertical Cash Report must expose exactly one base-currency ending balance, and NAV cash must agree with it when both exist.
- YTD mark-to-market aggregation by underlying.
- MTM and Month/YTD (`PLUI`) are validated as separate official schema families, including separate instrument-mapping source lists. Either can be used alone. When both coexist, each family keeps its own field contract and must close internally for the mixed-source gate, expose the same exact all-assets YTD MTM, and match every exact normalized broker-asset-category + underlying bucket after MTM option contracts are aggregated to their underlying. MTM remains the sole Season P&L source so the second section can never double-count performance. A dedicated realized/FIFO section is authoritative for realized explanation values; only validated Month/YTD realized fields are a warned fallback when that section is absent. Recognized realized fields in MTM and return fields in Month/YTD/PLUI—including a return alias hidden in a `Field Name`/`Field Value` pair—are schema conflicts, not alternate sources.
- Explicit CFD categories, Options on Futures, Futures Options, and other unverified products remain in the `Other` bucket. They cannot be counted as stock or supported equity/index options merely because their labels contain `Equity`, `Stock`, or `Option`.
- Deterministic option-underlying alias handling: repeated rows and synonym columns that agree merge their deduplicated source references within a bounded collector. An overflow that propagates into a rendered report collection fails closed; an unused internal mapping remains bounded but does not reject an otherwise safe report. Conflicting `Underlying`/`Underlying Symbol` columns or disagreement between Trades/YTD/realized rows and FII reject the whole report instead of silently using row or column order.
- Canonical accounting fields `reportedAllAssetsYtdMtm`, `parsedAllAssetsYtdMtm`, and `mtmReconciliationDifference`, with the signed difference defined as `reported - parsed`.
- Three reconciliation checks for all-assets MTM, statement-period P/L, and the NAV bridge, using a fixed CSV epsilon of `0.000001`.
- Local `SourceRef` provenance for portfolio metrics, reconciliation checks, underlying metrics, and lifecycle events. References retain normalized technical section/field aliases plus record type/row/header metadata, not original section codes, BOS descriptions, raw headers, raw values, or raw rows.
- Expandable source references in the Ledger for major portfolio metrics and the three reconciliation checks.
- Per-underlying source drawers for total, stock, option, other, realized and current-unrealized metrics, plus each detected lifecycle event.
- Stock, option, and Other MTM plus realized/current-unrealized explanation fields; realized-only instruments are retained even when their YTD MTM is zero.
- Assignment, exercise, and expiration event detection from `Data` records only. Total/SubTotal rows are ignored as events and cannot suppress the Trades fallback when a dedicated lifecycle section contains no real event row.
- Ledger, Arena Demo, Trophies, and Import pages.
- Current-session memory for the latest accepted YTD snapshot; the complete report is not persisted by default.
- Duplicate statements are detected, older YTD snapshots are blocked, and a different same-date file cannot silently replace the current account-season snapshot.
- Downloadable PNG season card and copyable text summary whose default outputs omit underlying symbols, account identifiers, and exact net liquidation value.
- Explicit Synthetic Demo, Fully Synthetic Test, Self-Reported, and Internal Checks Passed statuses. “Internal Checks Passed” appears only when every configured reconciliation check passed; unavailable checks require review. Local results are unranked, synthetic data does not unlock achievements, and missing or non-USD NAV does not invent a USD capital division.
- Responsive desktop and mobile layouts.
- Frozen browser support baseline: iOS 16.4+ and Safari 16.4+. The production build target is explicit and covered by a compatibility contract check; the development server is not used as proof of that floor.
- Desktop browser keyboard/focus checks have passed for page changes, both dialogs, controls, status messages, and focus return. A 320 px simulated narrow-screen check also covered bottom navigation, the Ledger table and share card, the Arena scroll region, the privacy dialog, and the symbol drawer. This is not a real-iPhone or VoiceOver result.
- All parser/import diagnostics are fixed structured codes rendered in English, Simplified Chinese, or Traditional Chinese at display time. No unvalidated free-form statement text, filename, account identifier, or holding value is interpolated; dynamic fields are limited to the validated current year and normalized signed MTM difference/currency.
- Synthetic sample statement, a fully fictional current-schema regression fixture, parser/Worker/product-policy suites, and an automated production-build import/download/capacity test in a real local headless Chrome. That browser test confirms the real module Worker path, three exact reconciliations, a 320 px readable invalid-file state, a downloaded and decoded 1200×1500 PNG with privacy canaries, no synthetic ranking/achievement, refresh-to-Demo behavior, an import at the exact file/row/symbol/event caps, visible cancellation with Worker termination, exact-5-MiB/100,000-row 501-symbol and 1,001-event fixed-capacity failures, oversized-file preflight, and no external page request or POST.

## Run on macOS

### Easiest route

For ordinary daily use, double-click `START_MAC.command`. It selects the supported Node.js 22 runtime, checks the local dependency tree, installs the pinned dependencies only when they are missing or the dependency manifests have changed, and opens the local app on `127.0.0.1`. A first or repair installation may require network access. Keep the Terminal window open while using it; closing that window stops the local site. It does not upload or deploy anything.

After code changes or before a handoff, double-click `VERIFY_MAC.command`. That separate full gate performs a clean locked install, dependency audit, every automated test—including the isolated production-Chrome import/PNG regression—and a final production build. The install and vulnerability audit require network access. Google Chrome or Chrome Canary must be installed in the standard macOS Applications folder for this full verification route.

### Terminal route

```bash
cd ibkr-founders-season
export PATH="/opt/homebrew/opt/node@22/bin:/usr/local/opt/node@22/bin:$PATH"
node --version
npm ci
npm run check
npm run dev -- --host 127.0.0.1
```

`node --version` must show Node 22.12 or newer within the Node 22 line; this Mac currently uses v22.23.2. Repeat the `export PATH=...` line in each new Terminal window. The full check also requires Google Chrome or Chrome Canary. If its executable is not in a standard macOS Applications location, run `export CHROME_PATH="/absolute/path/to/Chrome"` before `npm run check`. Open the local URL printed by Vite, normally `http://127.0.0.1:5173`.

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

This runs TypeScript checking, the parser smoke and selective-materialization suites, the strict Worker protocol suite, the accessibility structure/keyboard contract suite, the frozen browser-compatibility contract, the product-policy/privacy suite, the macOS launcher static role/syntax contract, and a real local Chrome import/PNG regression against a freshly built production bundle. `VERIFY_MAC.command` also performs the locked install, vulnerability audit, and a final production build. The automated Chrome result does not establish the frozen Safari/iOS baseline. The expected bundled sample result is:

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

The selected CSV is converted to a filename-free browser `Blob`, then read and parsed inside a dedicated Web Worker. The current MVP does not have a backend. The raw file/Blob is held only for the active parse task and is not retained after completion. The raw account identifier is discarded after parsing; a session-salted SHA-256 comparison key is retained only in the current tab so two snapshots can be compared without relying on a collision-prone four-character mask. Only the normalized report remains in current-session memory, and it is not written to browser persistent storage by default. `localStorage` is used only for non-sensitive preferences such as locale. Default share preview/copy/PNG output excludes holdings, account identifiers, the comparison key, and exact net liquidation value; a displayed capital division may still reveal a broad USD balance range. A PNG season card that the user deliberately downloads is a separate browser file and must be deleted from its download location if no longer wanted.

CSV is the required calculation input. A matching PDF is optional reconciliation evidence and is not currently parsed by the Web App. PDF-only does not create a ranked result.

## Project structure

```text
src/
  components/       reusable UI, including the Privacy & Data dialog
  data/             synthetic demo report
  lib/
    csv.ts          row-by-row RFC-style CSV tokenizer and primitive parsing
    ibkr.ts         IBKR section parser and season aggregation
    parserDiagnostics.ts fixed diagnostic schema and three-locale presentation
    parseInWorker.ts  worker lifecycle, cancellation and timeout boundary
    reportCapacity.ts shared parser/Worker report-capacity constants
    workerOutputLimits.ts strict Worker report schema and final capacity validation
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
  favicon.svg
  sample-ibkr-ytd.csv
tests/
  fixtures/
    ibkr-current-schema-synthetic.csv
    README.md       fixture privacy statement, schema coverage, and expected equations
scripts/
  smoke-parser.mjs
  measure-parser-memory.mjs diagnostic same-machine parser-memory proxy
  synthetic-capacity-statement.mjs runtime-only fictional boundary generator
  test-parser-materialization.mjs deterministic selective-materialization pressure regression
  test-browser-import.mjs
  test-mac-launchers.mjs
  test-product-policy.mjs
  test-worker-boundary.mjs
docs/
  CAPACITY_BROWSER_EVIDENCE_2026-08-31.md  production-Chrome exact-capacity and cancellation evidence
  PARSER_MATERIALIZATION_EVIDENCE_2026-08-31.md  row-tokenizer, selective-materialization, and memory-proxy evidence
  IPHONE_SAFARI_TEST_CHECKLIST.md  beginner-safe real-device test steps using only fictional CSV data
  OPTION_EXERCISE_EVIDENCE_2026-08-30.md  official semantics review and exact evidence still required
  PRIVATE_TEST_HOSTING_RESEARCH_2026-08-30.md  A + C private-host comparison, proposed gates and stop conditions
```

## Known MVP limitations

- The checkpoint 0.13 codebase retains the read-only calibration against one private English single-account 2026 YTD Activity Statement; all three reconciliation checks passed exactly and its source hash remained unchanged. The private source remains outside the repository; the committed current-schema fixture, mixed-YTD cases, and runtime capacity inputs are fully synthetic, not transformed or anonymized private data.
- The matching PDF has been manually cross-reconciled, but the Web App does not yet automate PDF checks.
- Other IBKR report variants, locales, account structures and future template changes still require fixtures and aliases.
- Custom wide Flex NAV queries that omit any registered asset field, or contain a non-empty `Model`, deliberately fail closed; checkpoint 0.9 supports only the full-account, full-field wide NAV contract.
- A file containing both MTM and Month/YTD is accepted only when the two independently valid sections match exactly by all-assets YTD MTM and by every normalized broker-asset-category + underlying bucket. Missing keys, raw category changes, bucket swaps, Model slices, account mismatch, structural drift, or even a one-micro-unit cross-source difference fail closed. This compatibility gate is arithmetic consistency, not proof that the statement is genuine.
- The Worker boundary prevents parser work from blocking the UI thread, enforces a total timeout, and validates its serialized protocol. A fully fictional file at the exact byte/row/symbol/event caps passed the automated macOS production-Chrome responsiveness gate, but boundary performance still needs confirmation on the supported iPhone/Safari 16.4+ baseline. Protected-host testing remains deferred with all deployment work.
- The parser now rejects the 1,001st deduplicated final event before constructing or appending it, rejects the 501st retained normalized symbol before portfolio aggregation and `PortfolioReport` construction, and prechecks source-reference collection/occurrence limits before building the report. It then checks the assembled result's actual aggregate item/string footprint before returning it. The Worker repeats the complete serialized-output validation as defense in depth.
- This is not streaming input validation. The Worker still calls `Blob.text()`, so every accepted Blob is fully decoded into one JavaScript string before parsing. The parser no longer constructs a full-file `string[][]` and retains records only for consumed sections, but it scans the text twice because FII uses a separate row-by-row pass. True `Blob.stream()` ingestion, incremental hashing, and a single-pass streaming parser are not implemented. The 5 MiB, 100,000-row, and 12-second limits remain the outer resource bounds. The roughly 10 MiB current-versus-48 MiB previous same-machine `maxRSS` increase is only a Node process proxy; real browser-Worker and iPhone/Safari peak-memory headroom remains unmeasured.
- The Worker protocol checks the structure and internal consistency of the trusted same-origin parser result. It is not cryptographic proof that an uploaded statement came from IBKR, so local imports remain Self-Reported.
- A structurally valid report above the current UI capacity caps fails closed with the fixed capacity diagnostic. A future larger-account workflow still needs pagination/virtualization before raising those limits.
- Desktop keyboard/focus behavior and the principal narrow-screen surfaces have been checked, including at a simulated 320 px width. VoiceOver and real iPhone Safari have not been tested.
- Assignment and expiration are covered by the private calibration and synthetic fixture; exercise detection still lacks a qualified real or independently proven CSV fixture. The official-source review in `docs/OPTION_EXERCISE_EVIDENCE_2026-08-30.md` confirms the semantics but deliberately does not invent the missing CSV serialization.
- The arena is intentionally a synthetic interface demo; it is not a real public leaderboard.
- Ordinary user CSV uploads are Self-Reported and must not be labelled broker-verified.
- The two exact repository-owned fictional CSVs are matched by normalized SHA-256 content digest and labelled Fully Synthetic Test when imported; this does not detect whether arbitrary third-party statements are authentic or AI-edited.
- Capital-division thresholds are currently USD-only. Non-USD reports can be parsed locally, but their division remains unavailable until an explicit exchange-rate policy exists.
- Internal arithmetic closure is not proof that an uploaded statement is authentic; it is labelled only Internal Checks Passed.
- Season return is shown only when a usable explicit return field exists in MTM, NAV, or Change in NAV. Month/YTD/PLUI cannot supply it.
- No server, account login, social feed, payment, automatic IBKR connection, or historical season archive yet.
- Badge art is currently a geometric placeholder system; original meme character artwork is a later visual workstream.

## Immediate next workstream

1. Obtain a qualified exercise-event fixture, then expand parser compatibility only from independently proven IBKR shapes rather than guesses.
2. Keep all hosting work deferred under the L decision. The researched routes remain reference material only.
3. Follow `docs/IPHONE_SAFARI_TEST_CHECKLIST.md` later for real iPhone Safari/VoiceOver and boundary-capacity checks with developer-certified fictional data only; the desktop-Chrome capacity pass, selective-materialization Node regressions, memory proxy, and simulated widths are not substitutes. A public or Production release remains outside the approved current scope.
4. Treat visual refinement and original trophy artwork as a later workstream after calculation, privacy, and supported-device gates are stable.

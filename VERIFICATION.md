# Verification record — coding checkpoint 0.11

Last updated: 2026-08-31

## Frozen release decisions and execution status

- The supported baseline is iOS 16.4+ and Safari 16.4+.
- The production build target is explicitly frozen to Chrome 111, Edge 111, Firefox 114, Safari 16.4, and iOS 16.4. A contract check also requires every standard `backdrop-filter` declaration to retain its Safari 16.4 `-webkit-` counterpart.
- TypeScript's application target/library guard is ES2022 to reduce accidental use of newer built-in APIs. This guard does not provide runtime polyfills or replace versioned browser testing.
- The remote must be a GitHub private repository, and commits must use the user's approved GitHub `noreply` email rather than a personal email address.
- The earlier access-protected Vercel Preview authorization is paused because the provider forced the first request into Production.
- The user selected A + C on 2026-08-30: keep Vercel at zero deployments and research alternatives only. No alternate host, external upload, Production deployment, or public domain is approved without a new explicit user decision.
- The user then selected L: continue local/private-GitHub development and defer all deployment discussion until the local product is ready.
- The local `main` branch tracks the private GitHub remote `Silent-Torrent/ibkr-founders-season`. Commits use the approved GitHub `noreply` identity, and a repository-scoped read/write deploy key authenticates this Mac.
- An empty Vercel project exists with Standard Protection enabled and build settings frozen to Vite, `npm ci`, `npm run build`, `dist`, and Node 22.x. It currently has zero deployments.
- A first upload explicitly requested as Preview was classified by Vercel as Production and received the default production alias. It was immediately removed; both generated URLs were then verified as `404 DEPLOYMENT_NOT_FOUND`. This is a failed release-gate attempt, not a successful Preview or Production release.
- The A + C research created no alternate account, project, token, Git integration, deployment or billing relationship. Its candidate findings and proposed, unapproved gates are recorded in `docs/PRIVATE_TEST_HOSTING_RESEARCH_2026-08-30.md`.
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
- Explicit `Equity CFD` performance classified as Other, not Stock; the rule gives `CFD` precedence over the broader equity/stock keywords.
- Explicit `Options on Futures` and `Futures Options` remain Other; only registered equity/index-option categories enter the supported option bucket.
- Unitless amount parsing accepts supported decimal, grouped-comma, sign, and accounting-parentheses forms. TWR uses a separate percentage parser; currency is read from its own validated field. Currency wrappers, embedded letters, exponent notation, loose whitespace (including inside accounting parentheses), malformed comma grouping/parentheses, and empty currency markers are rejected rather than stripped or coerced.
- Exact decimal aggregation and signed-difference checks cover ordinary decimal drift, large-value cancellation, unsafe aggregate output, and the Worker boundary. Required placeholders, empty detail Asset Class values, partially drifted repeated headers, dangling critical headers without data, duplicate recognized numeric/identity columns, raw trailing-digit fake aliases, repeated accounting rows, row-component/total mismatches, per-asset subtotal/detail mismatches even when the subtotal is internally self-consistent, a detail appended after its asset subtotal, and a subtotal or contradictory identity impersonating All Assets all fail closed. Total/SubTotal rows are excluded from instrument aggregation. Row-oriented and wide-Flex NAV equations/metadata, absent/data-less/drifted base-currency Cash Report fields, NAV-vs-Cash-Report cash, period sources, and alternative section sources are also covered. Horizontal and standard vertical Cash Report layouts are accepted, and exact NAV `Cash` is kept distinct from `SLB Cash Collateral`. The official current Flex MTMP layout without the retired `Other` field and full-field account-level wide `EQUT`/`EQUS` NAV layouts are accepted; partial component selection and non-empty Model slices fail closed. When MTMP omits retired `Other`, the remaining official components are required but cannot independently prove the hidden component's value.
- Section lookup uses exact normalized aliases after hard-coded known-code canonicalization. BOS descriptions are ignored as non-authoritative metadata. Synthetic tests confirm that a generic `Summary` or unknown BOS code cannot impersonate YTD MTM/realized performance, and numeric `Statement` metadata cannot leak into the Total P/L reconciliation.
- Registered MTM, Month/YTD, realized/unrealized, NAV, Cash Report, Trades, and lifecycle names/codes are tested individually. Checkpoint 0.10 also tests family-correct MTM + Month/YTD coexistence: both sources are validated independently, the production mapping selector excludes the opposite YTD family even if a caller contaminates its shared-source list, option contracts normalize to their underlying, exact normalized broker-category + underlying maps and all-assets totals must match, source order cannot change the result, and only MTM contributes Season P&L. The dedicated realized/FIFO section overrides Month/YTD realized explanation fields; those Month/YTD fields are used only when the dedicated section is absent and the existing missing-section warning remains. Recognized realized fields in MTM and both direct-column and `Field Name`/`Field Value` return aliases in Month/YTD/PLUI fail closed. Same-family duplicates, raw-category/key/bucket shifts, relabelled field families, account/Model scope changes, equal-amount alias swaps, opaque MTM option contracts, and a one-micro-unit cross-source difference fail closed. Lifecycle tests prove that a SubTotal row cannot become an event or suppress valid Trades fallback events, while duplicate type columns, unknown types, and non-option `Data` rows are rejected before any fallback decision.
- Financial Instrument Information aliases now use order-independent candidate sets. Repeated Symbol/Description aliases that agree retain every mapping source row; duplicate conflicting FII identity columns, a normalized alias pointing to different underlyings, or another-account/non-empty-Model FII fail closed. Explicit Underlying values in Trades, YTD, and realized/unrealized rows must agree with FII, and simultaneous `Underlying`/`Underlying Symbol` columns must agree regardless of column order. Exposed scope is also checked on realized/FIFO and selected event rows. Tests cover all of these paths plus merged provenance for agreeing Underlying synonyms.
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
- Worker protocol version 1 requires an exact request envelope, a validated current-time reference, a 16–128 character comparison salt, and a filename-free `Blob` no larger than 5 MiB. The same time reference is used for current-season validation and must exactly match the returned report's `importedAt` timestamp.
- A replacement that passes the filename, non-empty and size preflight, explicit cancel, Demo switching and page unmount cancel the active worker. Files that fail that preflight do not cancel active work; a content-invalid CSV can pass preflight, replace the active task and then fail parsing.
- Worker output is validated before posting and again on the main thread. Validation covers the complete `ParseResult`/`PortfolioReport`, exact plain-object keys, dense arrays, finite numbers, dates, hashes, account masks, currencies, enums, diagnostic severity/parameters, CSV-only source references, reconciliation evidence/status semantics, fixed parser facts, and total item/string budgets. The TWR-conflict fact must also match the independently inferable combination of an absent return value and retained return source references; both fixed facts must match their deterministic warnings in both directions. Unknown keys, accessors, sparse arrays, `NaN`/Infinity, unsupported PDF provenance, evidence-free PASS states, substantive warnings paired with green quality, or malformed nested objects are rejected with a fixed `worker_failure` diagnostic.
- This protocol is a same-origin structure and consistency boundary, not cryptographic broker attestation. It cannot turn a user-supplied CSV into a Verified or Broker-Sourced result.
- To match the current unpaginated UI, hard output caps are 500 underlyings, 1,000 events, 20,000 total source-reference occurrences, and 501 references in one collection (500 detail references plus one broker-total reference). Additional caps cover diagnostics, sections, 25,000 total array items, and 1,000,000 total string characters.
- The 100,000-row CSV limit is enforced while rows are being read, rather than only after a full row table has been created.
- A dedicated Worker contract suite is included in `npm run check` and passed.
- A runtime-only fully fictional generator produces a deterministic statement at four headline exact caps: 5,242,880 bytes, 100,000 rows, 500 underlyings and 1,000 assignment/expiration events. Direct parser/Worker-boundary checks confirm exact counts, one assignment plus one expiration per symbol, exact MTM closure, and an accepted serialized result. Separate real CSVs with 501 symbols and 1,001 events are parsed but rejected by the Worker-output contract. No multi-megabyte CSV is committed or shipped.
- All 40 parser/import diagnostic codes have English, Simplified Chinese, and Traditional Chinese messages. Runtime validation permits dynamic values only for the fixed current year and signed MTM difference/currency fields; invalid diagnostics fall back to a fixed message without echoing untrusted input. Ledger warnings retranslate when the interface locale changes.
- Calendar dates are parsed strictly. Nonexistent dates, reversed statement periods, future period ends, and prior-season reports are rejected instead of being normalized or accepted silently.
- A same-account, same-season report with the same ending date but different content is rejected; duplicate, older, newer, and different-account snapshot decisions have dedicated regression cases.
- Base currency must resolve to one consistent three-letter code. Missing, malformed, and conflicting currency declarations are rejected, and display formatting falls back to an em dash instead of crashing on an invalid code.
- Synthetic Demo, Fully Synthetic Test, Self-Reported, and Internal Checks Passed are separate UI concepts. The two repository-owned fictional CSVs are matched by normalized SHA-256 content digest plus a synthetic account marker; this is not a general authenticity detector. Internal arithmetic closure is not labelled `Reconciled`, broker-verified, or authentic.
- A missing account identifier returns a fixed parser error and no report. Cross-file account identity uses a session-salted SHA-256 comparison key, not the masked suffix; the raw identifier and session salt are not displayed, logged, persisted, or shared.
- Imported user results appear in Arena as an unranked current-tab snapshot. The synthetic leaderboard does not insert a fake local rank, synthetic data unlocks no achievements, and missing or non-USD NAV does not create an inferred USD capital division. Fixed monetary achievement thresholds are also USD-only until an exchange-rate policy exists.
- Internal Checks Passed is shown only when every configured reconciliation has `PASS_EXACT` or `PASS_ROUNDED`. A missing check produces Review; the bundled sample and Demo no longer present two unavailable checks as passed.
- The default share-card preview, copied summary, and generated PNG omit underlying symbols, account identifiers, and exact net liquidation value. A displayed USD capital division can still reveal a broad balance range. Product-policy canary tests cover all three outputs.
- A dedicated product-policy suite covering trust labels, local ranking boundaries, achievements, share privacy, snapshot rules, missing-value semantics, and currency display safety is included in `npm run check` and passed.
- A non-Activity Statement title is rejected.
- Unterminated quoted fields, oversized payloads, oversized individual fields, and row-exhaustion payloads are rejected by regression tests.
- Real TypeScript checking passed with installed dependencies.
- Production Vite build passed locally.
- Dependency lockfile created; installed dependency audit reported zero known vulnerabilities.
- After the checkpoint 0.11 capacity/cancellation hardening, the clean install, zero-vulnerability dependency audit, full check suite, real local production-Chrome import/PNG/capacity regression, and production build all passed with Node 22.23.2 and npm 10.9.8.
- Both beginner-facing macOS scripts select a working Node 22.12+ runtime without exposing errors from this Mac's broken default Node 25 loader. `VERIFY_MAC.command` retains the clean install, audit, full checks and build; `START_MAC.command` conditionally repairs only missing/changed locked dependencies and otherwise starts the local site without repeating the full gate. Their shell syntax and separate roles have an automated contract test.
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

- One private English single-account 2026 YTD CSV parsed successfully from outside the repository after the checkpoint 0.10 mixed-YTD changes.
- The MTM, statement-period P/L, and NAV-bridge reconciliation checks all returned `PASS_EXACT` in that final read-only local verification.
- All-assets YTD MTM matched the parsed Stocks + Options + Other detail sum at the fixed CSV epsilon.
- Stock, option, Forex/Other, TWR, statement period and account scope matched the independent CSV/PDF audit.
- Financial Instrument Information was used for option-underlying aliases.
- Assignment and expiration were observed; exercise remains unverified.
- The matching PDF key totals were manually reconciled; the app does not yet parse PDF.
- No private source file, identity, account number, position, trade or exact private total was copied into this repository.
- A SHA-256 comparison before and after the final parser run confirmed that the private source file was unchanged.
- The full normalized report is no longer written to persistent browser storage by default.

## Local browser smoke check

- `npm run check` now builds the production bundle and drives a fresh isolated system Chrome profile through the DevTools protocol; it does not substitute the Vite development server for the browser regression.
- The automated test selected `tests/fixtures/ibkr-current-schema-synthetic.csv` through the actual file input, observed the dedicated module Worker target/chunk, and fixed both page and Worker time to 2026-08-30 for a stable current-season test.
- The automated run rendered three underlyings, rounded Season P&L `+$740`, all three reconciliation checks as exact, no synthetic local ranking, no unlocked synthetic achievement, and returned to Demo after refresh.
- The same production-browser run generated a temporary exact-capacity CSV: 5,242,880 bytes, 100,000 rows, 500 fictional underlyings and 1,000 fictional assignment/expiration events. It observed the busy state, clicked the visible cancel control, confirmed the cancellation announcement and removal of the cancelled Worker target, waited beyond the 12-second timeout window for any late navigation, then completed a fresh import and rendered all 500 rows.
- The exact-capacity Ledger search returned the final underlying, whose drawer showed one assignment, zero exercises and one expiration. Real CSVs with 501 symbols and 1,001 events both produced the fixed safe failure, terminated their Workers and preserved the prior 500-row report. A 5 MiB plus one-byte `.csv` was rejected before any new Worker target was created.
- The final checkpoint 0.11 verification measured 857.8 ms from probe start through completed 500-row render plus the next timer/animation frame, a 17.7 ms maximum animation-frame gap, a 72.8 ms maximum timer gap, a 55.0 ms maximum observed long task, and a 15.0 ms search update measured from before dispatch. Every run enforces a sub-10-second total gate, sub-250-ms frame/timer/long-task gates, and a sub-500-ms search gate; these warm-path desktop figures are rerun evidence, not a cold-start or iPhone benchmark.
- Runtime instrumentation observed no external page request, no POST, no HTTP error, and no console/runtime/log error. This is a local production-bundle check, not the still-deferred deployed Network/Storage gate.
- Desktop browser keyboard and focus checks passed for both the privacy dialog and symbol drawer: opening moves focus inside, Tab and Shift+Tab wrap at the boundaries, Escape closes, the background remains inert, and focus returns to the opening control.
- Both the sidebar and footer privacy controls opened the dialog. Backdrop close and the visible close controls worked.
- The privacy notice was visually checked in English, Simplified Chinese, and Traditional Chinese.
- At a simulated 320 px browser width, the bottom navigation, Ledger table, share card, Arena local-snapshot card and horizontal scroll region, privacy dialog, and symbol drawer remained contained. The document width stayed at 320 px without whole-page horizontal overflow. This was a desktop simulation, not a real iPhone test.
- A content-invalid `.csv` produced a visible alert in desktop Chrome at a simulated 320 px viewport. Its computed text size was at least 14 px with at least 21 px line height, and neither the message nor the document overflowed the viewport.
- The fully synthetic current-schema CSV imported successfully through the visible file chooser.
- The import completed through the Worker-backed path and changed the UI from Demo to Fully Synthetic Test.
- The known fictional fixture was labelled Fully Synthetic Test, not Self-Reported. It created no local ranking snapshot and unlocked no local achievements; its normalized source-reference cards remained inspectable without exposing raw rows or values.
- The share-card preview showed Source instead of an underlying and explicitly stated that holdings, account identifiers, and exact net liquidation value were excluded.
- The real Download PNG button created exactly one `pnl-arena-2026-season.png` file in an isolated download directory. In this recorded run it was 1,268,971 bytes; it had valid PNG signature/IHDR/IEND structure, decoded in Chrome, and measured 1200×1500 pixels. Captured production-canvas text contained the required season metrics, synthetic-source and privacy labels but no fixture holdings, account identifier, or exact NAV canaries. The temporary file was deleted with the isolated browser profile after the test.
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
- Mixed MTM + Month/YTD is verified only for the repository's fully fictional, family-correct English full-account shapes. New broker layouts, partial Flex selections, non-empty Model slices, or structures that cannot be normalized exactly remain unsupported and fail closed.
- Custom wide Flex NAV queries with omitted registered asset fields or a non-empty Model are not supported; only the tested full-field account-level layout is accepted.
- Automated PDF parsing/reconciliation is not implemented; current PDF comparison remains manual.
- Exercise remains uncovered by a qualified real or independently proven CSV fixture. Official IBKR documentation confirms `Ex` and the lifecycle-field semantics, but the public samples are HTML and do not prove the completed-exercise CSV serialization; see `docs/OPTION_EXERCISE_EVIDENCE_2026-08-30.md`.
- Protected private-host header/Worker MIME inspection, complete deployed Network/Storage instrumentation, near-5 MB responsiveness on the iOS/Safari 16.4+ baseline, real iPhone Safari import/cancellation/timeout and real-iPhone PNG export remain unverified.
- Output-cap rejection is fail-closed but still occurs after normalized-report construction. Parser-stage fail-fast protection against adversarial below-5-MiB/below-100,001-row files with excessive unique instruments or events is not yet implemented.
- VoiceOver has not been tested. The desktop keyboard/focus pass and 320 px simulated-width pass do not establish real-device screen-reader accessibility.

# Work handoff — P&L Arena / IBKR Founders Season

## Current status

A desktop development copy is now active at `IBKR Founders Season/项目工作区/ibkr-founders-season`. The original 2026-08-27 handoff archive remains unchanged. Checkpoint 0.13 adds row-by-row CSV tokenization, consumed-section materialization, a second-pass FII conflict/mapping split, a fixed 4,096-field-per-row ceiling, and deterministic exact-capacity pressure regressions. It builds on checkpoint 0.12's parser-side report-capacity exits, bounded retained evidence, shared parser/Worker capacity constants, and exact-5-MiB/100,000-row adversarial production-Worker coverage. The current Node 22.23.2 / npm 10.9.8 full verification passes the parser/Worker/accessibility/compatibility/product-policy/launcher checks, automated production-Chrome import/PNG/capacity regression, dependency audit, and production build with zero known installed-package vulnerabilities. That desktop evidence still does not replace the real-device gates. Both beginner-facing macOS scripts select Node 22 before invoking npm; daily startup and full verification have separate roles.

One private English single-account 2026 YTD Activity Statement CSV was parsed locally without copying it into the repository. Its all-assets total, stock/options/other breakdown, TWR and lifecycle events matched the independently audited source relationships. The matching PDF was manually cross-reconciled outside the Web App; automated PDF reconciliation is not implemented.

Checkpoint 0.10 retains the repository-safe current-schema fixture whose values, identifiers and instruments are entirely fictional. It covers repeated and multiple header shapes, `Data`/`SubTotal`/`Total` rows, and the tested empty-record-type Total P/L row. The fixture is not an anonymized or transformed private statement.

Checkpoint 0.9 closes a broader set of fail-open parser edges. Unitless accounting amounts now use a strict English-CSV grammar; percentages are accepted only by the TWR parser, and currency is carried by a separately validated field. Currency wrappers, embedded letters, exponent notation, loose whitespace (including inside accounting parentheses), malformed grouping/parentheses, and empty currency markers cannot be deleted or coerced into another finite number. Decimal-safe aggregation and difference checks also block binary cancellation or unsafe output. Required accounting placeholders cannot silently become zero; partially drifted repeated headers cannot drop an asset block. MTM row components are checked when the complete component set is present; newer Flex MTMP layouts without the retired `Other` field still require all remaining official components, row totals, and section-level reconciliation. Realized/unrealized components and combined totals are checked row by row. Row-oriented NAV closes long/short components, prior/change, and detail sums to the broker Total; current wide Flex `EQUT`/`EQUS`/NAV Summary requires the full registered asset field set and closes it to `Total`. Exact `Cash` is kept separate from `SLB Cash Collateral`. A present horizontal or vertical Cash Report must expose exactly one base-currency ending balance, and NAV cash must agree with it when both exist.

Accounting sections match only registered normalized aliases after hard-coded known-code canonicalization. BOS descriptions are ignored as non-authoritative metadata; a generic `Summary` or unknown BOS code cannot impersonate YTD MTM or realized/unrealized performance, and numeric `Statement` metadata cannot enter the Total P/L diagnostic. Only registered stock and equity/index-option category aliases enter those ranking buckets. Explicit labels containing `CFD`, plus `Options on Futures` and `Futures Options`, remain `Other`; Other realized/current-unrealized values are retained, including a realized-only closed instrument. Empty detail Asset Class values and opaque MTM option contracts fail closed. Every present YTD per-asset subtotal closes exactly to its detail block and cannot later be reopened by another detail. An All Assets row must be a non-SubTotal with no contradictory asset identity; Total/SubTotal rows cannot become instruments or lifecycle events. A dedicated lifecycle section takes precedence over Trades only when it contains `Data`, and every such row is validated before fallback selection, so a subtotal cannot fabricate an event while a malformed or ambiguously headed Data row cannot disappear into Trades fallback.

Checkpoint 0.10 splits MTM and Month/YTD (`PLUI`) into independently validated field families and independently selected instrument maps. Either family remains usable alone. When both coexist, the parser aggregates MTM option contracts to their underlying, requires the same exact all-assets YTD MTM and the same exact normalized broker-category + underlying key/value map, and requires each side to close to its own all-assets total before accepting the file. Public output may group unsupported categories under Other, but cross-source comparison retains each normalized broker category, so Forex cannot match Futures. MTM is then the only Season P&L calculation source; Month/YTD is only a cross-check. A dedicated realized/FIFO section is authoritative for realized explanation values; validated Month/YTD realized fields are used only as the warned fallback when that section is absent. MTM realized aliases and all direct or named-pair Month/YTD/PLUI return aliases are rejected as field-family drift. Missing keys, offsetting edits, raw-category or Stock/Option bucket swaps, account mismatch, non-empty Model slices, same-family duplicates, field-family relabelling, equal-amount alias swaps, or a one-micro-unit difference fail closed with `accounting_section_conflict`. This is an internal consistency gate, not authenticity proof.

The accounting fields have migrated to `reportedAllAssetsYtdMtm`, `parsedAllAssetsYtdMtm`, and `mtmReconciliationDifference`; the difference direction is `reported - parsed`. MTM, statement-period P/L, and NAV-bridge reconciliation checks use a fixed CSV epsilon of `0.000001`; all three return `PASS_EXACT` for both the fictional current-schema fixture and the private read-only checkpoint 0.13 rerun. That rerun reported good data quality and left the private source hash unchanged. `SourceRef` provenance stores normalized technical section/field aliases plus local record type/row/header metadata without retaining original codes, raw headers, raw values or raw rows. The Ledger exposes expandable sources for major metrics and all three checks, while the symbol drawer exposes per-value and per-event sources without displaying raw values, filenames, accounts or instrument values in the source cards.

CSV reading and parsing run inside a dedicated module Web Worker. A 12-second timeout covers reading, parsing and response transfer; active work can be cancelled explicitly and is also terminated when a replacement passes the filename, non-empty and size preflight, or on Demo switch or unmount. Files that fail that preflight are rejected without cancelling active work; a content-invalid CSV can still replace the active task and then fail parsing. Protocol version 1 validates exact request and response envelopes, the 5 MiB Blob limit, current-time reference, salt length, complete nested report shape, finite numbers, dates, hashes, masks, currencies, enums, diagnostic severity/parameters, CSV-only source references, reconciliation evidence/status semantics, fixed parser facts, dense arrays, and total item/string budgets on both sides. Shared `reportCapacity` constants align the parser and final Worker validator at 500 retained underlyings, 1,000 deduplicated events, 256 distinct exact section strings after known IBKR codes are mapped to names, 20,000 total source-reference occurrences, 501 accepted references per rendered collection, 25,000 total array items, 1,000,000 actual string characters, and per-field length/control-character limits for input-derived report strings. CSV input separately permits no more than 4,096 fields in one logical row; field 4,097 returns fixed `csv_too_many_fields`. The parser rejects the 1,001st unique final event before construction/push and the 501st retained normalized symbol before portfolio aggregation/report construction. Known section codes are mapped during the selective first scan; exactly 256 distinct exact section strings are accepted, and a 257th returns fixed `report_capacity_exceeded` before the FII second pass or report construction. Explicit canonical-key reference collectors retain no more than 501 accepted entries plus one overflow sentinel, repeated references do not consume the boundary, invalid-number evidence retains one reference, and large invalid-reference arrays are not spread into function arguments. Parser-side per-collection/total-reference checks precede report construction. After report assembly, per-field string and aggregate item/string-footprint checks prevent input-controlled output from passing the parser only to become `worker_failure`; they return the same fixed capacity error instead. Direct tests cover exact 501/502 collection boundaries, overlong output fields, a dense parser result that fits both aggregate budgets followed by a step that crosses the string budget, exact 1,000,000/1,000,001 string-character results, an unused bounded internal mapping, and an independent compact 20,000/20,001 reference boundary. The Worker still repeats the complete serialized-output validation as defense in depth.

The production parser now visits CSV rows incrementally and no longer constructs a full-file `string[][]`. It retains records only for registered sections the downstream parser consumes. FII uses a second row-by-row scan: all FII scope, schema, identity, and alias conflicts are still checked globally, including aliases the report never needs, while final mappings and mapping source references are retained only for aliases actually referenced by consumed accounting/event sections. Exact-capacity regressions cover 20,000 valid alias-and-description-unique unused FII option rows in both before-core and after-core order, plus 10,000 distinct cross-section FII/Trades mapping candidates whose final report retains one symbol. The latter is candidate-scan evidence, not a claim of 10,000 final demanded mappings. A separate 25,001-identical-Trades case deduplicates to one event.

This is selective materialization, not true streaming input or a final peak-memory result. The Worker still calls `Blob.text()`, so the accepted Blob is fully decoded into one string, and the parser scans that text twice. True Blob streaming, incremental hashing, and single-pass ingestion remain open. On this Mac, a Node 22 process-level run of the ordinary exact-capacity fixture observed a roughly 10 MiB `maxRSS` increase after the change, versus roughly 48 MiB before it. This is a same-machine diagnostic proxy that can vary with allocator, JIT, caches, process baseline, and run order; it is not a hard gate, browser Worker measurement, iPhone/Safari peak-memory result, or release evidence. The 5 MiB, 100,000-row, and 12-second limits remain the outer bounds. Exact evidence and non-claims are in `docs/PARSER_MATERIALIZATION_EVIDENCE_2026-08-31.md`.

Financial Instrument Information mapping collects candidates before finalizing an alias. Agreeing repeated aliases and same-valued `Underlying`/`Underlying Symbol` columns merge deduplicated mapping references in a bounded collector. An overflow propagated into a rendered report collection fails closed; an unused internal mapping remains bounded but does not reject an otherwise safe report. The second-pass scan continues to detect unused-alias conflicts globally rather than letting selective retention hide them. Duplicate conflicting FII identity columns, conflicting synonym columns, or an explicit Trades/YTD/realized underlying that disagrees with FII rejects the report instead of accepting row/column order. If YTD, realized/FIFO, FII, or the selected event section exposes Account ID/Model, it must remain the same full account with an empty Model. Parser and import diagnostics are structured fixed codes with all 42 messages available in English, Simplified Chinese, and Traditional Chinese. The UI formats them at render time, so a locale switch retranslates existing warnings. No unvalidated free-form statement, filename, account, or holding text is interpolated; dynamic fields are limited to the validated current year and normalized signed MTM difference/currency.

An automated local-browser regression now rebuilds the production bundle and controls an isolated system Chrome profile through the DevTools protocol. It first checks a readable, non-overflowing invalid-file alert at 320 px, then imports the canonical fully fictional fixture through the real file input and module Worker. It confirms three exact reconciliations, three underlyings, rounded `+$740`, and a real one-file browser download whose PNG structure, Chrome decoding and 1200×1500 dimensions pass. Production-canvas privacy canaries confirm that the fixture's known holdings, account identifier and exact NAV are not sent to drawing text. The same run generates a temporary file at the exact supported caps: 5,242,880 bytes, 100,000 rows, 500 fictional underlyings and 1,000 assignment/expiration events. It clicks the visible cancel control, confirms Worker termination and waits beyond the 12-second timeout window, then completes a fresh exact-capacity import, renders all 500 rows, searches the final underlying, checks its lifecycle drawer, and measures frame/timer/long-task gaps. Separate 501-symbol and 1,001-event adversarial CSVs are each exactly 5 MiB and 100,000 rows; both return the fixed capacity error through a real production Worker in under 10 seconds, terminate that Worker and preserve the prior 500-row report. A 5 MiB plus one-byte file is rejected before creating another Worker. The run also confirms no synthetic local rank or achievement, refresh-to-Demo, no external page request or POST, and no browser/runtime/log error. It is not evidence of Safari/iOS 16.4, VoiceOver, deployed headers, peak memory or deployed Storage behavior; exact evidence and non-claims are in `docs/CAPACITY_BROWSER_EVIDENCE_2026-08-31.md`.

Daily `START_MAC.command` now skips duplicate audits, full tests and production builds when the dependency stamp matches and the installed tree is complete, so an already prepared dependency tree opens locally without repeating the handoff gate. Missing or changed dependencies still trigger `npm ci`. `VERIFY_MAC.command` remains the only complete clean-install/audit/test/build gate, and running it refreshes the dependency stamp used by daily startup.

The user also approved v0.2 identity, verification, privacy and security decisions. Complete normalized financial reports are no longer persisted to `localStorage` by default.

Checkpoint 0.8 includes a complete English, Simplified Chinese, and Traditional Chinese Privacy & Data dialog. It accurately states the local Worker, current-tab-memory, locale-only persistence, no-upload, Self-Reported authenticity, optional/unparsed PDF, disclaimer, clearing boundaries, and the fact that a deliberately downloaded PNG is a separate browser file. Desktop browser keyboard/focus behavior passed for both dialogs, page focus, control semantics, report clearing, and live-status placement. Desktop-Chrome simulations at 320 px cover the principal surfaces plus a visible invalid-file message with at least 14 px text and 1.5 line height. Neither result is evidence of a real iPhone or VoiceOver pass.

Checkpoint 0.7 also tightens product trust boundaries. Strict dates reject impossible, reversed, future and wrong-season periods; same-date replacement files for the same account-season are rejected; and base currency must be a consistent three-letter code. Missing accounts are rejected, while cross-file account comparison uses a current-tab salt and SHA-256 instead of the display-only masked suffix. Synthetic Demo, normalized-SHA-256-matched Fully Synthetic Test, Self-Reported and Internal Checks Passed are separate statuses. Internal Checks Passed requires every configured reconciliation to pass; unavailable checks display Review. Local imports are unranked, synthetic data cannot unlock achievements, USD amount thresholds are not applied to non-USD achievements, missing or non-USD NAV does not invent a USD capital division, and default share outputs omit holdings, account identifiers, comparison keys, and exact net liquidation value. These rules are covered by a dedicated product-policy test suite.

The user subsequently froze three release-boundary choices: the supported baseline is iOS 16.4+ and Safari 16.4+; the remote must be a GitHub private repository whose commits use the user's approved GitHub `noreply` email; and the only permitted external deployment is an access-protected Vercel Preview. The Vite production target is now explicit, the TypeScript application library guard is ES2022, and Safari 16.4-prefixed backdrop filters are protected by a compatibility contract check. This is configuration evidence, not a real 16.4 device pass. The local `main` branch now tracks the private `Silent-Torrent/ibkr-founders-season` GitHub remote, using the approved `noreply` identity and a repository-scoped read/write deploy key.

An empty Vercel project now exists and is locally linked through ignored `.vercel/` and `.env.local` state. Its settings are Vite, `npm ci`, `npm run build`, `dist`, and Node 22.x. Vercel Authentication reports Standard Protection (`all_except_custom_domains`), no bypass secret, share link, exception, custom domain or Git integration was created. The first explicit `--target=preview` upload was nevertheless classified by Vercel as Production and received the default production alias. It was removed immediately; the project now has zero deployments and both generated URLs return `404 DEPLOYMENT_NOT_FOUND`. Current provider behavior forces a new project's first deployment to Production, so the Preview-only gate is blocked pending a new user decision. Do not retry while the project remains empty.

On 2026-08-30 the user selected **A + C**: preserve that empty Vercel state and research alternatives without registering, authorizing, installing provider tooling, uploading, connecting GitHub or paying. The research in `docs/PRIVATE_TEST_HOSTING_RESEARCH_2026-08-30.md` recommends Netlify Free Private + a manual Draft Deploy as the best owner-only persistent-cloud candidate, with Tailscale Serve as an optional temporary private-iPhone bridge and Cloudflare Pages + Access as a more complex multi-user fallback. No route has been approved for implementation; all external uploads remain paused.

The user then selected **L**: continue developing locally, keep private GitHub as the remote backup, and revisit deployment only after the local product is ready. Do not treat the hosting comparison as a pending setup task and do not create or connect another hosting account while this decision remains active.

## Product thesis

P&L Arena is an entertainment-oriented identity layer built on serious IBKR performance data. It is not a trading bot and not initially a generic portfolio tracker.

The core user problem is:

> For one IBKR underlying, combine stock and options performance so the user can understand what they made or lost during the current annual season.

The engagement layer adds:

- annual seasons
- capital divisions
- trophies and financial memes
- shareable season cards
- a future verified leaderboard and community

## Locked 2026 MVP model

- Season: `2026 Founders Season`.
- One calendar year equals one season.
- Input: English IBKR Activity Statement CSV.
- Required period: current-year YTD, beginning January 1.
- One account only.
- A newer YTD report replaces an older YTD report.
- A different same-date file for the same account-season is rejected rather than silently replacing the current snapshot.
- Reports are not summed or stitched.
- Season P&L: IBKR YTD MTM P&L.
- Current unrealized P&L: shown separately for explanation.
- User upload status: Self-Reported.
- The two repository-owned fictional CSVs are matched by normalized SHA-256 content digest and labelled Fully Synthetic Test; this is not a general fake-report detector.
- Cross-file account comparison uses a session-salted SHA-256 key; masked suffixes are for display only and raw account identifiers are discarded after parsing.
- Internal arithmetic checks do not prove report authenticity and are labelled only Internal Checks Passed.
- Local imports are not ranked; the current Arena table is explicitly synthetic Demo data.
- Capital divisions currently apply only to USD NAV. Non-USD reports remain ungrouped until an exchange-rate policy is approved.
- Raw statement: local browser parsing only.
- Supported browser baseline: iOS 16.4+ and Safari 16.4+.
- Remote backup boundary: GitHub private repository with the user's approved GitHub `noreply` commit email.
- Deployment boundary: Vercel remains empty. Under the 2026-08-30 L decision, all hosting work is deferred until the local product is ready; any future route still requires a separate explicit decision and provider-specific gate.

## MVP surfaces already represented in code

- Import
- Ledger
- Symbol detail drawer
- Arena demo
- Trophies
- Share-card preview/export
- Three-locale interface framework
- Three-locale Privacy & Data dialog

## What has been synthetically checked

The bundled synthetic report is expected to produce:

- Season P&L: 20,040 USD
- Stock YTD MTM: 13,690 USD
- Options YTD MTM: 6,350 USD
- Six underlyings
- Five option lifecycle events
- Zero reconciliation difference

Smoke cases also cover:

- rejection of non-YTD input
- rejection of multiple accounts
- recognition of combined assignment code `A;P`
- classification of explicit Forex rows as Other, not Stock
- current-schema repeated and multiple headers
- `Data`, `SubTotal`, `Total`, and the tested empty record-type Total P/L shape
- positive and negative `reported - parsed` difference direction
- missing NAV components becoming `NOT_AVAILABLE` instead of silently becoming zero
- source references excluding raw rows and raw values
- exact MTM, statement-period P/L, and NAV-bridge closure at `0.000001` epsilon
- strict invalid/future/reversed/prior-season date rejection
- missing, malformed, and conflicting base-currency rejection
- field-specific amount/percent grammar, exact decimal aggregation, and unsafe-output rejection
- duplicate recognized amount/identity columns in both orders and raw trailing-digit fake aliases
- exact/synonym duplicate accounting sections, conflicting known-code pairs, and safe MTM + Month/YTD coexistence without double counting
- family-correct MTM/Month-YTD schemas, order independence, exact all-assets plus normalized broker-category + underlying equivalence, multi-contract option aggregation, missing/shifted keys, raw-category drift, account/Model scope across YTD/FIFO/FII/events, field-family relabelling, equal-amount alias swaps, and one-micro-unit cross-source differences
- registered accounting/lifecycle full names and known section codes, including a realistic code-tagged MTM Flex field layout
- blank/`-`/`--` required YTD, realized, unrealized and statement-component values under coherently altered surrounding totals
- repeated-header partial identity/total/component drift, complete MTM row-component equations, current Flex MTMP without `Other`, and realized/unrealized component plus combined-total equations
- horizontal and standard vertical Cash Report layouts; missing, data-less, duplicated, or drifted base-currency/Ending Cash fields cannot bypass a conflicting NAV cash value
- dangling critical Statement/Account/YTD/realized/NAV/Cash/Change-in-NAV headers without a following data row are treated as truncated blocks and fail closed
- NAV long/short, prior/change and detail-to-Total equations; exact `Cash` remains distinct from `SLB Cash Collateral`
- current full-field, full-account wide Flex NAV for `EQUT`, `EQUS`, and `Net Asset Value (NAV) Summary in Base`, including an exact field allowlist, Account ID/Report Date agreement, non-empty Model rejection, component-to-Total closure, and Cash/SLB separation
- conflicting Statement/Account/BOF period sources, duplicate NAV/base-cash totals, and NAV-vs-Cash-Report cash disagreement
- dedicated lifecycle-section precedence over Trades to prevent cross-section event double counting
- privacy-safe share outputs and no fake local ranking or synthetic achievement unlocks

These checks do not replace testing against a real IBKR statement.

## Main unverified risks

1. Mixed MTM + Month/YTD is supported only for the tested full-account English schema families when both independently close and match exactly by all-assets total and every normalized broker-category/underlying key. Unproven layouts still fail closed.
2. A custom wide Flex NAV that omits any registered asset field or selects a non-empty Model is currently rejected; full-field account-level closure is required before NAV/Cash can be trusted.
3. Assignment and expiration are covered by the private calibration and the synthetic fixture, but no qualified exercise CSV event is available. Official semantics have been documented without pretending the missing CSV serialization is proven.
4. A fully fictional file at the exact byte/row/symbol/event caps passed the production-Chrome desktop responsiveness/cancellation gate, but boundary responsiveness still requires testing on the supported real iPhone/Safari baseline. Protected-host header/MIME inspection remains deferred with all hosting work under L.
5. Selective section materialization and second-pass FII retention are implemented, and the ordinary exact-capacity Node `maxRSS` proxy improved from roughly 48 MiB to roughly 10 MiB on the same Mac. The Worker still fully decodes the Blob, the parser scans text twice, and real browser-Worker/iPhone peak memory is unmeasured. True Blob streaming, incremental hashing, and a single-pass path remain open; the proxy is not a release threshold.
6. Real iPhone Safari 16.4+ file import, cancellation, timeout and PNG export have not been tested. VoiceOver also remains untested; the broader desktop keyboard/focus and simulated 320 px checks are only preliminary coverage.
7. PDF checks are manual; PDF parsing is not automated and PDF-only remains unsupported for ranked results.
8. The project has a private GitHub remote backup. The local and remote `main` branches are connected through a repository-scoped read/write deploy key. The Vercel project exists but has zero deployments after the misclassified first upload was removed.

## Immediate next milestone

Do not add social features or deployment work first. The next milestone is:

> Obtain a qualified exercise-event fixture and verify the production bundle on the supported real iPhone/Safari baseline without broadening the product's data boundary or starting deployment.

The accounting checkpoint is repeatable with fully synthetic current-schema and family-correct mixed-YTD cases, and the private sample remains a separate read-only calibration source. Deterministic alias/schema conflicts, decimal-safe accounting, parser-side report-capacity exits, selective section/FII materialization, strict Worker serialization, complete underlying-value provenance UI, three-locale diagnostics/privacy copy, strict date/currency/snapshot rules, trust-status separation, privacy-safe default sharing, and an automated production-Chrome import/PNG/exact-capacity regression are implemented. Desktop keyboard/focus behavior, the principal simulated 320 px surfaces, and the desktop capacity/cancellation gate have passed. The GitHub private remote gate is complete. Under the 2026-08-30 L decision, hosting is not a pending implementation task. The next local items are true Blob streaming/incremental hashing and real-device peak-memory work, a qualified exercise fixture, real-iPhone Safari 16.4+ import/cancellation/timeout/PNG and boundary checks, VoiceOver, and later automated PDF reconciliation.

## Longer-term roadmap

After real-data accuracy:

1. UI refinement and original trophy artwork.
2. A public static MVP deployment only after a separate future user approval and release-gate review.
3. Feedback and waitlist.
4. Optional authentication and secure backend.
5. Read-only brokerage integration.
6. Verified annual leaderboards.
7. Profiles, posts, comments, moderation, then chat.

## User working style

- Explain decisions in Chinese.
- Prefer direct conclusions and concrete next steps.
- Do not conceal uncertainty or claim a build passed when it has not.
- Keep implementation efficient; avoid unnecessary architecture.
- Point out incorrect financial assumptions rather than accommodating them.

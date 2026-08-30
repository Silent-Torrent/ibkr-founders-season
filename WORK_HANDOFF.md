# Work handoff — P&L Arena / IBKR Founders Season

## Current status

A desktop development copy is now active at `IBKR Founders Season/项目工作区/ibkr-founders-season`. The original 2026-08-27 handoff archive remains unchanged. On 2026-08-30 a clean Node 22.23.2 / npm 10.9.8 `VERIFY_MAC.command` run completed the locked install, dependency audit, TypeScript/parser/Worker/accessibility/compatibility/product-policy/launcher checks, automated production-Chrome import and PNG download, and final production build with zero known installed-package vulnerabilities. Both beginner-facing macOS scripts select Node 22 before invoking npm; daily startup and full verification now have separate roles.

One private English single-account 2026 YTD Activity Statement CSV was parsed locally without copying it into the repository. Its all-assets total, stock/options/other breakdown, TWR and lifecycle events matched the independently audited source relationships. The matching PDF was manually cross-reconciled outside the Web App; automated PDF reconciliation is not implemented.

Checkpoint 0.8 retains the repository-safe current-schema fixture whose values, identifiers and instruments are entirely fictional. It covers repeated and multiple header shapes, `Data`/`SubTotal`/`Total` rows, and the tested empty-record-type Total P/L row. The fixture is not an anonymized or transformed private statement.

The accounting fields have migrated to `reportedAllAssetsYtdMtm`, `parsedAllAssetsYtdMtm`, and `mtmReconciliationDifference`; the difference direction is `reported - parsed`. MTM, statement-period P/L, and NAV-bridge diagnostics use a fixed CSV epsilon of `0.000001` and all three return `PASS_EXACT` for both the synthetic fixture and the read-only private calibration run. `SourceRef` provenance stores local section/record type/row/header/field metadata without retaining raw rows. The Ledger exposes expandable sources for major metrics and all three checks, while the symbol drawer exposes per-value and per-event sources without displaying raw values, filenames, accounts or instrument values in the source cards.

CSV reading and parsing run inside a dedicated module Web Worker. A 12-second timeout covers reading, parsing and response transfer; active work can be cancelled explicitly and is also terminated when a replacement passes the filename, non-empty and size preflight, or on Demo switch or unmount. Files that fail that preflight are rejected without cancelling active work; a content-invalid CSV can still replace the active task and then fail parsing. Protocol version 1 now validates exact request and response envelopes, the 5 MiB Blob limit, current-time reference, salt length, complete nested report shape, finite values, dates, hashes, masks, currencies, enums, diagnostic severity/parameters, CSV-only source references, reconciliation evidence/status semantics, fixed parser facts, dense arrays, and total item/string budgets on both sides. TWR-conflict and missing-realized-section facts must match their warnings in both directions, and the TWR fact is cross-checked against the returned value and provenance. To match the unpaginated UI, output is capped at 500 underlyings, 1,000 events, 20,000 total references and 501 references per rendered collection (500 detail references plus one broker-total reference). Fixed failure codes replace free-form Worker messages.

Financial Instrument Information mapping now collects candidates before finalizing an alias. Agreeing duplicate Symbol/Description aliases and same-valued `Underlying`/`Underlying Symbol` columns retain every source row. Conflicting synonym columns or an explicit Trades/YTD/realized underlying that disagrees with FII rejects the report instead of accepting row/column order. Parser and import diagnostics are structured fixed codes with all 38 messages available in English, Simplified Chinese, and Traditional Chinese. The UI formats them at render time, so a locale switch retranslates existing warnings. No unvalidated free-form statement, filename, account, or holding text is interpolated; dynamic fields are limited to the validated current year and normalized signed MTM difference/currency.

An automated local-browser regression now rebuilds the production bundle and controls an isolated system Chrome profile through the DevTools protocol. It first checks a readable, non-overflowing invalid-file alert at 320 px, then imports the canonical fully fictional fixture through the real file input and module Worker. It confirms three exact reconciliations, three underlyings, rounded `+$740`, and a real one-file browser download whose PNG structure, Chrome decoding and 1200×1500 dimensions pass. Production-canvas privacy canaries confirm that the fixture's known holdings, account identifier and exact NAV are not sent to drawing text. The run also confirms no synthetic local rank or achievement, refresh-to-Demo, no external page request or POST, and no browser/runtime/log error. It is not evidence of Safari/iOS 16.4, VoiceOver, deployed headers, or deployed Storage behavior.

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
- privacy-safe share outputs and no fake local ranking or synthetic achievement unlocks

These checks do not replace testing against a real IBKR statement.

## Main unverified risks

1. Assignment and expiration are covered by the private calibration and the synthetic fixture, but no qualified exercise CSV event is available. Official semantics have been documented without pretending the missing CSV serialization is proven.
2. The serialized Worker protocol is now strict, but near-limit responsiveness still requires testing on the supported real iPhone/Safari baseline. Protected-host header/MIME inspection remains deferred with all hosting work under L.
3. Real iPhone Safari 16.4+ file import, cancellation, timeout and PNG export have not been tested. VoiceOver also remains untested; the broader desktop keyboard/focus and simulated 320 px checks are only preliminary coverage.
4. PDF checks are manual; PDF parsing is not automated and PDF-only remains unsupported for ranked results.
5. The project has a private GitHub remote backup. The local and remote `main` branches are connected through a repository-scoped read/write deploy key. The Vercel project exists but has zero deployments after the misclassified first upload was removed.

## Immediate next milestone

Do not add social features or deployment work first. The next milestone is:

> Obtain a qualified exercise-event fixture and verify the production bundle on the supported real iPhone/Safari baseline without broadening the product's data boundary.

The accounting checkpoint is repeatable with a fully synthetic current-schema fixture, and the private sample remains a separate read-only calibration source. Deterministic alias conflicts, strict Worker serialization, complete underlying-value provenance UI, three-locale diagnostics/privacy copy, strict date/currency/snapshot rules, trust-status separation, privacy-safe default sharing, and an automated production-Chrome import regression are implemented. Desktop keyboard/focus behavior and the principal simulated 320 px surfaces have passed. The GitHub private remote gate is complete. Under the 2026-08-30 L decision, hosting is not a pending implementation task. The next local items are a qualified exercise fixture, real-iPhone Safari 16.4+ import/cancellation/timeout/PNG and near-limit checks, VoiceOver, and later automated PDF reconciliation.

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

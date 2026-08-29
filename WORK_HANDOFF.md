# Work handoff — P&L Arena / IBKR Founders Season

## Current status

A desktop development copy is now active at `IBKR Founders Season/项目工作区/ibkr-founders-season`. The original 2026-08-27 handoff archive remains unchanged. On 2026-08-29 the project gained a lockfile, dependencies were installed, the TypeScript/parser/Worker checks passed, the production build passed, and the installed dependency audit reported no known vulnerabilities.

One private English single-account 2026 YTD Activity Statement CSV was parsed locally without copying it into the repository. Its all-assets total, stock/options/other breakdown, TWR and lifecycle events matched the independently audited source relationships. The matching PDF was manually cross-reconciled outside the Web App; automated PDF reconciliation is not implemented.

Checkpoint 0.5 retains the repository-safe current-schema fixture whose values, identifiers and instruments are entirely fictional. It covers repeated and multiple header shapes, `Data`/`SubTotal`/`Total` rows, and the tested empty-record-type Total P/L row. The fixture is not an anonymized or transformed private statement.

The accounting fields have migrated to `reportedAllAssetsYtdMtm`, `parsedAllAssetsYtdMtm`, and `mtmReconciliationDifference`; the difference direction is `reported - parsed`. MTM, statement-period P/L, and NAV-bridge diagnostics use a fixed CSV epsilon of `0.000001` and all three return `PASS_EXACT` for both the synthetic fixture and the read-only private calibration run. `SourceRef` provenance stores local section/record type/row/header/field metadata without retaining raw rows. The Ledger exposes expandable sources for major metrics and all three checks, while the symbol drawer exposes per-value and per-event sources without displaying raw values, filenames, accounts or instrument values in the source cards.

CSV reading and parsing now run inside a dedicated module Web Worker. A 12-second timeout covers reading, parsing and response transfer; active work can be cancelled explicitly and is also terminated on a valid replacement, Demo switch or unmount. Invalid replacement files are rejected before they can cancel valid work. The parser enforces its row cap incrementally, and Worker output caps prevent abnormally large reports from being copied back to the UI.

The user also approved v0.2 identity, verification, privacy and security decisions. Complete normalized financial reports are no longer persisted to `localStorage` by default.

Checkpoint 0.5 adds a complete English, Simplified Chinese, and Traditional Chinese Privacy & Data dialog. It accurately states the local Worker, current-tab-memory, locale-only persistence, no-upload, Self-Reported authenticity, optional/unparsed PDF, disclaimer, clearing boundaries, and the fact that a deliberately downloaded PNG is a separate browser file. Desktop browser keyboard/focus behavior passed for both dialogs, page focus, control semantics, report clearing, and live-status placement. A simulated 320 px check covered bottom navigation, Ledger table/share card, Arena scrolling, the privacy dialog and symbol drawer. Neither result is evidence of a real iPhone or VoiceOver pass.

The user subsequently froze three release-boundary choices: the supported baseline is iOS 16.4+ and Safari 16.4+; the remote must be a GitHub private repository whose commits use the user's approved GitHub `noreply` email; and the only permitted external deployment is an access-protected Vercel Preview. The Vite production target is now explicit, the TypeScript application library guard is ES2022, and Safari 16.4-prefixed backdrop filters are protected by a compatibility contract check. This is configuration evidence, not a real 16.4 device pass. The local `main` branch now tracks the private `Silent-Torrent/ibkr-founders-season` GitHub remote, using the approved `noreply` identity and a repository-scoped read/write deploy key.

An empty Vercel project now exists and is locally linked through ignored `.vercel/` and `.env.local` state. Its settings are Vite, `npm ci`, `npm run build`, `dist`, and Node 22.x. Vercel Authentication reports Standard Protection (`all_except_custom_domains`), no bypass secret, share link, exception, custom domain or Git integration was created. The first explicit `--target=preview` upload was nevertheless classified by Vercel as Production and received the default production alias. It was removed immediately; the project now has zero deployments and both generated URLs return `404 DEPLOYMENT_NOT_FOUND`. Current provider behavior forces a new project's first deployment to Production, so the Preview-only gate is blocked pending a new user decision. Do not retry while the project remains empty.

On 2026-08-30 the user selected **A + C**: preserve that empty Vercel state and research alternatives without registering, authorizing, installing provider tooling, uploading, connecting GitHub or paying. The research in `docs/PRIVATE_TEST_HOSTING_RESEARCH_2026-08-30.md` recommends Netlify Free Private + a manual Draft Deploy as the best owner-only persistent-cloud candidate, with Tailscale Serve as an optional temporary private-iPhone bridge and Cloudflare Pages + Access as a more complex multi-user fallback. No route has been approved for implementation; all external uploads remain paused.

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
- Reports are not summed or stitched.
- Season P&L: IBKR YTD MTM P&L.
- Current unrealized P&L: shown separately for explanation.
- User upload status: Self-Reported.
- Raw statement: local browser parsing only.
- Supported browser baseline: iOS 16.4+ and Safari 16.4+.
- Remote backup boundary: GitHub private repository with the user's approved GitHub `noreply` commit email.
- Deployment boundary: Vercel remains empty; no alternate host or external upload is approved after the 2026-08-30 A + C decision. Any future route requires a separate explicit decision and provider-specific gate.

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

These checks do not replace testing against a real IBKR statement.

## Main unverified risks

1. Assignment and expiration are covered by the private calibration and the synthetic fixture, but no qualified exercise event is available.
2. Protected private-host Network/Storage verification, Worker response-header/MIME inspection and near-limit device responsiveness remain incomplete; local Worker lifecycle and parser limits now have regression cases.
3. Real iPhone Safari 16.4+ file import, cancellation, timeout and PNG export have not been tested. VoiceOver also remains untested; the broader desktop keyboard/focus and simulated 320 px checks are only preliminary coverage.
4. PDF checks are manual; PDF parsing is not automated and PDF-only remains unsupported for ranked results.
5. The project has a private GitHub remote backup. The local and remote `main` branches are connected through a repository-scoped read/write deploy key. The Vercel project exists but has zero deployments after the misclassified first upload was removed.

## Immediate next milestone

Do not add social features or polish first. The next milestone is:

> Complete the static-Beta security and device gate around the now-repeatable accounting parser, without broadening the product's data boundary.

The accounting checkpoint is repeatable with a fully synthetic current-schema fixture, and the private sample remains a separate read-only calibration source. The Worker boundary, complete underlying-value provenance UI, and three-locale privacy dialog are now implemented. Desktop keyboard/focus behavior and the principal simulated 320 px surfaces have passed. The GitHub private remote gate is complete. Under the 2026-08-30 A + C decision, Vercel remains empty and alternative private-test hosting has been researched but not approved for implementation. After a route is explicitly chosen, Network/Storage and Worker-response inspection remain the next technical gate. The fictional-data real-iPhone Safari 16.4+ procedure in `docs/IPHONE_SAFARI_TEST_CHECKLIST.md` and VoiceOver remain required. Automated PDF reconciliation remains a later workstream.

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

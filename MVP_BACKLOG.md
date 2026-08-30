# MVP backlog

## Completed through coding checkpoint 0.7

- [x] Project scaffold.
- [x] Responsive application shell.
- [x] Three-locale UI framework.
- [x] Demo mode.
- [x] CSV drag-and-drop and file picker.
- [x] Local-only parser.
- [x] Current-year YTD validation.
- [x] Strict calendar-date validation, including invalid dates, reversed periods, future period ends, and non-current seasons.
- [x] Duplicate detection and latest-snapshot replacement rule, including rejection of a different same-date file for the same account-season.
- [x] One-account validation.
- [x] Missing-account rejection and session-salted SHA-256 account comparison key; masked account suffixes are display-only.
- [x] Strict three-letter base-currency validation with safe display fallback for malformed or conflicting currency rows.
- [x] YTD MTM aggregation by underlying and asset class.
- [x] Realized and current-unrealized explanatory fields.
- [x] Option event detection.
- [x] Ledger filters, sorting, and symbol detail drawer.
- [x] Arena demo.
- [x] Capital divisions.
- [x] Trophy rules and locked previews.
- [x] PNG season card export.
- [x] Privacy-safe default share card and copied summary with no underlying symbols, account identifiers, or exact net liquidation value.
- [x] Sample CSV and parser smoke suite, including invalid-input cases.
- [x] Visible IBKR YTD-total reconciliation difference.
- [x] Canonical MTM field names and `reported - parsed` difference direction.
- [x] Fixed `0.000001` CSV reconciliation epsilon.
- [x] Fully fictional current-schema regression fixture with heterogeneous/repeated headers and all tested record types.
- [x] Local `SourceRef` provenance without raw-row retention.
- [x] MTM, statement-period P/L, and NAV-bridge diagnostics.
- [x] Expandable major-metric and reconciliation source references in the Ledger.
- [x] Complete per-value and per-event source drawers in the symbol detail UI.
- [x] Dedicated Web Worker for filename-free CSV reading and parsing.
- [x] Twelve-second total Worker timeout, explicit cancellation and stale-result protection.
- [x] Incremental CSV row-limit enforcement and Worker report-output caps.
- [x] Worker lifecycle contract tests included in `npm run check`.
- [x] Versioned Worker request/response protocol with strict runtime, reconciliation-semantics, fixed parser-fact, and deterministic-warning validation; capacity caps are aligned to the current unpaginated UI (500 underlyings, 1,000 events, 20,000 total references, 501 per rendered reference collection: 500 detail references plus one broker-total reference).
- [x] Structured parser/import diagnostics rendered in English, Simplified Chinese, and Traditional Chinese without interpolating unvalidated free-form statement text; dynamic fields are limited to the validated current year and normalized signed MTM difference/currency.
- [x] Deterministic option-underlying alias candidates: retain agreeing duplicate provenance and reject the whole report on any conflicting Symbol/Description alias, independent of row order.
- [x] Automated real-Chrome regression against a fresh production bundle, including the dedicated Worker path, synthetic trust/ranking/achievement boundaries, refresh-to-Demo, and no external page request or POST.
- [x] Three-locale Privacy & Data dialog with the approved local-processing, storage, authenticity, PDF, disclaimer, and clearing boundaries.
- [x] Accessible privacy-dialog focus behavior: initial focus, Tab/Shift+Tab containment, Escape/backdrop close, background lock, and focus return.
- [x] Matching modal focus behavior for the symbol drawer, including native source-row summaries.
- [x] Accessible page titles/language/current-navigation state, main-region focus, labelled controls, table/list/progress semantics, and visible focus treatment.
- [x] Import/cancel and report-source live status, including focus recovery when a local report is cleared.
- [x] Desktop browser keyboard/focus check and simulated 320 px checks for bottom navigation, Ledger table/share card, Arena scrolling, privacy dialog, and symbol drawer.
- [x] Beginner-safe real-iPhone Safari checklist that uses only the fully fictional CSV fixture.
- [x] Explicit production build target for iOS/Safari 16.4+, Safari-prefixed visual effects, and an automated compatibility contract check.
- [x] Separate Synthetic Demo, SHA-256-matched Fully Synthetic Test, Self-Reported, and Internal Checks Passed labels; remove fake local ranking and prevent synthetic data from unlocking local achievements.
- [x] Show imported user results as a local, unranked snapshot; do not infer a capital division when NAV is unavailable or the base currency is not USD.
- [x] Restrict fixed monetary achievement thresholds to USD until an exchange-rate policy exists.
- [x] Treat unavailable or warning reconciliation checks as Review, not Internal Checks Passed.
- [x] Product-policy regression suite for trust labels, rankings, achievements, share-card privacy, currency safety, and snapshot replacement.
- [x] Beginner launcher and project engine pinned to maintained Node.js 22 LTS; full checks and build passed on Node 22.23.2.

## P0 — before public deployment

- [x] Parse one private real IBKR YTD CSV locally without copying it into the repository.
- [x] Create a repository-safe, fully synthetic fixture for the proven current schema without copying or transforming the private source.
- [x] Reconcile key report totals against the matching IBKR PDF outside the Web App.
- [x] Add the observed Mark-to-Market section and field aliases.
- [x] Confirm Financial Instrument Information underlying mapping for the private sample.
- [x] Validate assignment and expiration from the private sample.
- [ ] Validate exercise from a qualified real or independently proven fixture.
- [x] Add visible reconciliation difference.
- [x] Add expandable source rows for portfolio-level reconciliation diagnostics.
- [x] Implement NAV and statement-period P/L diagnostics for the proven current schema.
- [x] Add complete per-value source drawers for all underlying-level UI numbers.
- [x] Remove default persistent storage of the complete normalized report.
- [x] Add a dependency lockfile and pass the installed dependency audit.
- [x] Run the real TypeScript/parser checks and production build locally.
- [x] Add CSP/security-header configuration and confirm the local page has no resulting console errors.
- [x] Verify with a synthetic import that refresh returns to Demo instead of restoring the report.
- [ ] Verify the complete deployed browser Network/Storage boundary.
- [x] Reject unterminated fields, payloads over 10 million characters, fields over 250,000 characters, and files over 100,000 rows in regression tests.
- [x] Add a main-thread responsiveness/time budget or worker boundary for large-but-allowed files.
- [ ] Verify real iPhone Safari file import, cancellation, timeout and PNG download using only fictional data.
- [x] Run desktop browser keyboard/focus checks for the privacy dialog and confirm its simulated 320 px layout.
- [ ] Run VoiceOver and real-device accessibility checks on the supported iPhone Safari baseline.
- [x] Add a three-locale privacy notice and disclaimer modal.
- [x] Initialize local Git history with the approved GitHub `noreply` identity.
- [x] Create and verify the GitHub private remote backup with a repository-scoped read/write deploy key.
- [x] Record the user's A + C decision: keep Vercel at zero deployments and research alternative private-test routes without external action.
- [x] Compare owner-only Netlify Private Draft, Tailscale Serve, Cloudflare Pages + Access, GitHub Pages and Render against the non-public-first-deployment gate.
- [x] Record the user's L decision: defer every hosting route until the local product is ready and continue only local/private-GitHub development.
- [ ] Revisit hosting only after the user explicitly reopens deployment; until then, create no alternate account, authorization, project, upload or paid plan.
- [x] Detect and surface conflicting Financial Instrument Information aliases instead of silently choosing an underlying.
- [x] Harden the Worker response protocol against oversized or malformed serialized payloads beyond the existing object-count caps.
- [x] Add an automated local-browser import regression for the synthetic fixture.
- [x] Localize remaining parser rejection messages in all three interface languages.

## P1 — after first testers

- [ ] Persist optional report history locally.
- [ ] Add more badge triggers supported by YTD data.
- [ ] Create original badge illustrations.
- [ ] Add anonymized feedback form / waitlist.
- [ ] Add product analytics without financial-data capture.
- [ ] Add share-card templates for English and Chinese communities.

## P2 — verified social beta

- [ ] Authentication.
- [ ] Encrypted backend and database.
- [ ] Read-only brokerage integration.
- [ ] Verified season snapshots.
- [ ] Public profiles and privacy controls.
- [ ] Real annual leaderboards.
- [ ] Posts and comments before real-time chat.
- [ ] Moderation, reporting, blocking, and anti-scam controls.

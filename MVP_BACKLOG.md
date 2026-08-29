# MVP backlog

## Completed through coding checkpoint 0.5

- [x] Project scaffold.
- [x] Responsive application shell.
- [x] Three-locale UI framework.
- [x] Demo mode.
- [x] CSV drag-and-drop and file picker.
- [x] Local-only parser.
- [x] Current-year YTD validation.
- [x] Duplicate detection and latest-snapshot replacement rule.
- [x] One-account validation.
- [x] YTD MTM aggregation by underlying and asset class.
- [x] Realized and current-unrealized explanatory fields.
- [x] Option event detection.
- [x] Ledger filters, sorting, and symbol detail drawer.
- [x] Arena demo.
- [x] Capital divisions.
- [x] Trophy rules and locked previews.
- [x] PNG season card export.
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
- [x] Three-locale Privacy & Data dialog with the approved local-processing, storage, authenticity, PDF, disclaimer, and clearing boundaries.
- [x] Accessible privacy-dialog focus behavior: initial focus, Tab/Shift+Tab containment, Escape/backdrop close, background lock, and focus return.
- [x] Matching modal focus behavior for the symbol drawer, including native source-row summaries.
- [x] Accessible page titles/language/current-navigation state, main-region focus, labelled controls, table/list/progress semantics, and visible focus treatment.
- [x] Import/cancel and report-source live status, including focus recovery when a local report is cleared.
- [x] Desktop browser keyboard/focus check and simulated 320 px checks for bottom navigation, Ledger table/share card, Arena scrolling, privacy dialog, and symbol drawer.
- [x] Beginner-safe real-iPhone Safari checklist that uses only the fully fictional CSV fixture.
- [x] Explicit production build target for iOS/Safari 16.4+, Safari-prefixed visual effects, and an automated compatibility contract check.

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
- [ ] Deploy only after the static-Beta security gate passes.

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

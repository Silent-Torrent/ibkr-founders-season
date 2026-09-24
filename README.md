# P&L Arena — 2026 Founders Season

Privacy-first Web App MVP for analyzing an Interactive Brokers Year-to-Date Activity Statement and presenting annual stock-and-options performance as a season.

## Current project state — checkpoint 0.31 cash badge and CSV row-width integrity

On 2026-09-25, wholly fictional regressions exposed a false Cash Gang unlock when both cash and net liquidation value were negative, negative badge progress, and accepted CSV rows that hid populated cells beyond their section header. Cash Gang now needs positive NLV; known financial sections reject populated unmapped trailing cells while allowing empty trailing cells. The special headerless statement-period P/L row keeps an aligned value after an empty tail, but an old-width row against a shorter Flex MTMP header remains `NOT_AVAILABLE`/warning rather than being guessed. Local Node 22 checks, a real production-Chrome Worker rejection/preserved-Ledger test, build and dependency audit passed. See [integrity evidence](docs/CASH_BADGE_AND_CSV_ROW_WIDTH_EVIDENCE_2026-09-25.md) and [verification](VERIFICATION.md). This does not authenticate a broker file or verify the new build on iPhone; fixed gates remain **9 OPEN / 3 CLOSED**, with L deployment freeze unchanged.

### Earlier checkpoint 0.30 — production CSP connection scope

On 2026-09-25 the built page's CSP was narrowed from a scheme-wide WebSocket allowance to connections matching CSP's `'self'` rule. Vite development still gets a serve-only WebSocket exception for hot reload; the production build and preview do not. A new policy regression first failed against the old HTML, then passed; local dev/preview responses were inspected, and production Chrome observed an actual CSP violation while a separate loopback WebSocket listener received no connection. The complete Node 22 check, build and dependency audit passed. See [CSP scope evidence](docs/PRODUCTION_CSP_SCOPE_EVIDENCE_2026-09-25.md) and [verification](VERIFICATION.md). This does **not** prove a future host's Worker response header or deployed Network/Storage boundary; R01 remains open, as do the other fixed gates (**9 OPEN / 3 CLOSED**). L deployment freeze remains.

### Earlier checkpoint 0.29 — option-event code integrity

On 2026-09-25 fictional option rows exposed another false-good path: combined Assignment/Expiration codes could be silently resolved to one event, and cancellation/reversal wording could be counted as a completed event. Lifecycle type recognition now accepts only bounded known words and code tokens; contradictory, negated, malformed or unsupported event codes fail the import rather than being guessed or silently dropped. A contradictory Trades row is checked even when the dedicated lifecycle section owns the event count. A specific diagnostic is available in all three languages, bringing the current total to 45. Production-Chrome accessibility-tree checks cover the import error, recovery, success and cancellation states, but are only desktop preparation, not a real VoiceOver hearing test. See [event-code evidence](docs/OPTION_EVENT_TYPE_INTEGRITY_EVIDENCE_2026-09-25.md) and [verification](VERIFICATION.md). Official codes alone do not prove a completed Exercise CSV row; F01 and the other fixed gates remain **9 OPEN / 3 CLOSED**, with deployment frozen by L.

### Earlier checkpoint 0.28 — CSV structure and numeric-cell integrity

On 2026-09-25 fictional current-schema CSV tests exposed two silent normalizations: a misplaced quote inside a financial amount was removed, and whitespace surrounding a quoted amount could be trimmed away before numeric validation. The tokenizer now rejects illegal quote placement and bare CR, retains original field text, and the accounting-number and return parsers reject surrounding whitespace. Valid LF/CRLF, escaped quotes and multiline quoted *text* remain supported. The existing localized error/re-export paths reject these malformed financial cells without replacing the previous report. See [CSV integrity evidence](docs/CSV_QUOTE_INTEGRITY_EVIDENCE_2026-09-25.md) and [verification](VERIFICATION.md). These local checks do not authenticate broker files or close F01, phone/16.4 or L-frozen deployment gates; the fixed count remains **9 OPEN / 3 CLOSED**.

### Earlier checkpoint 0.27 — candidate option-event identity

On 2026-09-25 a fully fictional two-row Assignment exposed a separate false-good result: same-contract, same-day records with different time/quantity were silently collapsed. The parser now deduplicates only matching selected source-row content; when different rows share one supported event identity, it rejects the import with a specific three-locale explanation instead of guessing whether to count one or two events. Normalized capitalization/spacing and two strictly parsed standard contract spellings are covered; other contract spellings remain unproven and are not silently claimed equivalent. A real production-Chrome failed-import regression confirms the previously open fictional Ledger remains in place. See [option-event identity evidence](docs/OPTION_EVENT_IDENTITY_EVIDENCE_2026-09-25.md) and [verification](VERIFICATION.md). The fixed gates remain **9 OPEN / 3 CLOSED**; F01, phone/16.4 and L-frozen deployment are not closed.

### Earlier checkpoint 0.26 — option-event dates

On 2026-09-24 a fictional CSV regression exposed a counted Assignment with a missing or impossible date. The local parser now rejects missing, invalid and out-of-YTD event dates; the Worker also requires a date, and the import page explains how to re-export in all three languages. The old behavior was first reproduced with a failing test; dedicated-event, Trades-fallback, Worker and production-Chrome preservation regressions passed. See [option-event date evidence](docs/OPTION_EVENT_DATE_EVIDENCE_2026-09-24.md) and [verification](VERIFICATION.md). This does not validate a real completed Exercise row, iOS 16.4, VoiceOver speech or deployment. The fixed gates stay **9 OPEN / 3 CLOSED**, with deployment frozen by L.

### Earlier checkpoint 0.25 — small-value display

On 2026-09-24 a display-only correction fixed small non-zero P&L and return values that previously appeared as unsigned zero after rounding. The Node 22 regression first reproduced the old bug, then three-locale formatter, Ledger/share-summary, complete local check and production build checks passed; see [small-value evidence](docs/SMALL_VALUE_FORMAT_EVIDENCE_2026-09-24.md) and [verification](VERIFICATION.md). The 0.25 production page also loaded on the mirrored iPhone 15 Plus / iOS 27.0 over the existing hotspot and visibly reached English Demo Import with VoiceOver temporarily enabled. No new-build spoken order was confirmed or file selected. Its sole project tab and temporary preview were closed, VoiceOver was verified Off, and original Pinyin restored. D07 and all other open gates remain OPEN (9 OPEN/3 CLOSED); L still blocks deployment.

Earlier 2026-09-24 phone-hotspot update for unchanged 0.24: after the user moved both devices to a hotspot, the English welcome page **loaded in iPhone Safari**. Temporary VoiceOver produced speech that the user heard; the user's specific confirmation covers privacy-modal content and its close control, not the complete focus order or import outcomes. Four fictional Demo pages and Simplified Chinese were visually reached without choosing a file. English/Start Page/Home, VoiceOver Off, original input and stopped local service were verified. The earlier guest-network failure below was network-specific, not a contradiction. D07 remained OPEN, 9 OPEN/3 CLOSED and deployment freeze L were unchanged. See [September 24 phone continuation](docs/IPHONE_VOICEOVER_CONTINUATION_2026-09-24.md). A complete VoiceOver pass still needs the missing user-heard navigation/focus and fictional-file states.

Earlier 2026-09-24 guest-network stage: with the user's approval, a temporary fictional 0.24 preview was served on that network. The Mac returned HTTP 200, but iPhone Safari could not connect to the correct local address; the cause is unconfirmed. Phone HTTP Proxy/VPN were Off, Mac had no active proxy and its firewall was disabled; no settings were changed. The failed phone tab and owned service were closed, original input restored, VoiceOver stayed Off, and no test file was created. September 17's actual iPhone Demo load on a different network remains valid but did not include VoiceOver. At that point the next need was a **different reachable network arrangement**, not restoration of the September 14 hotspot or renewed VoiceOver consent; the user later supplied the hotspot above. D07 and 9 OPEN/3 CLOSED remained; 0.24 and deployment freeze L were unchanged. See [September 24 continuation](docs/IPHONE_VOICEOVER_CONTINUATION_2026-09-24.md). Older dated status lines below describe their own historical stages.

Historical authorized same-network retest, 2026-09-14: the approved Mac Wi-Fi switch was made, but phone Safari still failed to reach the unchanged local app. VoiceOver was not enabled. Test tab/service were closed and input source restored; **restoring the original hotspot failed, leaving the Mac on shared Wi-Fi with no test service running**. User help making the original hotspot available was the then-immediate next step, not today's instruction. Cause remains undetermined; see [same-network retest and unresolved restoration](docs/IPHONE_SAME_WIFI_RETEST_2026-09-14.md). 0.24, 9 remaining gates and L were unchanged. Earlier consent-wait/restoration statements below retain only their own stage scope.

Historical phone preflight, 2026-09-14: VoiceOver/listening consent was received, but the phone could not reach the unchanged local 0.24 service while the devices were observed on different networks. VoiceOver was not enabled in that attempt. The failed tab/server were closed and input source restored; no network/product/deployment change was made. At that stage the next prerequisite was a scoped connectivity decision, not repeated VoiceOver consent. See [preflight evidence](docs/IPHONE_VOICEOVER_PREFLIGHT_2026-09-14.md). 9 gates and L were unchanged; older consent-wait statements below retain their historical scope.

Historical 2026-09-14 identity control: the owned page and two different Worker isolates shared one renderer PID, verified through exact live trace metadata and per-session marks. Process footprint therefore cannot substitute for a Worker's exclusive peak. The one experiment, analysis tests and cleanup are complete; no further size sweeps are planned for this rejected route. See [attribution evidence](docs/WORKER_PROCESS_ATTRIBUTION_EVIDENCE_2026-09-14.md). Product 0.24, 9 remaining gates and L were unchanged; VoiceOver agreement was granted later, while actual listening remained open.

Historical developer-only follow-up, 2026-09-14: nine native self-process controls demonstrate that the macOS lifetime physical-footprint counter retained the tested short pulses after current readings returned to baseline. This is not browser-Worker/JS peak measurement or an iPhone safety threshold. Alternative-instrument screening, input-bound evidence and cleanup are in [candidate evidence](docs/MEMORY_INSTRUMENT_CANDIDATES_2026-09-14.md). No product/phone/deployment changes; D01 and 9 gates remained OPEN at that stage. VoiceOver permission was granted later; actual listening remained open.

Later on 2026-09-14, a separate fictional Chrome calibration verified the numeric instrument's held controls and demonstrated three short-lived allocation tasks with zero runtime samples. New test-tool ownership/cancellation guards and three real interruption checks passed; temporary browser resources were cleaned. This changed no product bundle, phone setting or deployment decision and did not close D01: 9 gates remained. See [calibration evidence](docs/WORKER_HEAP_CALIBRATION_EVIDENCE_2026-09-14.md) for exact results, reproducible commands and the non-peak limits. VoiceOver agreement was granted later; actual listening remained open.

Historical completed-stage update, 2026-09-14: the user replied “全部正常” to the five physical-rotation/sidebar checks on the unchanged 0.24 candidate, iPhone 15 Plus / iOS 27.0, Simplified Chinese. Sidebar appearance, internal scrolling without moving the main page, its four navigation entries, privacy/guide access and return to unobstructed portrait navigation are USER_CONFIRMED, not independently observed. The earlier actual welcome/locale/Demo navigation pass and the same six-underlying `+US$20,040` Ledger seen after reconnect are separate evidence, not proof that the agent witnessed rotation.

English was restored, the sole test tab closed with Start Page/Home verified, and the rechecked owned PID `10582` terminated; session `26584` exited 143 and 4173/4174 had no listeners. Final original Simplified Pinyin and unchanged asset hashes were checked. No product edit/build/suite rerun, CSV import, new paste, PNG generation/save, file/photo deletion or network/VoiceOver change occurred; earlier clipboard-restoration uncertainty remains. The L01 session is finished, but full D08/16.4 is not established: 9 gates remain (5 device/cleanup, 1 financial source, 3 deployment), L is frozen and the app is not launched. See `docs/IPHONE_REOPEN_EVIDENCE_2026-09-14.md`; older stages retain their original scopes.

Earlier on 2026-09-09 D03's real Mirroring-forwarded keyboard path closed on unchanged 0.23 assets: English, Simplified Chinese and Traditional Chinese each reopened a nonblank PNG with one Return after closing its preview, without another click, scroll, Tab or refocus. An English manual-panel close/Return control reopened only the manual panel. This changes 10 → 9 open baseline gates (5 device/cleanup, 1 financial source, 3 deployment; cumulative 12 → 9). The six previews stayed in page memory, no files were saved, and the final preview/test tab/owned service were closed with English/Home restored. This does not establish full VoiceOver, a directly connected hardware keyboard, 16.4 or HTTPS saving. See `docs/IPHONE_FOCUS_EVIDENCE_2026-09-09.md`; D07 remains open and requires separate informed participation.

The Copy summary button now keeps a fixed localized action label. Its transient feedback is displayed in one separate visible polite live region, with space reserved for the tallest localized outcome so status changes do not move the action buttons. Node 22 `npm run check && npm run build` and the final production-browser rerun/build passed, including three-locale 320 px geometry checks and all existing import/Worker/capacity/PNG regressions. An independent old-build counterexample proved that unchanged Manual coordinates could hit Download after natural feedback reset; six new-build failure/reset screenshots were visually checked. See `docs/COPY_ACTION_STABILITY_EVIDENCE_2026-09-06.md` for the bounded evidence. This changes no parser/accounting, capacity, persistent storage, dependency or hosting policy.

Earlier on 2026-09-09 the unchanged `482c66d` / 0.23 production assets on a rechecked iPhone 15 Plus / iOS 27.0 passed all three HTTP copy-failure/reset geometry and unchanged-coordinate Manual paths, closing D05. The continuation from documentation-only HEAD `0f3ae02` separately closed D04's Simplified Chinese native-touch path as `USER_CONFIRMED`, not a green match independently witnessed by the main agent. That stage's 11 → 10 count and completed helper/two-tab/service cleanup precede the separate D03 10 → 9 result above. No code change, rebuild or full test rerun occurred. Each path's source and limits remain in `docs/IPHONE_COPY_ACTION_EVIDENCE_2026-09-09.md` and `docs/RELEASE_GATE_TRACKER.md`.

Separately, a completed Demo-only phone session used the preceding `7b61ab5` bundle on a verified iPhone 15 Plus / iOS 27.0. HTTP named download preserved `pnl-arena-2026-season.png`, and a separate Safari Save to Files path appended one `.png` to a numeric stem; both actual files reopened at 1200×1500. Three-language preview/save guidance, read-only selection/reselection and real Mirroring-forwarded keyboard Copy/Paste passed exact local comparison. Both new PNGs were recoverably deleted, temporary paste fields cleared, and that session's test tabs/service/helper files closed or removed. Old Photos-card location and complete VoiceOver remain open. Later D04 user-confirmed native copying and D03 observed keyboard focus are separate results, not rewrites of this old evidence. See `docs/IPHONE_SHARE_EVIDENCE_2026-09-06.md`; these observations do not replace historical iPhone 17 Pro Max evidence or establish HTTPS/minimum-version support.

Checkpoint 0.22 added an opt-in diagnostic that samples numeric heap counters from real production Chrome Worker isolates separately from ordinary performance gates. Three fictional fixture shapes were exercised: the small control had insufficient runtime coverage, while the two large cases had 13 and 24 runtime samples. These maxima are not true peaks, total browser memory or iPhone/Safari safety limits. At that checkpoint the product bundles were unchanged from 0.21; 0.23 changes only the main UI bundle and stylesheet, not the Worker. See `docs/BROWSER_WORKER_HEAP_EVIDENCE_2026-09-06.md`; the P0 device-memory threshold remains open.

The 0.21 manual-selection fallback reuses the existing summary in a labelled, read-only field. Explicit selection focuses/selects text; automatic failure does not steal focus, and closing/context changes invalidate old callbacks and text. Selection alone is not copying, and clearing the report cannot clear a system clipboard. The 0.20 PNG guidance separates full/stem names and named download from the preserved Safari-open route. Local evidence remains in `docs/MANUAL_COPY_EVIDENCE_2026-09-06.md` and `docs/PNG_SAVE_GUIDANCE_EVIDENCE_2026-09-06.md`; their then-unrun phone items are partially superseded by the separate `7b61ab5` session above. The 2026-09-09 0.23 geometry check does not rerun or replace those historical saved-file and keyboard-copy paths. Old filename failures remain historical facts.

Historical 0.19 device follow-up on 2026-09-06 (`8cf0496`): that production build passed bounded iPhone 17 Pro Max / iOS 27.0 cancellation/natural-timeout/capacity-error recovery, guide/three-locale privacy checks and PNG save directly to Files/reopen. Exact PNG naming did not pass; rotation, full VoiceOver, the iOS 16.4 floor, memory measurement and deferred HTTPS/deployment gates remain open. Three local test PNGs and, after explicit cross-device consent, four iCloud Downloads test objects were recoverably deleted and verified in Recently Deleted; Mac independent backups remained unchanged. Old Photos-card cleanup remains unresolved. The temporary server and test tabs were closed. See `docs/IPHONE_SAFARI_EVIDENCE_2026-09-06.md`; it does not certify the changed 0.20 save surface.

The repository already contains:

- File selection and both recovery entry points synchronously focus the stable main Choose/Cancel control before opening the picker. Production Chrome reproduces and guards the removed-retry-button focus defect, preserves the previous report after cancellation/preflight rejection and controlled 12-second timeout, and succeeds on a same-page same-file retry through a fresh real Worker. A moved focus is not stolen. The native chooser is intercepted and Worker startup is controlled for those desktop tests; separate current-build iPhone observations are linked above. See `docs/IMPORT_RECOVERY_EVIDENCE_2026-09-05.md` for desktop scope.
- Share and copy requests are invalidated synchronously when the report/language changes or the Ledger unmounts. Late system-share rejection cannot create an obsolete fallback preview/download, old results and timers cannot overwrite a newer action, and both buttons prevent duplicate pending submissions. Copy has explicit three-locale pending feedback and retry behavior. Controlled production-Chrome regressions cover these races; they do not replace real iPhone/clipboard-permission checks. See `docs/SHARE_RECOVERY_EVIDENCE_2026-09-05.md`.
- React + TypeScript + Vite application shell.
- English, Simplified Chinese, and Traditional Chinese UI.
- A first code-native P&L Arena mark—arena ring, zero line, and P/L trace—now uses one geometry/color/opacity contract across the welcome screen, sidebar, share preview, generated PNG, and favicon. Brand chartreuse is kept separate from the mint/amber/blue/red financial and trust-status palette, and dynamic season headings use the report year.
- Missing financial evidence is no longer presented as numeric zero. Realized YTD explanation can use a source-backed Month/YTD fallback; current unrealized requires the dedicated supported section. Non-zero reconciliation differences retain visible precision, and missing TWR is explicitly unavailable across the app and all share forms.
- Achievement presentation now distinguishes Preview, Unlocked, Not met, Unavailable, Not applicable, and Not supported yet. Header counts use those final presentation states, unavailable cards explain the missing evidence, and synthetic data remains preview-only. The underlying trigger calculations and thresholds are unchanged.
- Release-candidate layout checks now cover 1024 px Import, 812 px local Arena, 768 px onboarding/navigation, and simplified 500/320 px Ledger and Arena tables. Production Chrome also verifies the generated-card footer spacing and the browser's visible download-start state; the remaining share status labels are implemented and present in all three locales, without a claim that every native share outcome was exercised in Chrome.
- A dedicated first-use screen offers two clear paths—explore fully fictional Demo data or import a supported statement—and remains reopenable from the app. It is marked seen only after the user chooses a path; that non-financial preference and the interface language are the only approved localStorage values.
- Beginner-facing import guidance exposes all five required IBKR export settings before file selection. Every one of the 45 fixed parser diagnostics maps to a bounded, localized recovery category, while failed, cancelled, duplicate, same-date, and older imports explain that the report already open in the tab was not replaced.
- The four headline metrics now pair a one-line plain-language definition with an expandable explanation. Demo/test wording remains source-neutral, and the Ledger separates Data source from Internal calculation check instead of presenting arithmetic closure as authenticity.
- Ordinary user files are labelled `Self-reported · not broker-verified` everywhere the result can be read or shared, including the Arena, Ledger, copied summary, preview, and generated PNG. Every share form also carries the independent internal calculation-check status.
- First-use, import-success, duplicate, same-date, older, Demo, and clearing feedback use in-page notices rather than blocking alerts. A fresh document keeps the natural keyboard order; in-app page and guide/application transitions reset scroll and restore main-region focus. Metric disclosures have unique accessible names, notice dismissal restores focus, and cancellation has one polite announcement path.
- A three-locale contract now requires every English, Simplified Chinese, and Traditional Chinese key to be explicitly present with matching placeholders, and renders all first-user surfaces to catch missing copy or functional hard-coded English.
- A three-locale Privacy & Data notice with explicit local-processing, storage, authenticity, PDF, disclaimer, and clearing boundaries.
- Accessible dialog behavior for the Privacy & Data notice: initial focus, contained Tab/Shift+Tab navigation, Escape and backdrop close, focus return, and background interaction lock.
- Local-only CSV reading; no backend or database. File reading and parsing run in a dedicated Web Worker rather than on the UI thread. The policy gate rejects unapproved network/persistence APIs across the functional source tree, while production Chrome verifies empty alternate browser stores and a fixed static-request allowlist with no WebSocket, external request, non-GET request, or query payload.
- A hard maximum 12-second total import timeout covers worker-side file reading, both parser passes and result return. The lower-level helper may request a shorter timeout but cannot extend it beyond 12 seconds. A replacement that passes the filename, non-empty and size preflight, an explicit cancel, a Demo switch or page unmount terminates the old worker before the replacement is parsed.
- A versioned Worker protocol validates both requests and complete returned reports on both sides. It rejects malformed objects, unknown fields, sparse arrays, invalid dates/currencies/hashes/numbers, unsafe diagnostics, or parser facts that disagree with the returned TWR evidence and deterministic warnings. It also rejects files above 5 MiB, salts outside 16–128 characters, and reports above the unpaginated-UI budgets. Shared `reportCapacity` constants keep the parser and final Worker validator aligned at 500 retained underlyings, 1,000 deduplicated lifecycle events, 256 distinct section strings after known IBKR codes are mapped to names, 20,000 total source-reference occurrences, 501 references in one rendered collection (500 detail references plus one broker-total reference), 25,000 total array items, 1,000,000 actual string characters, and the same per-field length/control-character limits for input-derived report strings.
- The production IBKR parser now tokenizes CSV one logical row at a time instead of first constructing a full-file `string[][]`. It materializes records only for the registered sections consumed by the parser. Financial Instrument Information (FII) is handled by a second row-by-row scan: scope, schema, identity, and alias conflicts are still checked globally, including unused aliases, while underlying mappings and source references are retained only for aliases the accounting/event sections actually need. A CSV row may contain at most 4,096 fields; a 4,097th field returns the fixed `csv_too_many_fields` diagnostic.
- The production Worker no longer calls whole-file `Blob.text()` or `arrayBuffer()`. It reopens the filename-free Blob for two bounded-chunk UTF-8 decoding passes: the first builds the selective statement index and incrementally computes the existing UTF-16 fingerprint plus normalized synthetic SHA-256 identity; the second scans FII after the demanded aliases and expected account are known. This deliberately remains a two-pass design so unused FII conflicts stay globally visible without retaining every mapping. The direct string parser remains synchronous for compatibility and both routes share the same tokenizer, collectors, accounting finalizer and fixed diagnostics.
- The parser returns the fixed `report_capacity_exceeded` diagnostic before constructing or appending the 1,001st deduplicated final event, and before portfolio aggregation or `PortfolioReport` construction when a 501st symbol satisfies the existing retained-output predicate. Known section codes are mapped to names during the selective first scan; exactly 256 distinct exact section strings remain allowed, and a 257th returns the same fixed diagnostic before the FII second pass or report construction. During parsing, explicit canonical-key collectors retain at most 501 accepted source references plus one overflow sentinel; repeated references do not consume the boundary, invalid-number evidence retains only its first reference, and large invalid-reference arrays are never spread into function arguments. Per-collection and 20,000-total-occurrence checks run before report construction. After the report is assembled, its input-derived strings and actual item/string footprint must also fit the shared Worker budgets, so an overlong field or long-reference report returns the fixed capacity error instead of degrading to `worker_failure`; the aggregate string budget may fail earlier than the independent 20,000-reference maximum. The final Worker schema validator repeats every output boundary.
- A runtime-only fully fictional capacity generator combines four headline exact caps: 5,242,880 bytes (5 MiB), 100,000 rows, 500 underlyings, and 1,000 assignment/expiration events. The production-Chrome gate imports and renders it through the real Worker, measures main-thread gaps, searches the last underlying, opens its event drawer, exercises the visible cancel control and confirms Worker termination. Separate 501-symbol and 1,001-event adversarial CSVs are each padded to exactly 5 MiB and 100,000 rows; both return the fixed capacity error through the production Worker in under 10 seconds, terminate that Worker, and preserve the prior 500-row report. A 5 MiB plus one-byte file is rejected before a Worker starts. Every generated CSV is deleted with the isolated browser profile and is not shipped or committed as a large fixture.
- A separate repository-external iPhone stress-pack tool prepares five deterministic, fully fictional CSVs: the registered small control, an accepted exact-capacity case, a cancellation/timeout probe, and fixed 501-symbol/1,001-event rejections. It records fixed SHA-256 values, verifies bytes/rows/parser outcomes and tamper detection, refuses to overwrite an output directory, and creates an immutable `NOT_RUN` device-results template. The multi-megabyte files are never committed. The registered `00` control is labelled Fully Synthetic Test; accepted but unregistered `01`/`02` inputs remain conservatively Self-reported · not broker-verified; rejected `03`/`04` inputs create no report trust label. Checkpoint 0.15 records the separate, sanitized iPhone result in `docs/IPHONE_SAFARI_EVIDENCE_2026-09-02.md`; generation/parser checks alone are still not device evidence. See `docs/IPHONE_STRESS_TEST_PACK.md`.
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
- PNG season card and copyable text summary whose default outputs omit underlying symbols, account identifiers, and exact net liquidation value. On supported iPhone/iPad Safari, secure contexts prefer native file sharing; when that capability is unavailable, the page provides an explicit local Blob preview and Safari-save path instead of a hidden programmatic download.
- Explicit Synthetic Demo, Fully Synthetic Test, Self-Reported · not broker-verified, and Internal Checks Passed statuses. “Internal Checks Passed” appears only when every configured reconciliation check passed; unavailable checks require review. Local results are unranked, synthetic data does not unlock achievements, and missing or non-USD NAV does not invent a USD capital division.
- Responsive desktop and mobile layouts.
- Frozen browser support baseline: iOS 16.4+ and Safari 16.4+. The production build target is explicit and covered by a compatibility contract check; the development server is not used as proof of that floor.
- Desktop browser keyboard/focus checks have passed for page changes, both dialogs, controls, status messages, and focus return. A 320 px simulated narrow-screen check also covered bottom navigation, the Ledger table and share card, the Arena scroll region, the privacy dialog, and the symbol drawer. The checkpoint 0.15 iPhone 17 Pro Max / iOS 27.0 system-Safari evidence additionally covers production-page loading, three-locale privacy dialogs, the system file picker, fictional-CSV import, refresh and tab-close clearing, synthetic no-rank/no-trophy rules, exact 5 MiB / 100,000-row / 500-symbol / 1,000-event acceptance, visible cancellation with no late result, natural timeout, and 501-symbol/1,001-event rejection while preserving the accepted report. An imported fictional report PNG was saved through the local-HTTP fallback and reopened from Files as a nonblank 1200×1500 PNG. Still unverified are iOS/Safari 16.4, rotation, measured peak memory, secure-context HTTPS native file sharing and its exact filename, deployed Network/Storage behavior, and complete VoiceOver speech/focus order. The one VoiceOver-enabled cancellation run proves only visible state recovery and no late result, not that its announcement was heard or that Worker termination was directly observed.
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

This runs TypeScript checking, the parser smoke, exhaustive CSV/Blob-streaming/hash equivalence, selective-materialization, strict Worker protocol, accessibility structure/keyboard, frozen browser-compatibility, product-policy/privacy and macOS launcher suites, plus a real local Chrome import/PNG regression against a freshly built production bundle. `VERIFY_MAC.command` also performs the locked install, vulnerability audit, and a final production build. The automated Chrome result does not establish the frozen Safari/iOS baseline. The expected bundled sample result is:

```text
Season P&L:  $20,040
Stock P&L:   $13,690
Options P&L:  $6,350
Symbols:             6
Option events:       5
```

The smoke suite also parses `tests/fixtures/ibkr-current-schema-synthetic.csv`. That fixture is fully invented and covers repeated and multiple header shapes, `Data`/`SubTotal`/`Total` rows, and the tested empty-record-type Total P/L row. Its MTM, statement-period P/L, and NAV-bridge checks must all return `PASS_EXACT`.

### Optional browser-Worker heap diagnostic

`npm run measure:browser-worker-memory` first runs the ordinary browser regression without heap sampling, then separately samples three fictional imports in their real production Chrome Worker isolates. It records only numeric heap counters, response gaps and coverage limits; short-lived Workers may yield insufficient observations. An observed sampled maximum is not the true continuous peak, total browser memory or an iPhone/Safari safety threshold. No GC or Worker-lifetime change is made. `npm run check` includes the deterministic sampler unit tests but does not enable actual sampling. See `docs/BROWSER_WORKER_HEAP_EVIDENCE_2026-09-06.md` for results and the optional non-overwriting numeric-evidence output.

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

The selected CSV is converted to a filename-free browser `Blob`, then read and parsed inside a dedicated Web Worker. The current MVP does not have a backend. The raw file/Blob is held only for the active parse task and is not retained after completion. The raw account identifier is discarded after parsing; a session-salted SHA-256 comparison key is retained only in the current tab so two snapshots can be compared without relying on a collision-prone four-character mask. Only the normalized report remains in current-session memory, and it is not written to browser persistent storage by default. `localStorage` is limited to two non-sensitive preferences: interface language and whether the introductory guide has been seen. Default share preview/copy/PNG output excludes holdings, account identifiers, the comparison key, and exact net liquidation value; a displayed capital division may still reveal a broad USD balance range. A PNG season card that the user downloads, shares to another app, or opens in another tab becomes a separate copy and must be deleted at that destination if no longer wanted.

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
    sha256.ts       incremental SHA-256 for local content/account comparison
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
  test-csv-streaming.mjs exhaustive chunk/decode/hash/parser equivalence checks
  measure-parser-memory.mjs diagnostic same-machine parser-memory proxy
  synthetic-capacity-statement.mjs runtime-only fictional boundary generator
  generate-iphone-stress-pack.mjs repository-external fictional device-pack generator
  verify-iphone-stress-pack.mjs strict device-pack contract and provenance verifier
  test-iphone-stress-pack.mjs path-safety, tamper, parser-outcome, and cleanup regression
  test-parser-materialization.mjs deterministic selective-materialization pressure regression
  test-browser-import.mjs
  test-import-recovery.mjs  controlled production-Worker timeout, retry, preservation, and focus regression
  test-share-interactions.mjs  controlled production share/clipboard lifecycle regression
  test-i18n-contract.mjs  explicit three-locale key, placeholder, render, and hard-coded-copy contract
  test-mac-launchers.mjs
  test-product-policy.mjs
  test-worker-boundary.mjs
docs/
  CAPACITY_BROWSER_EVIDENCE_2026-08-31.md  production-Chrome exact-capacity and cancellation evidence
  IPHONE_STRESS_TEST_PACK.md  fictional boundary-pack generation, verification, and honest device-test rules
  PARSER_MATERIALIZATION_EVIDENCE_2026-08-31.md  row-tokenizer, selective-materialization, and memory-proxy evidence
  PARSER_STREAMING_EVIDENCE_2026-08-31.md  Blob streaming, incremental-hash, equivalence, and non-claim evidence
  IPHONE_SAFARI_EVIDENCE_2026-09-01.md  partial iPhone 17 Pro Max / iOS 27 Safari production-bundle evidence and open gates
  IPHONE_SAFARI_EVIDENCE_2026-09-02.md  checkpoint 0.15 fictional iPhone stress, privacy, PNG and tab-session evidence
  FIRST_USER_EXPERIENCE_EVIDENCE_2026-09-02.md  checkpoint 0.16 beginner flow, recovery, trust, accessibility, and browser evidence
  RELEASE_CANDIDATE_REFINEMENT_EVIDENCE_2026-09-05.md  checkpoint 0.17 visual identity, unavailable-state, responsive, and share evidence
  SHARE_RECOVERY_EVIDENCE_2026-09-05.md  checkpoint 0.18 share/copy races and delivery boundaries
  IMPORT_RECOVERY_EVIDENCE_2026-09-05.md  checkpoint 0.19 retry focus, controlled timeout, and same-file recovery
  PNG_SAVE_GUIDANCE_EVIDENCE_2026-09-06.md  checkpoint 0.20 named-download attempt, save guidance and visible preview focus
  MANUAL_COPY_EVIDENCE_2026-09-06.md  checkpoint 0.21 read-only summary selection, copy denial and focus/lifecycle coverage
  COPY_ACTION_STABILITY_EVIDENCE_2026-09-06.md  checkpoint 0.23 fixed copy-action geometry and separate status feedback
  IPHONE_COPY_ACTION_EVIDENCE_2026-09-09.md  bounded 0.23 iPhone three-locale HTTP feedback/reset and same-coordinate Manual evidence
  IPHONE_FOCUS_EVIDENCE_2026-09-09.md  0.23 three-locale real keyboard PNG-close focus with a different-target control
  SHORT_LANDSCAPE_EVIDENCE_2026-09-09.md  0.24 candidate sidebar red/green desktop evidence; separate pending phone rotation
  RELEASE_GATE_TRACKER.md  stable 12-gate baseline, current remaining count, dependencies and per-session reporting
  IPHONE_SHARE_EVIDENCE_2026-09-06.md  bounded 7b61ab5 iPhone 15 Plus HTTP PNG, system-keyboard copy and cleanup evidence
  BROWSER_WORKER_HEAP_EVIDENCE_2026-09-06.md  checkpoint 0.22 numeric Worker heap diagnostic and incomplete-coverage limits
  WORKER_HEAP_SAMPLES_2026-09-06.json  fictional fixture identities, isolate counters and request/response samples
  IPHONE_SAFARI_EVIDENCE_2026-09-06.md  checkpoint 0.19 phone recovery, privacy, PNG and bounded cleanup
  IPHONE_SAFARI_TEST_CHECKLIST.md  beginner-safe real-device test steps using only fictional CSV data
  OPTION_EXERCISE_EVIDENCE_2026-08-30.md  official semantics review and exact evidence still required
  PRIVATE_TEST_HOSTING_RESEARCH_2026-08-30.md  A + C private-host comparison, proposed gates and stop conditions
```

## Known MVP limitations

- The checkpoint 0.15 project state retains the read-only calibration against one private English single-account 2026 YTD Activity Statement; the synchronous and Blob-streaming routes returned the same result, all three reconciliation checks passed exactly, and its source hash remained unchanged. The private source remains outside the repository; the committed current-schema fixture, mixed-YTD cases, and runtime capacity inputs are fully synthetic, not transformed or anonymized private data.
- The matching PDF has been manually cross-reconciled, but the Web App does not yet automate PDF checks.
- Other IBKR report variants, locales, account structures and future template changes still require fixtures and aliases.
- Custom wide Flex NAV queries that omit any registered asset field, or contain a non-empty `Model`, deliberately fail closed; checkpoint 0.9 supports only the full-account, full-field wide NAV contract.
- A file containing both MTM and Month/YTD is accepted only when the two independently valid sections match exactly by all-assets YTD MTM and by every normalized broker-asset-category + underlying bucket. Missing keys, raw category changes, bucket swaps, Model slices, account mismatch, structural drift, or even a one-micro-unit cross-source difference fail closed. This compatibility gate is arithmetic consistency, not proof that the statement is genuine.
- The Worker boundary prevents parser work from blocking the UI thread, enforces a total timeout, and validates its serialized protocol. A fully fictional file at the exact byte/row/symbol/event caps passed the automated macOS production-Chrome responsiveness gate, but boundary performance still needs confirmation on the supported iPhone/Safari 16.4+ baseline. Protected-host testing remains deferred with all deployment work.
- The parser now rejects the 1,001st deduplicated final event before constructing or appending it, rejects the 501st retained normalized symbol before portfolio aggregation and `PortfolioReport` construction, and prechecks source-reference collection/occurrence limits before building the report. It then checks the assembled result's actual aggregate item/string footprint before returning it. The Worker repeats the complete serialized-output validation as defense in depth.
- Blob input is now decoded incrementally and never joined into a complete application-owned statement string. The Worker intentionally reads the immutable Blob twice because FII demand is known only after the selective first pass. This is true bounded-chunk ingestion, but not a single-pass parser, proof that a browser engine never caches Blob bytes internally, or a measured iPhone/Safari peak-memory result. The 5 MiB, 100,000-row, 4,096-field-per-row and hard 12-second limits remain the outer resource bounds. Node process memory and desktop-Chrome evidence remain diagnostic rather than release thresholds.
- The Worker protocol checks the structure and internal consistency of the trusted same-origin parser result. It is not cryptographic proof that an uploaded statement came from IBKR, so local imports remain Self-reported · not broker-verified.
- A structurally valid report above the current UI capacity caps fails closed with the fixed capacity diagnostic. A future larger-account workflow still needs pagination/virtualization before raising those limits.
- Historical checkpoint 0.15 and 0.19 (`8cf0496`) iPhone 17 Pro Max observations remain in their dated evidence files, including the old HTTP double-extension failures. The newer `7b61ab5` iPhone 15 Plus session in `docs/IPHONE_SHARE_EVIDENCE_2026-09-06.md` proves the two recorded HTTP PNG naming/save/reopen routes and three-language system-keyboard copying. It does not establish the 0.23 action geometry on phone, touch-menu copying, actual PNG focus return, iOS/Safari 16.4, rotation, measured peak memory, complete VoiceOver, HTTPS native sharing/exact naming, deployed Network/Storage or a qualified Exercise row. Desktop simulations and different devices/builds remain distinct evidence.
- Assignment and expiration are covered by the private calibration and synthetic fixture; exercise detection still lacks a qualified real or independently proven CSV fixture. The official-source review in `docs/OPTION_EXERCISE_EVIDENCE_2026-08-30.md` confirms the semantics but deliberately does not invent the missing CSV serialization.
- The arena is intentionally a synthetic interface demo; it is not a real public leaderboard.
- Ordinary user CSV uploads are Self-reported · not broker-verified and must not be presented as authenticated by IBKR.
- The two exact repository-owned fictional CSVs are matched by normalized SHA-256 content digest and labelled Fully Synthetic Test when imported; this does not detect whether arbitrary third-party statements are authentic or AI-edited.
- Capital-division thresholds are currently USD-only. Non-USD reports can be parsed locally, but their division remains unavailable until an explicit exchange-rate policy exists.
- Internal arithmetic closure is not proof that an uploaded statement is authentic; it is labelled only Internal Checks Passed.
- Season return is shown only when a usable explicit return field exists in MTM, NAV, or Change in NAV. Month/YTD/PLUI cannot supply it.
- No server, account login, social feed, payment, automatic IBKR connection, or historical season archive yet.
- Badge art is currently a geometric placeholder system; original meme character artwork and a complete brand/trademark package are later visual workstreams. The checkpoint 0.17 code-native mark is the first consistent product identifier, not a completed brand delivery.

## Immediate next workstream

1. Continue D07 from the September 25 hotel-Wi-Fi iPhone evidence: Safari loaded 0.30, a wholly fictional CSV imported, and the user confirmed hearing its success notification without giving its words/order. A fictional malformed file showed a visible error and the prior source badge, but its speech and the complete post-error Ledger were not confirmed. Full navigation, privacy/focus return, manual-selection and in-progress-cancellation speech remain open. The phone files were moved to recoverable Recently Deleted, the test tab/service closed, VoiceOver Off and original Pinyin restored. The new 0.31 build has no phone pass. Do not infer D07 closure from the partial hearing result, or retry actual-file/phone stages without explaining their scope and cleanup. D01 measurement remains developer-owned; D02/16.4 and full D08 rotation are open. See `docs/IPHONE_HOTEL_WIFI_VOICEOVER_EVIDENCE_2026-09-25.md`, `docs/CASH_BADGE_AND_CSV_ROW_WIDTH_EVIDENCE_2026-09-25.md` and the fixed [gate tracker](docs/RELEASE_GATE_TRACKER.md); 9 gates and L remain unchanged.
2. Obtain a qualified exercise-event fixture when one becomes available, then expand parser compatibility only from independently proven IBKR shapes rather than guesses. The iOS/Safari 16.4 floor, measured browser-Worker peak memory and complete VoiceOver behavior also remain separate open gates; a newer iPhone or desktop simulation cannot establish them.
3. Keep all hosting work deferred under L. Secure-context HTTPS native sharing/exact naming, automatic clipboard permission behavior on that host, protected-host headers and deployed Network/Storage inspection remain deferred. The recorded HTTP naming and system-keyboard-copy passes are not deployment or release-readiness decisions; remaining local device checks do not authorize hosting.
4. Keep original trophy artwork and complete brand/trademark work as a later visual stream. The code-native checkpoint 0.17 mark is sufficient for a consistent local prototype, not a claim of finished branding.

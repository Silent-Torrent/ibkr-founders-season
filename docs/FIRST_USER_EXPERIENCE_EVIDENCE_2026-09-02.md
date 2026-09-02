# Checkpoint 0.16 first-user-experience evidence

Date: 2026-09-02

Scope: local production bundle and repository-owned fully fictional data only

Deployment: not performed; decision L remains active

## Outcome

Checkpoint 0.16 completes the approved first-user-experience decisions:

1. First use presents two explicit paths: explore fully fictional Demo data or import a supported IBKR Activity Statement CSV. The guide is marked seen only after a path is chosen and can be reopened without discarding the current in-memory report.
2. Each of the four headline metrics has a one-line beginner definition and an expandable explanation. Demo and test copy is source-neutral rather than implying that fictional values were reported by a broker.
3. Data provenance and arithmetic consistency are separate statuses. Ordinary user data is labelled `Self-reported · not broker-verified`, while Internal calculation check reports only the supported structural and arithmetic checks.

## Import and recovery behavior

- The Import page shows Activity Statement, Year to Date, CSV, English and one-account requirements before a file is selected.
- All 42 fixed diagnostics map exhaustively to a small set of localized recovery actions.
- A failed or cancelled import states that nothing was uploaded and the report already open in the tab was not replaced.
- Success, duplicate, same-date, older-file, Demo and clearing outcomes use persistent in-page notices rather than blocking JavaScript alerts.
- If an imported report is open, declining the confirmation to switch to Demo performs no action and does not silently stop an import already in progress.
- No error or recovery copy includes an uploaded filename, raw statement value, account identifier or holding.

## Trust and sharing boundary

- The Ledger trust panel has two independent fields: Data source and Internal calculation check.
- Passing internal checks does not change a local user file into broker-verified data.
- The Arena, share-card preview, copied text summary and generated PNG use the same explicit non-broker-verified label for ordinary local reports.
- Every default share output also carries the independent Internal calculation check status; a warning cannot disappear when the result is shared.
- Fully Synthetic Test remains restricted to the repository-owned exact normalized hashes; Demo and test data do not receive local ranks or achievements.

## Persistence and accessibility boundary

- Only interface language and whether the introductory guide has been seen may be stored in localStorage.
- Raw CSV and the normalized financial report remain current-tab memory only; refresh returns to Demo.
- The policy gate scans the full functional source tree for unapproved browser persistence and network APIs. Production Chrome also requires empty sessionStorage, IndexedDB, Cache Storage and service-worker state, no WebSocket, no non-GET request, no external request, and only fixed static same-origin paths without query payloads.
- A fresh document keeps the browser's natural keyboard order. In-app transitions between the guide and application reset scroll to the top and move focus to the new main region; dismissing an in-page notice returns focus to the current main region.
- Each metric explanation has a unique accessible name containing the metric label.
- Import cancellation uses one polite announcement path.
- English, Simplified Chinese and Traditional Chinese must explicitly contain the same keys and placeholders; the first-user surfaces render in all three locales during verification.

## Automated evidence

Focused checks passed under Node.js 22.23.2:

- TypeScript typecheck.
- Explicit three-locale contract.
- Accessibility structure contract.
- Product policy and privacy contract.
- Production-Chrome import regression.

The complete `VERIFY_MAC.command` gate then passed under Node.js 22.23.2 and npm 10.9.8: clean locked installation, two dependency vulnerability checks with zero reported vulnerabilities, every automated suite, and the final production build.

The production-Chrome run verified the first-use choice and preference timing, guide reopening with report preservation, natural initial focus order, transition scroll/focus restoration, notice-dismissal focus recovery, 320 px invalid-file recovery, four metric explanations, two-column trust separation, both trust dimensions in every share format, success/duplicate/same-date/older outcomes, the two-key storage allowlist, empty alternate browser stores, visible cancellation with no late result, a declined Demo confirmation and an invalid second-file attempt each leaving an active valid import undisturbed, exact-capacity acceptance, over-limit preservation, PNG decoding/privacy canaries, and the strict request allowlist.

## Visual evidence

Local visual inspection covered:

- first-use screen at the normal desktop viewport;
- Ledger trust and metric hierarchy at the normal desktop viewport;
- first-use layout at 320 px;
- invalid-file alert and recovery panel at 320 px.

At 320 px, the document measured exactly 320 px wide. The tested recovery panel occupied x=16 through x=304 and did not create whole-page horizontal overflow. This is macOS browser simulation, not new iPhone or VoiceOver evidence.

## Explicit non-claims

Checkpoint 0.16 does not prove:

- that an arbitrary uploaded CSV is authentic, unedited or issued by IBKR;
- the supported iOS/Safari 16.4 floor;
- complete VoiceOver speech or focus order on a real device;
- real-device rotation or browser-Worker peak memory;
- HTTPS native sharing or exact requested filename preservation;
- deployed Network, Storage, headers or MIME behavior;
- qualified Exercise-event parsing;
- automated PDF reconciliation.

No private statement was opened, copied, modified or added to the repository during this checkpoint.

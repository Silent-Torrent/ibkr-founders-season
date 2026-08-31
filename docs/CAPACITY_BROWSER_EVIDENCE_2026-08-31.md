# Capacity and cancellation browser evidence — 2026-08-31

## What was tested

The automated production-browser regression now creates temporary, fully fictional English IBKR-shaped CSVs at runtime. They are not copied from the private calibration statement, are not committed as multi-megabyte fixtures, are not shipped in the Web App, and are deleted with the isolated Chrome profile after the run.

The generated statement combines four headline exact caps in one file:

- exactly 5,242,880 bytes (5 MiB);
- exactly 100,000 non-empty CSV rows;
- 500 fictional option underlyings;
- 1,000 fictional lifecycle events: one assignment and one expiration per underlying;
- deterministic SHA-256 for the current generator output: `83bcab1e6fa5a86c299c1fa9c75044c7f0b9238d915c04612e7bc86e70ff97b2`.

The event set deliberately contains no exercise. It therefore does not close the separately documented exercise-evidence gap.

## Production Chrome path that passed

The test rebuilds the production bundle, opens it from an isolated `127.0.0.1` preview, and selects files through the real browser file input. It does not call the parser directly for this browser result.

The automated assertions cover:

- the visible busy state appearing while the production module Worker exists;
- clicking the real `Cancel import` control during a boundary-file import;
- the cancellation announcement, no late Ledger navigation, and removal of the cancelled Worker target;
- no late Ledger navigation during a wait longer than the 12-second timeout budget after cancellation;
- a second complete import of the exact-capacity file through the Worker;
- 500 rendered Ledger rows;
- a search for the last underlying and opening its drawer;
- the drawer retaining one assignment, zero exercises, one expiration, and two event records;
- separate 501-symbol and 1,001-event adversarial CSVs, each padded to exactly 5 MiB and 100,000 rows, producing the fixed `report_capacity_exceeded` failure in under 10 seconds, terminating their Workers, and preserving the prior 500-row report;
- a file of 5 MiB plus one byte being rejected before a Worker is created;
- no external page request, no POST, and no browser/runtime/log error across the complete regression.

The companion Worker contract test directly parses the same generated text and confirms exactly 500 symbols, exactly 1,000 events, one assignment plus one expiration per symbol, exact all-assets MTM reconciliation, and acceptance by the serialized Worker-output validator. Parser smoke tests separately cover known-code mapping. Code order places the unique-event and retained-symbol guards before the over-limit event append and before portfolio/report construction respectively; tests confirm the fixed no-report capacity failure at 1,001 events and 501 retained symbols. The same contract suite accepts exactly 256 distinct exact section strings at the post-mapping stage and rejects 257, accepts exactly 501 references in an event or metric collection and rejects 502, leaves an unused over-limit internal mapping bounded without rejecting the final report, and maps overlong input-derived report strings to fixed capacity failure. A dense real parser result fits both aggregate budgets; the next tested dense step crosses the string-character budget and returns fixed capacity failure. Compact constructed results independently prove exact 1,000,000/1,000,001 aggregate string-character and 20,000/20,001 total-reference boundaries. Shared parser/Worker limits, explicit canonical-key bounded collectors, spread-safe invalid-reference handling, parser-side per-collection/total-reference checks, after-assembly per-field and aggregate item/string checks, and the unchanged final Worker validator provide layered enforcement. These are direct code/contract results, not additional production-Chrome scenarios.

## Enforced desktop performance gates

The exact-capacity import/render must complete below 10 seconds, no timer gap, animation-frame gap, or observed long task may reach 250 ms, and search feedback must arrive below 500 ms. Each adversarial 501-symbol and 1,001-event Worker rejection must also complete below 10 seconds. Performance varies by machine, so the verification reruns these thresholds rather than preserving one run's millisecond values as a permanent benchmark.

## What this does not prove

- It is a macOS Google Chrome production-bundle result, not a real iPhone, Safari 16.4, or VoiceOver result.
- The file is assigned to the real HTML file input through Chrome DevTools; this exercises the production input handler and Worker but not the macOS or iPhone operating-system file-picker UI.
- The capacity pass runs after a small import and cancellation in the same isolated browser. Module and filesystem caches may therefore be warm; it is a repeatable local regression gate, not a cold-start device service-level promise.
- It does not prove the 12-second timeout through a naturally slow real Worker. Timeout and late-settlement logic still have deterministic lifecycle-contract coverage, while a real-device timeout remains open.
- It does not prove deployed security headers, Worker MIME handling, browser Storage, or Network behavior because deployment remains deferred.
- Code order places the over-event and retained-symbol exits before the event append and portfolio/report construction respectively. After the selective first-pass index maps known section codes to names, exactly 256 distinct exact section strings remain allowed; a 257th returns fixed `report_capacity_exceeded` before the FII pass or report construction. A source-reference collection retains at most 501 accepted entries plus one overflow sentinel, invalid-number evidence retains one reference, and the 501-per-collection/20,000-total-occurrence limits are checked before report construction. Per-field length/control-character limits and the aggregate 25,000-item/1,000,000-string-character check necessarily run after report assembly but before parser return, so an overlong field or long references return fixed capacity failure; the aggregate limit may trigger before the independent 20,000-reference maximum. The final Worker validator repeats every output limit.
- Checkpoint 0.14 replaced whole-file Worker decoding with two bounded-chunk Blob passes and reran this exact production-Chrome gate successfully. That removes the application-owned complete decoded string but does not prove browser-engine Blob caching behavior, eliminate the selective index/global FII/final-report allocations, or establish real-device peak memory. See `PARSER_STREAMING_EVIDENCE_2026-08-31.md`.
- The 1,000 events are distributed as two events for each of 500 symbols. The test proves total parser/Worker/protocol carriage and one two-event drawer, not one drawer rendering 1,000 events.
- The test does not measure peak memory, Safari Worker reclamation, or a real IBKR statement whose row distribution differs from the synthetic padding section.
- Internal structure, arithmetic, and capacity checks do not prove that a user-supplied statement is genuine or came from IBKR.

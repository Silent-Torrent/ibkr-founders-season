# Capacity and cancellation browser evidence — 2026-08-31

## What was tested

The automated production-browser regression now creates a temporary, fully fictional English IBKR-shaped CSV at runtime. It is not copied from the private calibration statement, is not committed as a multi-megabyte fixture, is not shipped in the Web App, and is deleted with the isolated Chrome profile after the run.

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
- real CSVs with 501 symbols and 1,001 events producing the fixed safe failure, terminating their Workers, and preserving the prior 500-row report;
- a file of 5 MiB plus one byte being rejected before a Worker is created;
- no external page request, no POST, and no browser/runtime/log error across the complete regression.

The companion Worker contract test directly parses the same generated text and confirms exactly 500 symbols, exactly 1,000 events, one assignment plus one expiration per symbol, exact all-assets MTM reconciliation, and acceptance by the serialized Worker-output validator.

## Recorded desktop performance

One repeat production-Chrome run on the development Mac recorded:

- file selection through completed 500-row Ledger render plus the next timer and animation frame: 857.8 ms;
- largest animation-frame gap: 17.7 ms;
- largest 16 ms timer gap: 72.8 ms;
- largest Long Tasks API entry: 55.0 ms;
- search-to-one-row update, measured from before event dispatch: 15.0 ms.

The enforced gates are deliberately looser than that one measurement: total import plus render must stay below 10 seconds, and no timer gap, animation-frame gap, or observed long task may reach 250 ms. Search feedback must arrive below 500 ms. Performance numbers vary by machine, so every full verification reruns the gate instead of treating this record as a permanent benchmark.

## What this does not prove

- It is a macOS Google Chrome production-bundle result, not a real iPhone, Safari 16.4, or VoiceOver result.
- The file is assigned to the real HTML file input through Chrome DevTools; this exercises the production input handler and Worker but not the macOS or iPhone operating-system file-picker UI.
- The capacity pass runs after a small import and cancellation in the same isolated browser. Module and filesystem caches may therefore be warm; it is a repeatable local regression gate, not a cold-start device service-level promise.
- It does not prove the 12-second timeout through a naturally slow real Worker. Timeout and late-settlement logic still have deterministic lifecycle-contract coverage, while a real-device timeout remains open.
- It does not prove deployed security headers, Worker MIME handling, browser Storage, or Network behavior because deployment remains deferred.
- The output caps are still enforced after the Worker parser constructs its normalized result. An adversarial file below 5 MiB and 100,000 rows could consume extra Worker memory or CPU before an over-cap result is rejected. Parser-stage fail-fast budgets remain a separate hardening item.
- The 1,000 events are distributed as two events for each of 500 symbols. The test proves total parser/Worker/protocol carriage and one two-event drawer, not one drawer rendering 1,000 events.
- The test does not measure peak memory, Safari Worker reclamation, or a real IBKR statement whose row distribution differs from the synthetic padding section.
- Internal structure, arithmetic, and capacity checks do not prove that a user-supplied statement is genuine or came from IBKR.

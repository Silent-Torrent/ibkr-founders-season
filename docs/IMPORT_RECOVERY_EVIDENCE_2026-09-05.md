# Checkpoint 0.19 — import recovery and stable retry focus

Date: 2026-09-05. Verification status: local automated checks and production build passed; new iPhone verification not run.

## Scope and reproduced defect

This checkpoint changes only file-picker focus handling and adds local recovery coverage. The parser, accounting rules, Worker implementation, 12-second maximum, capacity limits, snapshot policy, trust labels, dependencies and deployment freeze are unchanged. Only repository-generated fictional CSVs were used; no private CSV/PDF was read or copied.

The main Choose/Cancel branches already reuse the same DOM button. The defect was in the separate error/cancellation recovery buttons: their containing panel disappears when a new file changes the outcome. On the pre-fix production bundle, selecting the small fictional CSV from the error recovery button reached the real Worker busy state but `document.activeElement` had no `data-action`, instead of `cancel-import`. The new regression failed with `Starting a retry lost the main cancel-control focus` (actual empty, expected `cancel-import`). An earlier assertion before selecting the file detected missing focus transfer but was not, by itself, evidence of focus loss; the decisive red check was moved after selection and panel removal.

All three picker entry points now call one synchronous handler: focus the stable main Choose/Cancel button, then open the hidden file input. This also covers cancellation followed by a non-CSV preflight error. There is no new delayed focus effect that could pull a user back after they move to another control. The parser and its existing abort/task-identity checks did not need modification.

## Controlled production-Chrome method

`scripts/test-import-recovery.mjs` is invoked by the existing isolated production-browser suite after exact-capacity and rejection checks, with the accepted 500-underlying report still in memory.

- The test focuses and clicks real rendered picker/retry buttons. CDP intercepts the native chooser and assigns the fictional file through the real file input; `Page.fileChooserOpened` must be observed for every entry. This is not a manually operated macOS or iPhone system picker.
- Three one-shot test-host gates keep real module Workers at their initial debugger wait: one is explicitly cancelled, and two reach the original page's 12-second timeout. The production parser, response protocol, clock timer and timeout constant are not replaced. Test Date fixtures remain fixed as in the existing browser suite; elapsed durations use the host monotonic clock.
- The two timeouts exercise different focus states: retaining the main button and moving to the still-present Demo button without activating it. Timeout must not steal the second focus.
- CDP target disappearance establishes termination of these Chrome Worker targets. A final same-file retry, without refresh/navigation after the second timeout, starts a fresh unpaused production Worker and imports the three-underlying fictional control.
- All held-target gates and chooser interception are released in `finally`; the parent suite removes its isolated temporary files/profile and stops its local server/browser.

These are controlled stalled-Worker tests. They do not prove a natural Safari timeout, a specific file's iPhone speed, native chooser cancellation, VoiceOver speech, peak memory, or OS clipboard/share permissions.

## Verification results

`PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run check` and `npm run build` both exited successfully under Node 22.23.2. Parser, streaming, materialization, Worker, three-locale, accessibility, compatibility, policy/privacy, macOS launcher, stress-pack and production-browser checks all passed. Dependencies were unchanged and no new dependency audit was run.

| Check | Observed result |
| --- | --- |
| Real picker button entries with chooser interception | 5 |
| New cancellation / preflight sequence | Cancelled Worker target disappeared; retry with non-CSV created no Worker; old 500-row report remained |
| Controlled startup-stall timeouts | 12,056.5 ms and 12,058.8 ms; both Worker targets disappeared |
| First timeout preservation | Old 500-row report and capacity-symbol endpoints remained |
| Second timeout, same-page same-file retry | Fresh unpaused Worker imported 3 rows as Fully synthetic test |
| Focus | Main Choose/Cancel focus retained; deliberately moved Demo-control focus not stolen on timeout |
| Existing direct cancel-to-success case | Worker terminated, no late result beyond 12.25 seconds, then fresh exact-capacity import succeeded |
| Existing exact-capacity case | 5,242,880 bytes / 100,000 rows / 500 underlyings / 1,000 events; 788.6 ms import/render; 0 ms recorded long task; 16.8 ms maximum animation-frame gap; 66.6 ms maximum timer gap; 13.7 ms search |
| Existing over-capacity cases | 501 underlyings rejected in 623.9 ms; 1,001 events rejected in 625.0 ms; old report preserved; 5 MiB + 1 byte rejected before Worker creation |
| Existing PNG and share checks | Real desktop PNG: 1,279,488 bytes, decoded 1200 × 1500; 10 controlled copy and 9 controlled share calls passed |

The complete browser run observed 15 Worker targets and 29 allowed static page requests, with no external page requests, non-GET requests, unexpected local paths/query payloads, WebSockets, page runtime exceptions, console warnings/errors or HTTP errors. These page-scoped checks are not a machine-wide network audit. Performance figures describe this run only, not release thresholds for other devices.

The pre-existing external fictional pack at `临时真机测试/iphone-stress-pack-2026-09-02` was independently reverified with `npm run verify:iphone-stress-pack -- <exact external directory>` on 2026-09-05. All five files, bytes/rows/hashes, declared expected outcomes and support-file provenance passed. The pack was not regenerated or modified; its original `RESULTS_NOT_RUN.md` remains an immutable certification template, not a device result. The independent verifier checks declared outcomes, not a fresh parser execution; actual parser-outcome regression is covered separately by the full stress-pack suite above.

## Next user-assisted gate

`docs/IPHONE_SAFARI_TEST_CHECKLIST.md` now has a separately unrun checkpoint 0.19 section. It covers same-tab retry after visible cancellation and natural timeout, preserved reports and recovery after capacity rejection, the current guide/privacy copy and PNG fallback, rotation, and user-heard VoiceOver feedback. It avoids treating duplicate re-import rejection as failed recovery by starting cancellation/timeout cases from separate Demo tabs.

The checklist's stale language-only persistence wording was corrected to the two already-approved non-financial preferences (language and seen-guide state). No new storage was added. The generated pack template must stay unchanged; future observations go outside the certified pack. Old checkpoint 0.15 observations remain historical and are not silently promoted to current-build passes.

No iPhone mirroring, LAN exposure, VoiceOver setting change, real-statement access, deployment, external service or user-data collection was performed in this checkpoint. The next phone session needs the user's participation. iOS/Safari 16.4, browser-Worker peak memory, a qualified Exercise CSV, complete VoiceOver behavior, and deferred HTTPS/deployed-boundary gates remain open.

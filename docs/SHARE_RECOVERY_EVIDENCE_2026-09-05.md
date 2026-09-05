# Checkpoint 0.18 — share and copy recovery

Date: 2026-09-05

Scope: local browser interaction fixes, using repository-owned fictional data. Baseline: checkpoint 0.17, commit `537be0d`.

## Outcome

Share and copy requests now belong to the report/language context that started them. Changing language, clearing/replacing the report, or leaving the Ledger invalidates that context synchronously at commit/unmount. Returning to the original language does not make an old request current again.

This closes two observed code paths: a late rejected system share could create an obsolete preview or fall through to a download before the component rejected its result, and late copy/share callbacks could overwrite newer feedback. Canvas drawing and PNG encoding are synchronous; the relevant delayed PNG boundary is the browser's native share promise.

## Implemented behavior

- Both actions use an in-flight request identity. Rapid repeated clicks cannot submit duplicate requests before the disabled button renders.
- Copy displays `Copying…`, `正在复制…`, or `正在複製…`. Success/failure feedback enables retry; successful feedback returns to the normal label. A prior timer cannot clear a newer pending action or result.
- Report/language changes and unmount invalidate requests and clear applicable timers/preview URLs with synchronous lifecycle cleanup.
- PNG delivery accepts an optional AbortSignal. Already invalidated requests do not draw a card; a request invalidated while waiting for the native share result does not create a subsequent preview or browser download.
- Successful, failed and cancelled callbacks all check context/request identity. An old request's cleanup cannot clear a newer request.
- Existing PNG geometry, filename, data fields, privacy exclusions and normal delivery routes remain unchanged.

## Verification

`npm run check` and `npm run build` both completed successfully under the project's Node 22 runtime. This includes all existing parser, streaming, materialization, Worker, three-locale, accessibility, compatibility, policy, launcher, fictional iPhone-pack and production-Chrome tests. Dependencies were unchanged; no fresh install or vulnerability audit was needed for this scoped change. Historical audit results remain in the checkpoint 0.17 record.

The policy suite directly exercises delayed native-share resolution, generic rejection and AbortError, each with a current and invalidated request, plus a request invalidated before invocation. Invalidated cases attempt neither a preview nor a download, including a preview implementation configured to throw if called.

The production browser runs the actual compiled React app. Only the external share/clipboard APIs and selected failure points are controlled by the test; these cases do not open system sharing or write to the user's real clipboard.

- The new interaction module exercised 10 controlled clipboard calls and 9 controlled native-share calls.
- It checked copying, copied, failed-copy retry, shared, cancelled, fallback preview, full-output failure and retry.
- It checked same-turn duplicate clicks, successful-feedback reset, old timers, language A-to-B-to-A transitions, old requests settling during newer requests, and leaving/reopening the Ledger.
- One expected download attempt was intercepted and deliberately failed in the full-output-failure case; this was not an actual extra file download. Invalidated cases made no new preview or download.
- The existing preview-clear test now also starts both share and copy before clearing the report. Their late rejection/success produced no obsolete feedback, preview or download; all three previously created preview URLs were released.
- Test descriptors, methods and navigation were restored; all controlled promises were settled. Temporary browser artifacts were cleaned up by the existing runner.

The same final browser run separately verified the real desktop PNG download: 1,279,488 bytes, 1200 by 1500 pixels, valid decoding and the existing privacy canaries. The exact-capacity fictional import (5,242,880 bytes, 100,000 rows, 500 symbols, 1,000 events) took 791.1 ms on this Mac; maximum observed long task was 0 ms, frame gap 16.7 ms, timer gap 69.9 ms, and search 12.8 ms. These are observations for this run, not performance guarantees for other devices. The 501-symbol and 1,001-event failures continued to preserve the accepted report.

Independent read-only review found no remaining high/medium-priority issues after synchronous invalidation was added. `git diff --check` passed.

## Limits and next work

Once a call has been submitted to the browser or operating system, the app cannot recall the native share or clipboard operation. Invalidation suppresses late UI feedback and additional fallback output; it does not delete a copy already accepted by another app or undo clipboard contents.

Controlled Chrome API responses do not prove actual iPhone share-sheet behavior, clipboard permission behavior, HTTPS native sharing, or exact filename preservation by iOS. No new iPhone evidence was collected. Existing iOS/Safari baseline, rotation, complete VoiceOver, post-cancel/timeout recovery and peak-memory gates remain open. The qualified Exercise CSV evidence gap also remains open.

No parser, accounting rule, achievement threshold, capacity limit, storage preference, network behavior or dependency was changed. No private statement was opened or uploaded. Source backup remains restricted to the approved private GitHub repository, and deployment remains deferred under decision L.

# Checkpoint 0.22 — production Chrome Worker heap sampling

Date: 2026-09-06

Status: `FINAL_WITH_OPEN_DEVICE_GATES`. The sampler unit suite, opt-in production-browser diagnostic, independent numeric audit and final ordinary full-suite/build rerun passed. No true-peak or device-memory release gate has passed from this document.

Application baseline: checkpoint 0.21, `f1b012ec04673935d801015c0a4ed1d0628ee607`. This checkpoint changes diagnostic scripts and documentation, not the production application, parser/accounting, dependencies or capacity/timeout policy.

## Why this diagnostic exists

The existing `measure:parser-memory` command runs the Blob parser directly in Node and records before/after/GC heap and process high-water values. It does not measure the actual browser Worker. The existing production-Chrome gate does observe real Worker lifecycle, main-thread long tasks and responsiveness, but previously collected no Worker heap samples.

This diagnostic adds an independent, explicitly selected stage after the complete ordinary browser regression. No heap sampler is armed during the existing unprofiled performance checks. It uses the same loopback-only preview, isolated Chrome profile, production file-input/Worker route, fixed reference date and fully fictional data. It collects numbers rather than heap objects, stack contents, CSV rows or private statements.

## Measurement contract

- Each fixture begins with a fresh page showing Demo, then passes through the real file input and production parser. The accepted Ledger row count and disappearance of that exact Worker target are checked.
- The sampler verifies a same-origin production parser-Worker URL and records the target/session/isolate identities, installed Chrome/V8/protocol version, production-asset hashes and fixture SHA-256 values.
- Before allowing the attached Worker to execute its production script, it takes a startup baseline. After acknowledgement of `Runtime.runIfWaitingForDebugger`, the host marks release and requests heap values about every 50 ms, with at most one request in flight. The host acknowledgement is not an exact timestamp of the Worker's first instruction.
- Every successful sample records monotonic request/response times, latency and separate byte fields from `Runtime.getHeapUsage`. Missing optional fields remain unavailable, not zero. Different fields or isolates' maxima are not summed into a supposed total peak.
- The report separates baseline/pre-release/cross-release observations from requests started after the release marker. At least two post-marker successful samples are required for the descriptive label `limited`; fewer are `insufficient`. Every report retains `coverageIncomplete: true`, `truePeakMeasured: false` and `finalReclamationProven: false`.
- Known target/session closure truncates the observation window. The final successful sample is not labelled an after-parse value, nor proof that memory was reclaimed. Other protocol failures, unsupported methods, invalid numbers and request timeouts fail explicitly rather than becoming a zero-memory or success result.
- The production app still terminates the Worker as soon as its result is received and retains the original 12-second maximum. The diagnostic does not force GC, intercept result delivery, delay termination or add parser yield points.

The fixture set covers the small current-schema control, the exact 5 MiB / 100,000-row / 500-symbol / 1,000-event input, and the existing 10,000 cross-section candidate-FII mapping case. The third case exercises different retained mapping work rather than measuring only large discardable padding.

## API interpretation and limitations

`Runtime.getHeapUsage` reports current usage in the target isolate. It does not include every browser/native allocation and is not a continuous high-water recorder. Heap allocation sampling answers a different question and cannot substitute cumulative allocations for simultaneous memory use. [CDP Runtime](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getHeapUsage), [CDP HeapProfiler](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/#method-startSampling)

The asynchronous Blob-streaming path and Chromium's inspector interrupt path permit observations during work, but do not promise a fixed sampling frequency or zero measurement overhead. Long response gaps and the unobserved tail must remain visible. This inference is grounded in the current parser and Chromium implementation, not a claim that every supported browser exposes the same behavior. [Chromium DevTools session](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/core/inspector/devtools_session.cc), [Chromium inspector task runner](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/inspector/inspector_task_runner.cc)

No heap snapshot or forced garbage collection is used. Snapshot creation itself can change memory observations. Device memory capabilities vary; these Mac Chrome numbers cannot define a safe Safari/iPhone budget. [Chrome heap snapshots](https://developer.chrome.com/docs/devtools/memory-problems/heap-snapshots), [Chrome memory-use guidance](https://developer.chrome.com/docs/devtools/memory-problems#memory-bloat-how-much-is-too-much)

## Verification and results

The sampler's 14 deterministic fake-clock/transport groups passed. They cover independent maxima and gap calculations, startup/cross-release exclusions, optional fields versus genuine zero, known session closure, invalid readings and real errors, single-request backpressure, stop during pending work, bounded timeout and late response rejection, and invalid/backwards clocks without unhandled rejection or stuck cleanup. The sampling code sends only `Runtime.getHeapUsage` with empty parameters through its bound session. The fixture-stage helper also passed three isolated fake-helper checks for insufficient coverage preservation, prompt import-error failure and retention of original plus cleanup errors.

The opt-in command completed successfully in Chrome 152.0.7977.76, V8 15.2.124.19, CDP 1.3. Its unprofiled ordinary exact-capacity import completed in 772.1 ms with no observed long task; that timing belongs to the preceding non-sampling gate, not the three measured imports. All three subsequent diagnostic fixtures were genuinely accepted through the file input, showed the expected Ledger row count, and had their exact production Worker targets disappear without altering the app's termination path.

Full numeric evidence is retained in `WORKER_HEAP_SAMPLES_2026-09-06.json`, 32,991 bytes, SHA-256 `7e31b6380cc6507a86b69896b3ce18f85a2bd24d30a27200bf55b1adad06e916`. An independent calculation over its sample arrays rechecked every field's maxima, sample classifications/counts, response gaps, fixture byte/hash identity and final production-asset hashes. It also confirmed separate isolate identities and the explicit non-peak/non-reclamation flags. No fixture text or report values are stored in that file.

All byte counters below are converted to MiB using 1,048,576 bytes. The maxima use only requests started after the host's release-acknowledgement marker:

| Fictional case | Accepted Ledger rows | Runtime samples | Coverage | Max used JS heap | Max allocated JS heap | Max backing storage |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| Small current-schema control, 12,664 bytes | 3 | 0 | Insufficient | Unavailable | Unavailable | Unavailable |
| Exact capacity, 5 MiB / 100,000 rows | 500 | 13 | Limited | 19.929 MiB | 38.000 MiB | 20.074 MiB |
| 10,000 candidate-FII mappings, 5 MiB / 100,000 rows | 1 | 24 | Limited | 24.831 MiB | 46.375 MiB | 20.073 MiB |

These are separate counters, potentially maximal at different instants; do not add them. The optional embedder counter was available in this Chrome and its runtime maximum was 773,712 bytes in each large case; it is not silently included in the table's used-JS-heap figure. The small case had only a pre-execution baseline of 312,504 used-JS-heap bytes, which is deliberately not presented as its runtime memory requirement.

The maximum interval between successful runtime responses was 51.735 ms for exact capacity and 51.683 ms for candidate mappings. The final successful sample preceded the session-closed reply by 50.629 ms and 49.760 ms respectively; these are observation gaps, not exact Worker execution durations. The closure reply and later `Target.getTargets` check are host observations, not an exact timestamp of physical memory reclamation. Every case ended with the known session-closed outcome, not a zero reading or suppressed protocol failure.

The candidate-mapping case demonstrates why byte size and final row count alone cannot predict memory use: two 5 MiB inputs produced different sampled counters despite the second report having only one final row. This single controlled run is diagnostic evidence, not a claim that one production layout always costs that amount or that the difference is a guaranteed optimization target.

The final production assets matched the 0.21 baseline names and hashes recorded with the samples: `index-BKQdU8D0.js`, `index-CEWPZB2W.css` and `ibkrParser.worker-Dy6yjzTG.js`. The opt-in run also retained all existing safety assertions: exactly two expected real PNG downloads, no accepted unexpected network/storage/console behavior and existing import/share/manual-copy regressions.

### Final ordinary acceptance

After the diagnostic, `npm run check && npm run build` completed with exit code 0 under Node 22. All registered type/parser/streaming/materialization/Worker/heap-sampler/locale/accessibility/compatibility/privacy/launcher/stress-pack/browser suites passed. The normal browser route asserted zero real heap samplers and observed the original 15 Worker targets rather than the diagnostic run's 18. Its final exact-capacity import was 804.8 ms, with maximum observed long task 50 ms; these variable timing figures are not an optimization claim.

The final normal run retained 10 controlled copy/9 share lifecycle calls, nine controlled manual-copy-module calls, exactly two verified 1200×1500 PNG downloads, cancellation and the two unchanged-limit controlled timeout recoveries. Both production builds yielded the same application asset identities as 0.21. No production source or dependency-lock change was made.

The complete numeric JSON was retained in the repository and checked byte-for-byte against its temporary original before the duplicate and empty temporary directory were removed. The normal and diagnostic harnesses cleaned their isolated browser profiles, generated CSV/PNG files and loopback servers. No iPhone or user clipboard was accessed, and no phone test file was recreated.

## Repeat locally

Use the project's Node 22 runtime and existing locked dependencies:

```sh
npm run test:worker-heap-sampling
npm run measure:browser-worker-memory
npm run check
npm run build
```

The measurement command runs ordinary unprofiled browser gates first, then the independent diagnostic. `npm run check` does not enable real heap sampling, although it includes the sampler's deterministic unit tests. No phone connection, LAN exposure, dependency installation, real clipboard access or hosting change is required.

For complete per-request numeric evidence, set `WORKER_HEAP_QA_DIR` to an explicitly created, existing absolute temporary directory. The optional writer creates `worker-heap-samples.json` exclusively and refuses to overwrite an existing file. Console output omits the detailed sample/request arrays but retains the statistics and coverage limits. Browser profiles and synthetic input/download files are cleaned by the existing harness; the caller owns the optional numeric evidence directory.

## Gates still open

The P0 requirement to measure browser-Worker peak allocation and establish a supported real-iPhone/Safari threshold remains open. A sampled maximum is a lower-bound observation of the selected counter within this instrumented run, not the full true peak and not a bound on an unprofiled run. Short-lived Workers can provide insufficient coverage, and no extra pause is introduced to manufacture more samples.

The iPhone 0.20 PNG and 0.21 manual-selection tests, iOS/Safari 16.4 floor, rotation, complete VoiceOver, qualified Exercise fixture and deferred HTTPS/deployed-boundary checks remain separate. The L hosting freeze and requirement for fresh phone/LAN/clipboard permissions are unchanged.

## 2026-09-14 method review — snapshot/tracking names do not establish a true peak

This dated, read-only follow-up does not alter the September 6 samples or claim a new measurement run. The existing sampler still requests current isolate counters about every 50 ms, retains incomplete-coverage flags and has an unobserved tail. Repeating its three inputs would not, by itself, remove that methodological limit.

Three official upstream WebKit files were read on September 14:

- The [Heap protocol](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/Heap.json) lists worker targets and start/stop tracking commands, but describes snapshot data at the two endpoints. A worker target and a command named tracking are not promises of continuous high-water measurement.
- [InspectorHeapAgent](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/agents/InspectorHeapAgent.cpp), functions `startTracking` and `stopTracking`, calls `snapshot` at each endpoint. This path alone cannot prove an intermediate transient peak.
- [InspectorMemoryAgent](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/inspector/agents/InspectorMemoryAgent.cpp), functions `startTracking` and `collectSample`, registers a resource observer and emits category samples through `trackingUpdate`. The inspected path does not establish a dedicated Worker's continuous peak or complete lifetime coverage.

These are mutable upstream `main` sources, not a pinned implementation of the installed Safari or the supported Safari 16.4 floor. Any future adoption must verify the exact target implementation. The bounded conclusion is that neither inspected tracking name is sufficient evidence to close D01; this is not proof that every possible profiling method is unavailable.

### Smallest next developer-owned method check

Before another product-capacity run, qualify a candidate instrument using an isolated, fully fictional short-lived Worker. Use known counts of JavaScript objects and known ArrayBuffer byte lengths, without pretending their full engine/native overhead is known. Check target attribution, startup-to-termination coverage including the tail, counter definitions and measurement disturbance. Compare like counters at the same instant; do not add independent maxima or infer full browser memory from JavaScript heap alone.

If the instrument yields only samples or endpoint snapshots, retain that descriptive label and reject its use as a true-peak proof. A calibration pass would establish only the tested measurement capability, not a universal peak guarantee or an iPhone capacity threshold. No arbitrary MiB acceptance limit is introduced.

This review created no calibration harness, ran no new browser/Worker measurement, installed nothing, enabled no debugging permission and did not access the phone. Phone Web Inspector, device trust/pairing, network changes and actual supported-device measurements remain separately authorized steps. D01 remains OPEN with its original requirements; method qualification remains a developer responsibility rather than a task assigned wholly to the user.

## Subsequent September 14 executable calibration

The next step above was subsequently implemented using standalone fictional Chrome Workers, separately from the application. Held controls responded, while all three sampled short-lived allocation tasks had only a baseline and zero runtime samples. New numeric and browser ownership/cancellation guards were reviewed and tested, including three actual interruption stages. See [the dated calibration evidence](WORKER_HEAP_CALIBRATION_EVIDENCE_2026-09-14.md) and its endpoint-bound JSON. This is an instrument-coverage counterexample, not a new production memory measurement or D01 closure. The September 6 samples and earlier read-only review above remain unchanged as historical evidence.

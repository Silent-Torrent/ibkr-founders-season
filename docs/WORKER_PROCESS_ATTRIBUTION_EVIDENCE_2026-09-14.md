# D01 process attribution — 2026-09-14

Starting HEAD: `9573544`. One bounded, desktop-only identity experiment was run; it succeeded on the first attempt. No allocation-size sweep, native process-memory query, product import or phone action followed. Product 0.24, 9 OPEN / 3 CLOSED gates and deployment freeze L are unchanged.

## Outcome and stop decision

The owned page and two simultaneously present, independently identified module Workers mapped to **one renderer PID**, despite having three different JavaScript isolate IDs and thread IDs. This is direct evidence against treating that renderer's process-wide lifetime footprint peak as one Worker's exclusive peak. Knowing the correct PID fixes an identity gap; it does not fix the metric's attribution gap.

Stop this substitution route here. Repeating larger native/browser pulses or more PID snapshots cannot make the shared process counter Worker-exclusive. The earlier [native self-process high-water observation](MEMORY_INSTRUMENT_CANDIDATES_2026-09-14.md) remains valid in its own scope; it is not promoted into D01 acceptance. Further renderer-pressure diagnostics are optional supplemental work, not the missing release evidence.

The next proposed user-assisted step is the already pending D07 VoiceOver check, requiring separate permission and actual listening. For D01, no currently qualified complete Worker-allocation/real-iPhone-threshold instrument has been established. A different instrument or device-debugging plan must identify which missing property it supplies and receive any necessary installation/device permission first. Installing Instruments, changing browser builds, raising the support floor, or rewriting the acceptance criterion is not silently authorized. This is a limitation of the checked routes, not a claim that every possible future method is impossible.

## Live identity evidence

Raw record: [WORKER_PROCESS_ATTRIBUTION_2026-09-14.json](WORKER_PROCESS_ATTRIBUTION_2026-09-14.json), 27,216 bytes, SHA-256 `29e8416048060af8788f590674311fd18a83025ff57a14dadb6e92509f971945`.

Chrome 153.0.8010.36, V8 15.3.76.10, protocol 1.3, Node 22.23.2; browser revision `507c6ee3e2f3b2ca0e660547e5b9ea4820c67f4c`. The live protocol hash is `0ae391988e275ef33802c71ed3b964152cb3a6a1257c4d35f808527a65fda5ff`; selected Target, SystemInfo and Tracing schemas are retained. The owned browser PID was 13894 and the mapped renderer was 13909. These are historical run identities, never targets for later cleanup or attachment.

| Context | Exact target ID | Isolate ID | Renderer PID | Trace/native thread ID in this run |
| --- | --- | --- | ---: | ---: |
| Page | `A79A0AF689F41E2740AC969EDE61CA38` | `3a50e9df41c81615` | 13909 | 5922873 |
| Worker mapping-one | `5AE4471AC397B66CD866288FE72AACAB` | `365876cb7bbcefe5` | 13909 | 5922990 |
| Worker mapping-two | `8AE71D67916EDD0801467426941660A7` | `252c24241163ffec` | 13909 | 5922991 |

Each Worker has its own distinct CDP session in the raw record. The page's actual frame ID was read before and after the experiment. Its frame-table entry and its unique `performance.mark` agreed on PID 13909. Each `TracingSessionIdForWorker` event matched the exact Worker target ID, fictional URL and parent frame; its PID/native thread ID also matched a separate unique mark issued through that Worker's owned session. No URL-only, thread-name, CPU-difference or single-renderer inference was used. In fact, SystemInfo listed **six renderer PIDs**, so merely picking the only renderer would not have worked.

Both Workers were present together before finish commands. Each received only `finish`, reported zero deliberately retained control objects/buffer bytes at ready and finish, self-closed, and its exact target was subsequently absent. PID 13909 remained listed as a renderer in the later SystemInfo snapshot while the page frame/URL remained unchanged. A later PID-list entry is not proof against PID reuse, not proof of resource reclamation, and not a final Worker-memory reading; no OS process-start identity was obtained.

## Method, provenance and limits

The new explicit `--attribute-processes` branch in [calibrate-worker-heap.mjs](../scripts/calibrate-worker-heap.mjs) reuses the existing fresh-profile/exact-browser-WebSocket/owned-page protections and exits before the ordinary held/short allocation experiments. It only serves its own fictional page/script/two module Workers on loopback. Browser-startup flags, app privacy policy and production Worker behavior are unchanged.

This is a **debugger-handshake identity control**, not an untouched production lifetime: Workers wait for debugger attachment, receive the marker binding and isolate query, then are released. The experiment does not measure startup allocations, shutdown tails, memory, GC behavior or tracing overhead. Tracing categories can generate internal counters; none are interpreted as memory results. Method counts show zero heap samplers, no `Runtime.getHeapUsage`, no `HeapProfiler.*` and no `Tracing.requestMemoryDump` commands. No intentional allocation pulse or native footprint helper was invoked.

Tracing ran through the owned page session to obtain the actual frame table. The configured buffer was 4,096 KiB, stack sampling/system tracing were disabled, and only timeline metadata and user-timing categories were selected. Collection also had an 8 MiB serialized-batch / 50,000-event host limit and the runner's existing time limits. The runner recorded four batches, 815 events, 132,274 serialized-batch bytes; six relevant frame/Worker/mark events were retained. Remaining events were counted/hashed then discarded. Those totals and the batch-stream digest cannot be independently recomputed from the six retained events or reconstruct discarded events. The retained identity mappings can be independently recomputed. `tracingComplete` arrived with `dataLossOccurred: false`: this means no known loss reported, not complete pre-start/filtered/lifetime coverage.

Runner SHA-256: `7b523876218f4611b3eb7aba51295378e0b254931dcaa06be8d526bff45155b6`; [analysis module](../scripts/worker-process-attribution-analysis.mjs): `e21d38c0e7769eef40ab5cbae9ca9c5d0298b71fda3b2fa2a9b4561fb961bb61`. Both were hashed before execution and checked unchanged afterwards; final local rechecks match. Worker/page source hashes are also retained. Existing raw calibration reports remain unchanged and correspond to their original runner hashes, not this later extended runner.

The analyzer checks supplied evidence consistency; it does not authenticate arbitrary uploaded traces. Ownership, actual closure and trace completion are enforced by the runner. Inconsistent or missing mappings produce `status: inconclusive`, `analysis: null`, an explicit error and exit 1 after safe cleanup, retaining the bounded observation if output was requested; this is not a pass. Other execution/ownership/cancellation failures still abort without successful evidence. This first run returned `status: attributed`, no analysis error and exit 0; no repair/retry was needed.

## Why the identity bridge is meaningful

The inspected primary sources use the same Chromium version tag as the live browser version, not a guarantee of identical binary contents:

- [Worker agent host](https://github.com/chromium/chromium/blob/153.0.8010.36/content/browser/devtools/worker_or_worklet_devtools_agent_host.cc) derives its ID from the Worker devtools token. [IdentifiersFactory](https://github.com/chromium/chromium/blob/153.0.8010.36/third_party/blink/renderer/core/inspector/identifiers_factory.cc) uses the same token string representation. Session and isolate IDs must still be recorded through their own CDP calls; they are not OS IDs.
- [WorkerInspectorController](https://github.com/chromium/chromium/blob/153.0.8010.36/third_party/blink/renderer/core/inspector/worker_inspector_controller.cc) emits metadata at construction/trace start. [Trace-field serialization](https://github.com/chromium/chromium/blob/153.0.8010.36/third_party/blink/renderer/core/inspector/inspector_trace_events.cc) includes the Worker token, direct parent token, URL and native thread ID. This experiment uses direct page children; nested Worker parent tokens need different handling. Disposal removes the observer without a guaranteed final memory event.
- [TracingHandler](https://github.com/chromium/chromium/blob/153.0.8010.36/content/browser/devtools/protocol/tracing_handler.cc) obtains frame/process data from the inspected WebContents. Browser-level tracing alone cannot be assumed to supply that frame table. Actual matching events—not the source alone—support the table above.
- [SystemInfoHandler](https://github.com/chromium/chromium/blob/153.0.8010.36/content/browser/devtools/protocol/system_info_handler.cc) derives the process ID from the OS process object; its inventory is queried on the browser session. [Protocol fields](https://github.com/chromium/chromium/blob/153.0.8010.36/third_party/blink/public/devtools_protocol/domains/SystemInfo.pdl) provide type/PID/CPU time, not target IDs or process-start identity. Chromium's internal RenderProcessHost ID must not be substituted for the OS PID.

The native Worker thread ID and trace format have different potential integer widths. This mode retains the original metadata and accepts only positive safe native IDs no greater than 2,147,483,647 before comparing with the trace mark; unsupported larger IDs are rejected, not masked/truncated. All observed IDs were within that range. This guard does not claim universal thread-ID portability.

## Verification and cleanup

- [New pure analysis tests](../scripts/test-worker-process-attribution-analysis.mjs): 18 groups passed, including shared/different processes, missing/foreign/conflicting identities, wrong mark category/phase, lost trace, renderer-list errors and out-of-range native thread IDs. These use fabricated evidence, not a browser.
- Existing calibration-analysis 9 groups and sampler 14 groups passed; Node syntax, product-policy/privacy and browser-compatibility contracts passed. The full app suite/build and the ordinary allocation calibration were not rerun: this stage did not change product source, manifests, dependencies or the three 0.24 asset hashes.
- Independent source review preceded execution. The complete raw result was reopened and its analysis recomputed, source hashes checked, exact marker/frame relationships and target-absence evidence reviewed. Separate secondary review audited the live numeric/identity record.
- Relative output, existing-file overwrite and unknown-argument attempts were rejected before browser startup; the evidence remained unchanged and no new scoped profile directory appeared.
- Normal run cleanup completed. A separate OS check found all 11 PIDs from this owned browser's recorded inventory absent; no `ibkr-worker-heap-calibration-` or `ibkr-native-footprint-pulse-` temporary directories remained. Both experimental ports 64467/64469 and phone ports 4173/4174 were unbound. These post-run checks support this cleanup, not future permission to signal these numeric PIDs.
- Only the newly generated disposable isolated-browser profile was removed; code and the numeric result remain. No user browser session, financial statement, phone test file, photo, clipboard, network permission, VoiceOver setting or deployment was changed. New-mode arbitrary-signal interruption stages were not separately exercised; previous interruption evidence keeps its original scope.

## Reproduction and handoff

Use the existing project Node 22 runtime:

```sh
node scripts/test-worker-process-attribution-analysis.mjs
node scripts/calibrate-worker-heap.mjs --attribute-processes
```

The second command is an explicit isolated-browser experiment. Optional `--output /absolute/new.json` refuses overwrites. Do not repeat it just to collect more identical shared-PID results; the planned identity question is resolved. The original allocation mode remains separate and diagnostic-only.

D01 remains OPEN. D07 still needs the user's informed agreement and listening; actual 16.4, full D08, old Photos identification, qualified Exercise data and deployment decisions remain independent. Record the same 9 remaining gates, not a percentage or an inferred launch date.

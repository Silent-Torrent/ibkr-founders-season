# D01 instrument calibration — 2026-09-14

Starting repository HEAD: `dd8a7bf`. Scope: an independent, fully fictional desktop Chrome Worker experiment, not the production parser or an iPhone run. Product checkpoint remains 0.24. D01 remains OPEN; baseline gates remain 9 OPEN / 3 CLOSED and deployment decision L remains frozen.

## Result and decision

The current 50 ms isolate sampler observes the deliberately held controls, but all three sampled short-lived controls completed their known allocations with **zero runtime heap samples**. Each had only its pre-script baseline. This is an actual counterexample to treating this instrument as a complete lifetime/true-peak measurement, not merely a theoretical warning.

Retain `Runtime.getHeapUsage` as a limited numeric diagnostic. Do not use it to close D01, infer an iPhone budget, sum different counters' maxima, or claim reclamation after a Worker disappears. The next developer-owned requirement is to qualify a different instrument capable of the original peak-allocation scope, with explicit definitions/coverage and the same short-lived negative control. Repeating identical capacity inputs or reducing the sampling interval alone cannot establish that capability. Supported real-iPhone/Safari measurements and a justified threshold remain separately required; no new threshold or support-floor change is approved.

## Evidence and provenance

- Final, endpoint-bound numeric record: [WORKER_HEAP_CALIBRATION_2026-09-14_ENDPOINT_BOUND.json](WORKER_HEAP_CALIBRATION_2026-09-14_ENDPOINT_BOUND.json), 73,468 bytes, SHA-256 `2189be2b814080b3c8536167caf01f43e13a84218dcf6c055d91be7979d21a58`.
- Live environment: Node 22.23.2; Chrome 153.0.8010.36; V8 15.3.76.10; protocol 1.3; browser revision `507c6ee3e2f3b2ca0e660547e5b9ea4820c67f4c`. These are this run's metadata, not the September 6 Chrome version or Safari 16.4 evidence.
- The final record includes the running browser's `/json/protocol` SHA-256 and its actual heap/isolate command schemas, plus runner, analyzer, sampler and fictional Worker/page-source hashes. No remote upstream implementation was assumed to be this binary.
- [First-run numeric record](WORKER_HEAP_CALIBRATION_2026-09-14.json), 77,219 bytes, SHA-256 `3c2c46895c3f09c72fa1e639905530b547fb924cbc1190e36c0197152da23187`, is retained unchanged as historical pre-hardening evidence. Its runner hash differs. It predates the endpoint-ownership and interruption-order fixes below and is **not** the final accepted runner result. There is no observed evidence that it controlled another browser; the review found a possible race, not a confirmed incident.

The local protocol defines isolate-wide counters rather than a single Runtime's exclusive memory. The current upstream [V8 implementation](https://raw.githubusercontent.com/v8/v8/main/src/inspector/v8-runtime-agent-impl.cc) was separately inspected: `getHeapUsage` uses heap statistics, including an external-memory counter for backing storage. That upstream source is contextual, mutable, and not a pinned proof of this installed binary; final counter labels come from the live protocol record. Backing storage is not synonymous with JavaScript used heap or total browser RAM.

## Controlled workload and interpretation

The runner serves only its own in-memory page/script/Worker resources on loopback, using a fresh headless Chrome profile. It does not serve or import the application, CSV, PDF, production fixtures or any real statement. There are no new dependencies, device actions, clipboard operations, stored financial data, forced collections or heap snapshots.

Two simultaneous held Workers have distinct target, session and isolate identities. The allocator first idles, then strongly retains 250,000 distinct two-number-field objects, then retains those objects plus an 8,388,608-byte Uint8Array filled with a fixed byte. The second Worker remains idle. Numeric phase markers validate counts, endpoint checksums and continued retention through the final marker. These are known object counts and ArrayBuffer lengths—not known full engine/object overhead or total committed physical memory.

The host waits a fixed 400 ms for idle and 600 ms for each holding phase, rather than extending a Worker until a desired number of samples appears. Actual acknowledgement/command windows are recorded. Only requests **and** responses wholly inside each host-clock phase and classified after release enter its statistics. The initial pre-script baseline is not a post-startup idle measurement; Worker elapsed times are never mixed with host timestamps.

Final held results, in bytes:

| Phase | Allocator / idle-control samples | Allocator used JS heap | Allocator backing storage | Idle-control backing storage |
| --- | ---: | ---: | ---: | ---: |
| Post-startup idle | 8 / 8 | 352,084 | 2,219 | 2,225 |
| Retained objects | 12 / 12 | 6,330,036 | 2,219 | 2,225 |
| Objects plus retained buffer | 12 / 12 | 6,330,676 | 8,390,827 | 2,225 |

Each displayed counter was constant across its selected samples in this run. The used-heap range separation for the object control was 5,977,952 bytes. The backing-storage separation after adding the buffer was 8,388,608 bytes while the idle control's corresponding separation was zero. This demonstrates sensitivity and distinguishable isolate observations for these held controls. Even the exact buffer-sized difference in this run is not a universal accounting guarantee or a proof of exact per-object bytes.

Three fresh short-lived sampled Workers and three matching heap-sampling-off Workers then perform the same object/buffer allocations and self-close in one message task, without a holding delay. All eight Workers in the run have distinct target/session/isolate IDs, validated final count/checksum markers and observed target absence.

| Pair | Execution order | Off allocation duration (ms) | On allocation duration (ms) | On runtime samples |
| --- | --- | ---: | ---: | ---: |
| 1 | Off then on | 10.5 | 8.1 | 0 |
| 2 | On then off | 6.6 | 6.5 | 0 |
| 3 | Off then on | 6.5 | 7.1 | 0 |

Durations are rounded from each Worker's own operation clock and exclude its marker delivery, closing and startup. Both modes include debugger attachment, isolate identification and a numeric binding; off omits heap sampling only. These six descriptive durations do not establish negligible/negative profiling overhead or a causal performance effect. The short command is sent after the shared startup/readiness handshake; it is not the production application's untouched cold-start lifetime. In another run, a sample could occur during the ready-to-command interval or operation, so the test never requires zero samples. Here each sampled case actually had just one baseline; last observation to host stop was approximately 41.4, 41.0 and 43.5 ms. Those host gaps are not allocation durations or proof of reclamation.

## Safety and acceptance fixes made during development

Independent review caught and rechecked these issues before accepting the final runner:

1. The analysis could accept a missing/nonfinite release marker and include pre-release/baseline readings in holding windows. It now validates release markers, requires both Workers to have been released before the window, and selects only wholly contained after-release readings. Three new negative-control groups cover these errors.
2. A reserve-then-release debug port could race another process. The final runner lets Chrome choose its port, reads only the owned fresh profile's regular, non-symlink `DevToolsActivePort` using no-follow/inode checks, matches the exact browser WebSocket against live metadata twice, and creates/attaches its own page on that browser socket. Every page command uses that session and every Worker attach must descend from it.
3. A signal handler could start and cache cleanup while startup continued allocating resources. Signals now only mark cancellation; the main execution path owns cleanup, startup checks cancellation, and cancellation during cleanup prevents success output.

The final runner's success means the experiment completed and every holding window had samples. Sensitivity is concluded from the actual positive separations above, not merely its exit code. No success path sets true-peak, full-coverage, final-reclamation, device-threshold or causal-overhead flags to true.

## Verification and cleanup

- New independent numeric-analysis suite: 9 groups passed; existing sampler suite: 14 groups passed.
- Actual interruption suite passed at three observed live stages: temporary profile created, owned browser endpoint created, and Worker target running. Each SIGTERM produced exit 1, no successful stdout/JSON, no calibration profile and no owned Chrome process. This does not test every possible interruption instant.
- Final endpoint-bound calibration exited 0. Root independently reopened its complete JSON, rechecked three current implementation hashes, all eight distinct identities, count/checksum markers, target absence, recomputed sample classifications/maxima and holding-phase analysis. Independent secondary review separately audited the numeric record.
- Existing product-policy/privacy and browser-compatibility contract suites passed. The full application suite/build was **not** rerun: no product source, manifest, dependency, production sampler or generated app asset changed. The three 0.24 asset SHA-256 values match the previous phone evidence.
- Final numeric report records owned browser exit, loopback server closure and temporary profile removal. A separate process/path check found no calibration Chrome or scoped temporary directories; final calibration ports and phone test ports 4173/4174 had no listeners. Numeric records are intentionally retained in this repository. Only newly generated disposable browser/interruption-test directories were removed; no user files, phone photos or phone test copies were touched.
- Relative output paths and existing-file overwrite attempts were rejected before browser startup. The optional output is exclusive, no-follow and rechecks real parent directories; no old result is overwritten.

## Reproduction

Use the existing Node 22 runtime. These diagnostics are explicit and deliberately excluded from normal app checks and production bundles:

```sh
node scripts/test-worker-heap-calibration-analysis.mjs
node scripts/test-worker-heap-sampling.mjs
node scripts/test-worker-heap-calibration-lifecycle.mjs
node scripts/calibrate-worker-heap.mjs
```

The last command emits numeric JSON to stdout. An optional `--output` accepts a new absolute `.json` path with existing non-symlink parents; it refuses overwrites. The lifecycle command starts and interrupts three isolated fictional browser runs. It is not a phone test. Consent to VoiceOver/listening, actual 16.4 support, full rotation scope, old Photos identification, qualified Exercise evidence and any reopened deployment route remain separate.

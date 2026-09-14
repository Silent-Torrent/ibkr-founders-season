# D01 alternative instruments and native footprint control — 2026-09-14

Starting HEAD: `7a040fc`. This is developer-only method qualification, not another phone test or a product change. The product remains 0.24; D01 is OPEN, baseline gates remain 9 OPEN / 3 CLOSED, and L remains frozen.

## Result and decision

Subsequent [exact browser-attribution experiment](WORKER_PROCESS_ATTRIBUTION_EVIDENCE_2026-09-14.md) resolved the next investigation proposed below: the owned page and two distinct Workers shared a renderer PID. The process ledger is therefore not Worker-exclusive; stop that substitution route without another allocation sweep. The native observations below retain their original self-process scope, and D01 remains OPEN.

A kernel-maintained **self-process physical-footprint lifetime high-water counter** retained the short native pulses tested here, even though the current counter had returned to baseline before the second query. This addresses the endpoint-miss problem for this specific process ledger. It does **not** establish browser-Worker attribution, JavaScript allocation peaks, complete browser memory or an iPhone safety threshold. No production parser was measured.

The earlier Chrome sampler's short-task counterexample remains valid. Source inspection did not qualify the three additional Chrome interfaces below as replacements for D01's original complete Worker-peak requirement. Do not rerun rejected methods merely under a new name or lower D01 to fit the available instrument.

## Candidate screening

The Chrome inspection used V8 tag `15.3.76.10` and Chromium tag `153.0.8010.36`, matching the version strings in the [previous live calibration](WORKER_HEAP_CALIBRATION_EVIDENCE_2026-09-14.md). Matching upstream tags are not proof of bit-for-bit shipped implementation identity; the findings below are source-based interpretation, not new live API trials.

| Candidate | Observed definition or implementation | Decision for D01 |
| --- | --- | --- |
| Existing `Runtime.getHeapUsage` sampler | Three known short-lived Workers had zero runtime samples. | Numeric diagnostic only; complete-peak capability disproven for that run. |
| `HeapProfiler.startTrackingHeapObjects` | [Inspector agent](https://github.com/v8/v8/blob/15.3.76.10/src/inspector/v8-heap-profiler-agent-impl.cc) periodically updates stats; [heap map refresh](https://github.com/v8/v8/blob/15.3.76.10/src/profiler/heap-snapshot-generator.cc) collects garbage and iterates live objects. Stopping also takes a snapshot. | Not an uninterrupted allocation/free history; changes GC behavior. Not qualified. |
| `HeapProfiler.startSampling` | [Sampling profiler](https://github.com/v8/v8/blob/15.3.76.10/src/profiler/sampling-heap-profiler.cc) uses probabilistic samples; the [inspector agent](https://github.com/v8/v8/blob/15.3.76.10/src/inspector/v8-heap-profiler-agent-impl.cc) enables forced GC when obtaining the profile. | Samples/estimates and retained sample records are not a complete free-time history or shutdown-tail guarantee. Not qualified. |
| Tracing / memory-infra | [V8 dump provider](https://github.com/chromium/chromium/blob/153.0.8010.36/gin/v8_isolate_memory_dump_provider.cc) reads heap statistics at dump time and unregisters on isolate destruction. Its named malloc peak is not total Worker memory. | Discrete dumps and isolate labels do not prove full coverage or a final pre-termination dump. Not qualified. |
| Safari Web Inspector Memory / JavaScript Allocations | [Timeline documentation](https://webkit.org/web-inspector/timelines-tab/) describes recording and snapshots; [historical WebKit explanation](https://webkit.org/blog/6425/memory-debugging-with-web-inspector/) notes GC associated with snapshots. | Page categories/snapshots are not independently established continuous Worker peaks. No new Safari attachment or setting change. |
| macOS physical-footprint lifetime high-water | Installed `footprint(1)`, SDK headers and [WebKit's process-memory guide](https://docs.webkit.org/Infrastructure/MemoryInspection.html) identify a process-level footprint and lifetime peak. | Self-process short-pulse capability demonstrated below; browser ownership/attribution and metric equivalence remain unqualified. |
| Instruments / `xctrace` | `xcrun --find xctrace` failed in the selected Command Line Tools installation; standard Xcode/Instruments app paths were absent. | Not installed or run in this stage. An installation would require separate scope/permission and would not itself prove Safari-Worker accessibility. |

The availability check is limited to the configured developer tools and named standard app locations, not an exhaustive disk inventory. Existing `clang`, the macOS SDK and `/usr/bin/footprint` were available. Only the `footprint` manual was read; no broad process-name footprint command was executed.

## Native self-process experiment

[Native helper](../scripts/native-footprint-pulse.c) accepts only literal 0, 32 or 64 MiB controls and always queries its own `getpid()` with `proc_pid_rusage(..., RUSAGE_INFO_V4, ...)`. It cannot attach to an arbitrary PID. Each case warms its query/clock, records a baseline, privately maps the fixed region, writes and reads `0x5a` once per actual page, unmaps it, and only then queries again. No memory query occurs while the explicit region is mapped. Formatting/output happens after the final query.

[Standalone runner](../scripts/test-native-footprint-pulse.mjs) creates nine fresh processes in counterbalanced size orders `0/32/64`, `64/0/32`, `32/64/0`. It checks the requested bytes, touched-page count/checksum, distinct PID/start-counter identities, counter invariants and unsupported-size rejection. The control is called **no-pulse**, not no-allocation: process startup, runtime and stack still consume memory. A positive difference alone is insufficient qualification; the runner explicitly reports this limit.

The final run used macOS 27.0 build 26A5425a, arm64, Apple clang 21.0.0 (`clang-2100.3.33.1`), macOS SDK 27.0 and Node 22.23.2. The page size was 16,384 bytes. All three rounds gave the same byte counters for each size:

| Explicit pulse | Current footprint before / after unmap, bytes | Lifetime peak before → after, bytes | Increase over prior lifetime peak, bytes | Map/touch/unmap duration, ms (rounds 1 / 2 / 3) |
| --- | ---: | ---: | ---: | --- |
| 0 MiB, no-pulse control | 1,147,240 / 1,147,240 | 1,180,008 → 1,180,008 | 0 | 0 / 0 / 0 at reported clock resolution |
| 32 MiB | 1,147,240 / 1,147,240 | 1,180,008 → 34,718,080 | 33,538,072 | 4.837 / 3.378 / 3.340 |
| 64 MiB | 1,147,240 / 1,147,240 | 1,180,008 → 68,288,920 | 67,108,912 | 8.769 / 8.188 / 5.978 |

The no-pulse historical peak already exceeds the endpoint maximum by 32,768 bytes. Therefore `peak > current` alone would also be true without this pulse. In contrast, its increase over the prior lifetime peak is zero, while the larger controls preserve distinguishable increases on the scale of their known touched regions. The six nonzero operations lasted 3.340–8.769 ms, shorter than the prior sampler's nominal 50 ms interval; this is not a head-to-head browser comparison or an overhead estimate. These durations cover map/touch/unmap, not the exact time that all pages were simultaneously resident. The no-pulse record's zero duration does not mean zero execution cost.

Physical footprint is a kernel accounting metric, not exact object allocation size, all virtual memory, JS used heap or necessarily all RAM. The peak increments are not exactly the requested byte counts and no such equality is required. Current footprint returning to baseline does not prove that every underlying physical resource was reclaimed. The lifetime maximum can also be dominated by an earlier event; it cannot be reset by subtracting a baseline, and subtraction cannot recover a lower subsequent peak. Do not sum unrelated peak counters.

The installed `footprint(1)` manual (dated November 10, 2025) explains the kernel ledger and process-lifetime maximum. Apple's [v4 member declaration](https://developer.apple.com/documentation/kernel/rusage_info_v4/2870521-ri_lifetime_max_phys_footprint) identifies the field. Contextual [XNU resource code](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_resource.c) and [ledger code](https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/kern/ledger.c) populate/update the lifetime maximum; these mutable upstream sources are not a claim to match the installed kernel binary. The live experiment, OS build and local-header hashes bind the observations here. SDK API availability does not grant access to arbitrary Safari or iPhone processes.

## Provenance, review and verification

- Final input-bound raw record: [NATIVE_FOOTPRINT_PULSE_2026-09-14_INPUT_BOUND.json](NATIVE_FOOTPRINT_PULSE_2026-09-14_INPUT_BOUND.json), 8,221 bytes, SHA-256 `485f335bd108aa0f4c1664f65d7a0db71f75235fa4da5e3c08424f1da02ec295`.
- Source SHA-256: `dff2c2a2e207c6c0206e7439d5befbc96c27e032f70a78d37ff2cb3b4cde8630`; runner: `3d546172b1432f68a5ad0e4c9936c1d6582bd299d0428f7e5d7e0fa930cf247c`. Final local rechecks matched the record, including both recorded SDK-header hashes.
- The final runner captures the source/runner/two selected header inputs before compilation, compiles the exact captured source with explicit `-isysroot`, then rechecks the originals. This closes the initial post-run-only provenance gap. It is not a complete reproducible-toolchain attestation: transitive headers, libraries and compiler contents are not fully captured. Binary and selected header hashes are in the raw record.
- [First exploratory record](NATIVE_FOOTPRINT_PULSE_2026-09-14.json), 7,945 bytes, SHA-256 `7061ba4b0483b81aa7038779ee30d5314c5d333ee95b41e888c9264916c5113b`, remains unchanged. It predates the input-capture guard and explicit success-scope wording; its runner hash/durations must not be presented as the final run.
- The final nine-case native run exited 0. Independent source review found no remaining blocking issue after the provenance/scope fixes. The numeric record was separately reopened and recalculated. Strict C compilation (`-Wall -Wextra -Werror`), Node syntax, product-policy/privacy and browser-compatibility contracts passed. No full app suite/build was rerun; no product source, dependency, manifest, existing sampler or app bundle changed.
- The optional new absolute JSON output rejects relative paths and existing files before compilation; both refusal paths were exercised, the original evidence hash remained unchanged and no scoped temporary directory appeared. Writes are exclusive/no-follow with real-parent checks, not a claim to defeat arbitrary concurrent parent replacement.
- Successful runs removed their precisely owned generated source/binary directories. A separate check found no `ibkr-native-footprint-pulse-` temporary directories or recorded self-pulse processes; phone ports 4173/4174 remained unbound. Only generated disposable test resources were removed; the two numeric reports are retained. No user file, private report, photo, browser profile or phone copy was touched.
- Normal cleanup and bounded subprocess timeouts are implemented; arbitrary signal/compiler-descendant cleanup was not exercised. The previous Chrome runner's three SIGTERM tests do not apply to this separate native runner. The shell-default Node 25 executable failed to load a library during a read-only audit; the existing project-selected Node 22 worked. No runtime was installed or repaired.

## Reproduction and next developer step

Use an existing working Node 22 and the existing Apple Command Line Tools; the runner does not install anything and is excluded from normal app checks and production bundles:

```sh
node scripts/test-native-footprint-pulse.mjs
```

An optional single absolute new `.json` path saves evidence without overwriting. Each invocation runs nine bounded self-process cases (at most one explicit 64 MiB region at a time), emits numeric JSON and cleans its temporary compiler output. Do not substitute an arbitrary PID, attach to the user's browser or raise the fixed sizes.

Next developer-owned step: investigate whether a newly owned, isolated browser process can be unambiguously mapped to its page/Worker and queried without touching user sessions or changing settings. Qualify attribution, lifetime-peak/startup contamination and shutdown coverage before any use. Even if successful, process-footprint evidence is supplemental memory-pressure evidence, not automatically D01's Worker-allocation measurement. Do not silently redefine that gate. If a credible route needs an installation, phone debugging or a requirement change, explain the evidence and obtain the user's decision first.

D07 VoiceOver still needs separate informed permission and actual listening; it was not enabled. Actual 16.4, full D08, old Photos identification, qualified Exercise evidence and deployment gates remain independently open. No gate count or release authorization changed.

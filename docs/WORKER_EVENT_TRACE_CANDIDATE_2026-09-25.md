# D01 candidate method — event tracing, not a passed memory gate (2026-09-25)

## Why the existing readings are insufficient

D01 requires both a reproducible **browser Worker peak-allocation** result and a defensible threshold on a **real supported iPhone/Safari**. The existing 50 ms Chrome sampling missed three short 6.5–8.1 ms tasks entirely; the observed renderer process also contained the page and two distinct Workers. A sampled maximum or shared process high-water mark cannot be relabelled as one Worker's true peak. See the [sampling calibration](WORKER_HEAP_CALIBRATION_EVIDENCE_2026-09-14.md) and [process attribution check](WORKER_PROCESS_ATTRIBUTION_EVIDENCE_2026-09-14.md).

## Bounded candidate, not an established instrument

Apple's [WWDC24 heap-memory session](https://developer.apple.com/videos/play/wwdc2024/10173/) describes Instruments **Allocations** as recording allocation/free events over time, while VM Tracker takes periodic snapshots. Event tracing could capture short native allocation bursts that interval sampling missed. It does **not** by itself establish that Safari WebContent can be attached in the necessary way, that all JavaScriptCore/Worker allocations map to the reported native events, or that allocations and frees can be attributed exclusively to the target Worker. WebKit's [Inspector interface](https://webkit.org/web-inspector/web-inspector-interface/) offers Worker execution contexts; that is a possible identity bridge to test, not proof that native allocation stacks carry a reliable Worker ID.

The current Mac read-only check found only `/Library/Developer/CommandLineTools`; `xcrun -f instruments` could not find the utility, and `/Applications/Xcode.app` was absent. **No Xcode/Instruments installation, Safari debugging, USB pairing, phone permission change or measurement was performed.**

## Next validation sequence and stop rules

1. Only after the required software/device/permission decision, calibrate in an isolated, wholly fictional environment with both a held allocation and a short allocate/free pulse. Require a trace that reconstructs the known live-byte high-water mark, covers the entire task and identifies every event's measurement scope. Record instrumentation overhead separately. If this fails, stop: do not run larger project data and call a snapshot a peak.
2. Independently prove the trace's target identity. The page and multiple Workers sharing one renderer PID is an established counterexample; thread or native call-stack attribution must be tested against intentionally distinct Worker pulses and cross-thread frees. If target isolation cannot be shown, report a process-level bound only, not a Worker-specific value.
3. If both calibrations pass and Safari attachment is actually supported, repeat the production build's **fully fictional** capacity input on an actual iOS/Safari 16.4 target and relevant newer baseline. Combine the measured allocation scope with process footprint/memory-pressure observations and a defensible safety margin; compare instrumented and uninstrumented behavior. An absence of crash alone is not a threshold. D02's separate functional 16.4 acceptance is still required.

Apple's [remote iOS inspection guidance](https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios) describes the device-debugging route; it should not be inferred that the user's current iPhone or this Mac already meet it. Installing full Xcode, enabling Web Inspector and trusting a Mac over USB would need a specific, informed user choice at action time. A self-built WebKit/JSC measurement build would be a different, heavier instrument and still would not replace an actual supported Safari/iPhone threshold.

**Status:** D01 `OPEN`, D02 `OPEN`; fixed ledger **9 OPEN / 3 CLOSED** and L deployment freeze unchanged.

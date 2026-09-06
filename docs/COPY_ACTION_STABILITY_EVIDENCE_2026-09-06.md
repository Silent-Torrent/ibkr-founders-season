# Copy-action stability — checkpoint 0.23

Date: 2026-09-06, Asia/Shanghai.

## Outcome and scope

Copy feedback no longer replaces the action's label or moves the three share controls when a result timer expires. A separate visible status region reserves the tallest localized feedback height. The production-Chrome regression and independent old-bundle counterexample establish the defect and the desktop fix; current-build iPhone and VoiceOver behavior remain separate unverified gates.

The starting commit is `7b61ab54a4b4e5e31d44ddaa03c6790b52299431` (0.22). The phone session used those unchanged baseline assets throughout and is recorded separately in `IPHONE_SHARE_EVIDENCE_2026-09-06.md`. Only after that session, its temporary page and its LAN service were closed did the main workspace rebuild this fix. The two records must not be merged into a claim that 0.23 already passed iPhone testing.

## Reproduced defect, not just an inferred phone event

In the baseline component the Copy button displayed pending, success and failure text instead of a stable action name. Its naturally sized button row wraps at narrow widths. The longer failure text and its natural three-second reset can therefore change which action occupies a screen position without any scrolling.

During phone testing an attempted Manual action at an earlier position produced an extra PNG preview. The precise timing of that individual phone click was not instrumented; its cause remains an inference. A separate controlled desktop reproduction confirms the underlying layout defect independently:

- The audit extracted the old component and stylesheet from `git show HEAD`, checked their hashes, and built an independent temporary copy using a link to the existing dependencies. It did not alter the main workspace or install dependencies.
- Its isolated Chrome page used the exact old production assets listed in the phone evidence. All listeners were loopback-only.
- It adapted the probe to read the **old** button feedback, without requiring the new status DOM or the new source contract. It applied the new regression's 0.5 CSS px geometry tolerance to actual production DOM bounds.
- The expected failing run exited `1` with `NEW_COORDINATE_GATE_REJECTED_OLD_BUNDLE: en pending moved copy-summary right: 120.71875 -> 95.921875`. The right edge moved 24.796875 px.
- Four additional cases saved the Manual centre while failure feedback was visible, waited for the natural three-second reset, and dispatched a real CDP pointer click at that unchanged coordinate. `scrollY` was unchanged in all four cases.

| Locale / viewport width | Saved Manual centre (CSS px) | Target during failure | Target after reset / actual pointer event |
| --- | --- | --- | --- |
| English / 320 | 82.3125, 476.328125 | `manual-summary` | `download-card` |
| English / 430 | 296.46875, 450.328125 | `manual-summary` | `download-card` |
| Simplified Chinese / 320 | 227, 449.890625 | `manual-summary` | `download-card` |
| Traditional Chinese / 320 | 227, 449.734375 | `manual-summary` | `download-card` |

The old-bundle probe recorded the pointer target in capture phase and suppressed the product handler, so it did not actually generate PNGs or write the system clipboard. This proves target displacement, not the exact timing of the earlier phone event.

## Small implementation change

- `src/components/ShareCardPreview.tsx`: Copy keeps its localized action name. One persistent, visible, polite, atomic `role="status"` holds copying/copied/failed feedback; no second screen-reader-only feedback copy remains.
- `src/styles.css`: the status and three hidden localized size placeholders share a grid cell. `visibility:hidden` plus `aria-hidden` excludes the placeholders from visible content and accessibility announcements while preserving the greatest actual wrapping height. Idle feedback retains that space. Failure feedback uses the existing warning color.
- The original copy request, duplicate-click, abort, stale-context, timer, manual selection and PNG functions are unchanged. Parser/accounting, Worker termination, capacities, share-summary content, image drawing, persistence, dependencies and deployment decisions are unchanged.

## Regression coverage

`scripts/test-manual-copy.mjs` now checks all three languages at 320×900:

1. Stable labels, button edges, viewport and reserved feedback bounds during pending, failure and natural failure reset, with no horizontal overflow.
2. The old Manual centre still hits Manual after reset. A real CDP click at that saved point selects the entire read-only summary, creates no PNG preview and makes no PNG-share request. It does not use an element locator that would silently follow a moved button.
3. Success feedback naturally resets without changing the action layout.
4. Exactly one live status region and inaccessible hidden placeholders, plus all existing exact-text, repeated-selection, scroll-to-final-line, unavailable API, denial, close/locale/unmount/clear and delayed-PNG-focus checks.

The existing share-interaction and report-clear tests now assert the independent status **and** the stable action label; they do not turn stale-feedback checks into empty passes just because the button always says Copy.

The isolated counterexample identified one test-harness issue: a previous real pointer click can leave the mouse over the next language's PNG button, whose existing hover transform animates by 1 px. The final regression moves the pointer to `(0,0)` and allows the existing 150 ms hover transition to finish (200 ms) before each independent geometry baseline. This is test isolation, not a change to product timing or a substitute for the natural feedback resets.

## Executed verification

- Node 22.23.2 full `npm run check && npm run build`: passed. This includes type checking; parser/streaming/materialization; Worker/bounded sampling; locale/accessibility/browser compatibility; policy/privacy; macOS launchers; fictional stress-pack checks; and the full production-Chrome browser suite.
- The manual-copy module made 15 controlled clipboard calls and zero manual-selection clipboard writes. All three stable-action layouts passed. Existing share races, exactly two expected real PNG downloads and import recovery remained passing; the ordinary browser run used 15 Worker targets, not an opt-in memory sampler.
- In that full run, the exact-capacity fictional file completed in 1,422.1 ms, with maximum long task 70 ms, animation-frame gap 116.7 ms and timer gap 117.1 ms. These are that desktop run's observations, not phone memory or performance limits.
- A read-only independent review found no blocking defect in the source or regression changes. It explicitly did not establish iPhone or VoiceOver behavior.
- After the small hover-isolation test refinement, final `npm run test:browser && npm run build` passed again. The manual module retained 15 controlled calls, zero manual writes and all three stable layouts; the browser retained 15 Worker targets and exactly two expected real PNG downloads. The final run's capacity duration was 803.9 ms, maximum long task 50 ms, animation-frame gap 16.8 ms and timer gap 81.4 ms. Its two controlled import-recovery timeouts were 12,073.9 and 12,071.4 ms. These are separate run observations, not a claimed speed improvement.

## Direct visual review

The main agent reviewed six ordinary, unedited 320×900 in-app-browser screenshots of the new production bundle: failure feedback and its natural cleared state in English, Simplified Chinese and Traditional Chinese. The action row and manual-panel position remained stable in each pair. The English row intentionally occupies two lines at this width; the Chinese rows occupy one. The separate feedback is readable and does not cover the controls. Long English textarea content remains internally scrollable, covered separately by the regression.

For this visual-only check, the test page's Clipboard API was temporarily made unavailable before clicking Copy, avoiding any real desktop clipboard read/write. The change was removed by reloading; the two test-only preference keys at that temporary loopback origin were removed, the welcome page was observed again, the viewport override was reset and the temporary tab was closed. Six screenshots were viewed inline, not saved as repository files. This is Chromium visual evidence, not iPhone emulation or VoiceOver speech evidence.

## New production asset identities

| Asset | SHA-256 |
| --- | --- |
| `index-DkClqys4.js` | `da868302e8f099bfd67b296b9bf9084d28940372797a8f0b69a7c347a654543b` |
| `index-DG_6n9rd.css` | `34f118aaefa101e52a6d066a572a6eae9023b527967e4610fc0de15669486874` |
| `ibkrParser.worker-Dy6yjzTG.js` | `088f401e02c1b53aa3fe210ca7ef9e5f5343b8c929d078a5270d317896439b5a` |

The Worker hash is byte-identical to the phone baseline. Changed UI assets must not inherit that baseline's phone results.

## Cleanup and open gates

- The independent old-bundle test removed its own temporary source/build directory and dependency link, closed its isolated Chrome and confirmed its preview/debug listeners were gone. Main dependencies and files were not removed.
- The main visual preview was restricted to `127.0.0.1`. Its verified process was stopped, its session exited `143`, and port 4183 had no listener; phone port 4173 also remained closed. These are planned shutdowns, not test crashes.
- The preceding phone session's two new PNGs are recoverably deleted, not permanently erased. Its local paste-helper files and test tabs are gone. Old unidentified Photos cards remain unresolved.
- A short **new-bundle** iPhone check is still required for the changed copy feedback and stable touch targets. The earlier three-language system-keyboard paste matches do not prove that check or native touch Copy menus.
- Real PNG-close focus, full VoiceOver speech/order, actual rotation, iOS/Safari 16.4, Worker peak/device memory threshold and a qualified Exercise CSV shape remain separate open gates. HTTPS native sharing/exact naming and deployed network/storage/header checks remain deferred under L.

No real statement, account identifier, local-network address, credential, raw clipboard, browser profile or test screenshot is included in this evidence or the repository change.

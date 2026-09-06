# Checkpoint 0.21 — manual summary selection fallback

Date: 2026-09-06

Status: `FINAL_WITH_OPEN_DEVICE_GATES`. Source-contract red/green, final production-browser/full-suite/build acceptance and three-locale viewport inspection passed after a reproduced first-selection visibility defect was corrected. This file must not be read as an iPhone or operating-system clipboard pass.

Baseline: checkpoint 0.20, commit `c400b4f538c2419448b948478f6d0b0ffbb1d5a7`. All test inputs are fictional. No private statement is read or transformed for this checkpoint.

## Problem and implementation

Previously, an unavailable or denied Clipboard API only produced a retry message. The sharing section now has an always-available **Select text manually** action. It opens a labelled, read-only textarea containing exactly the existing `buildSeasonSummary` output. An explicit selection action focuses and selects the whole field; it does not call the Clipboard API or claim that selecting text means copying it. A second in-panel selection action allows reselecting the whole summary.

An automatic copy failure exposes the same panel without moving focus or selecting text. The three-second failure-feedback timer resets the copy button only, not the manual panel. Closing the panel restores focus to the stable manual-selection entry, aborts pending UI callbacks and clears the feedback timer. It cannot recall a system clipboard write already submitted to the browser.

The panel is tied to an exact report/locale context identity. Report changes, language changes including A→B→A, and leaving Ledger invalidate old work and remove the field. No delayed result should recreate obsolete summary text or steal focus. A late PNG preview also avoids moving focus when the user is interacting within the manual panel.

All three locales explain that users still need to invoke their browser/device Copy command after selection. Closing the panel or clearing the report does not clear a previously copied system clipboard. The app does not read the clipboard, invoke a legacy copy command, or promise to open the iOS editing menu.

## Privacy and API boundaries

The textarea reuses the existing approved share summary: season P&L, season return, Options P&L, end date, source/check labels and the privacy footer. It does not add holdings, account identifiers, raw rows, filenames or exact net liquidation value. These aggregates are still financial information; this is a user-controlled sharing surface, not a claim that the summary contains no sensitive information.

No server, upload, external endpoint, persistent financial storage, dependency, analytics or permission change is introduced. Existing parser/accounting rules, capacity limits, image rendering and the L hosting freeze are unchanged.

The HTML selection methods set the textarea selection; they do not perform a clipboard write or guarantee a native editing menu. A read-only textarea remains a selection-capable form control rather than a disabled field. [HTML Standard: text selection APIs](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#textFieldSelection), [HTML Standard: textarea](https://html.spec.whatwg.org/multipage/form-elements.html#the-textarea-element)

## Verification record

- The new fast source contract first failed with `Manual copy source contract missing: data-action="manual-summary"` against the pre-change source. It passed after implementation. This proves detection of the absent UI contract, not actual system copy success.
- TypeScript, three-locale and product/privacy contract checks passed after implementation and after the focus correction below.
- Independent read-only lifecycle/focus and privacy/test-isolation reviews found no blocking issue. They prompted additional tests for opening without the test helper pre-focusing the trigger, and for failure feedback naturally expiring without closing the panel. Both new and integrated copy paths use controlled clipboard promises; no real OS clipboard write is used for these automated checks.

### Reproduced first-selection visibility defect

The initial production-browser run selected the textarea successfully but did not bring the whole field above the bottom navigation. The failure persisted after two animation frames with no screenshot-specific scroll. At a 320×900 viewport the measured scroll position was 2,569 px, the sticky header ended at 62 px and bottom navigation began at 825 px:

| Element | Top | Bottom |
| --- | --- | --- |
| Manual panel | 539.33 px | 1,140.06 px |
| Textarea | 695.5 px | 955.5 px |
| Close | 556.33 px | 600.33 px |
| Select all | 969.5 px | 1,013.5 px |

The textarea midpoint hit test failed as well. The main agent inspected the unmodified viewport image, which visibly showed the lower field under navigation and the selection control below the viewport. This was a real first-selection usability failure, not a delayed observation or a screenshot-scroll artifact.

The correction explicitly centres the textarea with `scrollIntoView` on a manual-selection action, then focuses it with `preventScroll` and selects its text. No timer or new asynchronous focus callback is added; automatic clipboard failure never invokes this selection path. Existing scroll margins are retained. Final verification must measure the resulting natural viewport before any QA repositioning and separately check control reachability.

### Production-browser pass after correction

The complete production-Chrome browser regression passed after rebuilding the corrected source. Clipboard availability, permissions and native-share outcomes were controlled; Canvas and Blob generation and the existing two PNG downloads remained real. This is not Safari emulation or an OS clipboard pass.

- Three locales passed explicit first opening without the test helper pre-focusing the opener, full read-only selection, repeat opening and in-panel reselecting, accessible labels/descriptions, horizontal containment and an unobscured 320×900 textarea. Close and select controls also passed bounds/hit checks after keyboard focus.
- The exact manual text matched the argument sent to the controlled automatic clipboard in each locale. Holdings, account and exact-NAV canaries were absent. Manual selection caused zero clipboard or legacy-copy calls and did not report `Copied`.
- Clipboard denial and a missing API exposed the panel honestly. A late denial preserved deliberately moved focus. The panel and full selection survived the three-second failure-feedback reset.
- Nine controlled clipboard calls covered close followed by late success/failure, language A→B→A, leaving/reopening Ledger, and old-feedback/new-pending interactions. The existing integrated report-clear regression also opened the panel with both share/copy pending and confirmed no late resurrection.
- A real PNG fallback arriving after manual text selection preserved the field focus and complete selection. The existing 10-copy/9-share lifecycle suite, two expected PNG download GUIDs and import/capacity/recovery checks also passed.
- The main agent directly inspected three ordinary 320×900 viewport screenshots after the correction, with navigation visible. Each displayed the title, close control, selected field, select-all control and retention hint. English text extends within the textarea and requires its normal internal scrolling to see the complete final line; a further executable internal-scroll check was added for the final run without replacing initial-focus measurements.

### Final local acceptance

The final Node 22 `npm run check && npm run build` exited with code 0 after all source and test changes. Every registered suite passed: type checking, parser, streaming, selective materialization, Worker boundaries, locale, accessibility structure, compatibility contracts, product/privacy policy, Mac launchers, fictional stress-pack tooling and production-browser regression.

The new manual-copy module again passed in all three locales with nine controlled clipboard calls and zero clipboard writes from manual selection. The final internal-scroll assertion reached the textarea's last line without changing its value, complete selection or controlled clipboard count. Report-clear and all existing share/copy/PNG/import regressions remained passing. The ordinary and explicitly named downloads still had exactly two expected GUIDs; the named PNG was `pnl-arena-2026-season.png`, 1,279,488 bytes, decoded at 1200×1500. No unexpected network, storage, download or runtime/console behavior was accepted by the suite.

The exact-capacity fictional import completed in 794.2 ms; maximum observed long task was 53 ms. The two controlled startup-stall recovery timeouts were 12,100.6 and 12,103.5 ms, using the unchanged 12-second production timer. These are this Mac's diagnostic measurements with controlled inputs, not iPhone performance, natural phone-timeout or peak-memory guarantees.

The final frontend assets were `index-BKQdU8D0.js` and `index-CEWPZB2W.css`; the parser Worker remained `ibkrParser.worker-Dy6yjzTG.js`. The one failure screenshot and three corrected viewport screenshots, all fictional, were inspected and then removed from their exact temporary directories. They were not committed or copied to iPhone. The browser harness cleaned its isolated profile, downloads and loopback preview.

## Device and release gates

No iPhone, local-network service, VoiceOver setting or hosting session is opened for this checkpoint. The new manual-selection flow needs real-iPhone observation, including actual system selection/copy and user-assisted VoiceOver. That gate is distinct from controlled desktop Clipboard API promises and 320 px viewport checks.

The separate checkpoint 0.20 iPhone PNG naming/focus checks remain open. Historical 0.19 device observations do not certify either changed surface. The minimum iOS/Safari 16.4 version, rotation, measured browser-Worker peak memory, a qualified Exercise-event fixture and deferred HTTPS/deployed-boundary checks remain unverified. This checkpoint is not a public-release decision.

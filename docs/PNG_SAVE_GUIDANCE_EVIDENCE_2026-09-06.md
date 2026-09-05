# Checkpoint 0.20 — PNG save guidance and named-download attempt

Date: 2026-09-06

Status: `FINAL_WITH_OPEN_DEVICE_GATES`. The initial source-contract and complete automated check passed, but subsequent visual QA found an obscured preview heading and close control. A targeted regression reproduced that defect. After the CSS correction, the final complete automated check, production build, production-browser regression and six viewport-image inspections all passed. Real-iPhone verification of the changed save surface remains open.

Scope: local UI, three-locale guidance, responsive styling and browser regressions using fully fictional data. The baseline application is checkpoint 0.19; the earlier iPhone observations used source commit `8cf0496`. The new 0.20 UI has not been retested on iPhone.

## Problem and implementation

The 2026-09-06 iPhone record proved a usable local-HTTP PNG preview/save/reopen route, but not exact naming: Safari's Save as field displayed `Unknown`, and entering `pnl-arena-test-20260906.png` produced `pnl-arena-test-20260906.png.png`. That observed `FAIL` remains in `IPHONE_SAFARI_EVIDENCE_2026-09-06.md`; the change described here does not replace it with a pass.

The fallback preview now offers two distinct actions:

- **Try named download:** a visible anchor uses the current preview's existing Blob URL and `download` value equal to the generated complete PNG filename. It has `target="_blank"` and `rel="noopener noreferrer"`; if the browser follows the link as navigation instead of honoring the download hint, the intended navigation destination is a separate tab rather than the report tab.
- **Open PNG in Safari:** the original image-opening route remains available and has no `download` attribute. It uses the same Blob URL with `target="_blank"` and `rel="noopener noreferrer"`.

No automatic second download is started when the preview appears. The user selects the additional download attempt explicitly. Existing Canvas generation, PNG content, MIME type, generated filename, native-share delivery, cancellation and stale-request handling in `shareCard.ts` are unchanged.

English, Simplified Chinese and Traditional Chinese guidance now separates the expected complete filename from the suggested name without its final `.png`. It explains that:

- A preview is not proof that a file was saved, and the app cannot confirm system save completion.
- Safari may show `Unknown` or a random name. The user can try the name without its extension and should not add `.png` again when the system supplies it.
- The saved file should be reopened in Files and its actual complete name checked for one `.png` suffix. This is guidance, not a guarantee about every Safari version or save dialog.
- On My iPhone and iCloud Drive are different save locations; iCloud Drive synchronizes the copy to other devices.
- Closing the preview or clearing the report does not delete a saved/shared PNG or close a separately opened image tab. Separate copies must be removed at their destinations.

The instructions use an ordered list. Both links retain native keyboard semantics and visible focus styling, wrap at narrow widths, and have a minimum 44 px action height. Long names can wrap without horizontal overflow.

## API boundary and official references

The HTML `download` attribute supplies a suggested filename for a download; the browser's download handling and filename adjustment are not equivalent to control over Safari's separate image-sharing Save as interface. The new link is therefore labelled as an attempt. [HTML Standard: downloading resources](https://html.spec.whatwg.org/multipage/links.html#downloading-resources)

Blob URLs are generated from an origin and UUID. The Blob-fetch response model provides the content length and type, rather than a page-supplied `Content-Disposition` filename. A correctly named JavaScript `File` consequently does not establish that opening its Blob image and invoking the operating system's save interface will preserve that name. This is the applicable API boundary, not proof of the internal cause of Safari's observed `Unknown` label. [File API: Blob URL model](https://www.w3.org/TR/FileAPI/#dfn-generate-a-blob-url), [Fetch Standard: scheme fetch](https://fetch.spec.whatwg.org/#concept-scheme-fetch)

Native Web Share requires a secure context and transient user activation. A phone visiting the Mac's ordinary LAN HTTP address does not gain the same-device localhost exception. This checkpoint does not change hosting, certificates, browser permissions or these API requirements. [Web Share API](https://www.w3.org/TR/web-share/), [Secure Contexts](https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy)

Apple documents renaming in Files, which remains a possible user-controlled correction after saving. The official references above do not guarantee that entering only a name without its extension will produce exactly one `.png` in every Safari save route. [Apple: modify files and folders in Files on iPhone](https://support.apple.com/en-ca/guide/iphone/iphc61044c11/ios)

## Verification completed before the focus correction

- A source-contract check was run against the pre-change implementation and failed with the missing `data-action="download-preview"` marker. It passed after the UI was implemented. This red/green result establishes that the check detects the absent UI contract; it does not establish browser download behavior by itself.
- The first full `npm run check` passed with the new UI and browser module before the later focus-visibility regression was added.
- Production Chrome generated the real Canvas PNG and Blob. Capability detection was controlled to expose the fallback; the actual named-download anchor and Chrome download path were not replaced with a fake save.
- The named-download result was an actual `pnl-arena-2026-season.png`, 1,279,488 bytes and 1200×1500 pixels, with PNG structure and Chrome decoding checked.
- The whole browser run recorded exactly two distinct expected download GUIDs: the existing ordinary desktop PNG download and the new explicitly selected named-preview download. The preview remained usable, and creating a preview itself started no download.
- The module checked three-locale complete-name/name-without-extension guidance, link attributes, shared Blob identity, a real 1200×1500 preview, 320 px horizontal containment, report preservation, Blob URL release and focus return on closing.

These results describe the earlier passing run. They do not override the later defect below or constitute final acceptance after its correction.

## Focus defect found by subsequent visual QA

At a 320×900 desktop-Chrome viewport, automatic focus moved to the PNG preview while the sticky top bar covered its heading and close button:

| Element | Observed bounds before correction |
| --- | --- |
| Top bar bottom | 62 px |
| Preview heading | top 34.17 px; bottom 51.17 px |
| Close control | top 17.17 px; bottom 49.17 px |

Both control centres were covered. Being the active element was therefore insufficient proof of an operable visible preview.

A new regression measures these bounds and uses hit testing immediately after the real automatic focus scroll, before any screenshot-specific scrolling. It failed on the uncorrected layout. The correction adds `scroll-margin-top: 88px` to the preview panel. The subsequent complete production-browser regression exited successfully, including all existing capacity and import-recovery cases. Its automatic-focus measurements were:

| Locale | Heading top | Close-control top | Top bar bottom | Heading and close hit tests |
| --- | --- | --- | --- | --- |
| English | 122.17 px | 105.17 px | 62 px | Both unobscured |
| Simplified Chinese | 123.73 px | 104.73 px | 62 px | Both unobscured |
| Traditional Chinese | 123.58 px | 104.58 px | 62 px | Both unobscured |

All six hit tests passed, and the bounds checks kept both elements within the unobscured viewport. The actual named-download PNG again had the expected complete filename, 1,279,488 bytes and 1200×1500 pixels.

The main agent also opened and visually inspected six ordinary 320×900 screenshots: the automatically focused preview and the scrolled instruction ending in each of the three locales. Sticky/fixed navigation remained visible. The heading and close control were visible at initial focus; the complete instruction ending could be scrolled above the bottom navigation, with no horizontal overflow. These are desktop-Chrome viewport observations, not iPhone screenshots or device-release evidence.

## Final local acceptance

- [x] Pass the complete production-browser regression after the focus correction, including the new unobscured-heading/close-control assertions in all three locales and the existing capacity/recovery cases.
- [x] Inspect six ordinary 320×900 viewport screenshots with navigation visible: the automatically focused preview and the scrolled instruction ending for each locale. The main agent directly viewed all six images; screenshot repositioning did not replace the separate initial-focus assertions.
- [x] Complete the final `npm run check` after the focus correction. All registered suites passed, including the source contract now invoked by the browser suite.
- [x] Complete the final `npm run build` after that check. Both commands exited with code 0.

The final browser run generated three actual Blob previews and again saved the explicitly requested named PNG as `pnl-arena-2026-season.png`, 1,279,488 bytes and 1200×1500 pixels. Exactly two expected download GUIDs were accepted across the ordinary and named-preview routes; there was no unsolicited download. All three locales retained the unobscured heading/close measurements recorded above. The existing 10 controlled copy calls, 9 controlled share calls and import-recovery regressions also passed. The network/storage allowlists and console/runtime checks reported no unexpected behavior.

The existing exact-capacity fictional import completed in 802.6 ms in this final desktop run, and over-capacity cases retained the prior report. This is a directional observation for this Mac, not a phone-performance guarantee. No capacity or accounting policy was changed.

The final build produced frontend assets `index-Bj3y5ptC.js` and `index-Dvts8Qne.css`; the parser Worker remained `ibkrParser.worker-Dy6yjzTG.js`. The three initial diagnostic images and six final viewport images contained only fictional data, were directly inspected, and were removed from their two exact temporary directories after QA. They were not added as repository artifacts. Their inspection does not replace the executable focus/overflow assertions.

## Limits and unchanged decisions

No new iPhone test has been performed for this UI, no phone test files were recreated, and no phone/LAN session or deployment was started for this checkpoint. The previous exact-filename `FAIL` remains valid historical evidence. Correct naming through the new anchor, the revised manual-name suggestion, and the `noopener noreferrer` image-opening route still require real-iPhone observation before device claims can be made. Section I of `IPHONE_SAFARI_TEST_CHECKLIST.md` records that targeted 0.20 follow-up as `NOT_RUN`; section H remains the separate 0.19 device record.

Desktop Chrome, source contracts and simulated widths do not establish iOS/Safari 16.4 compatibility, actual rotation, complete VoiceOver behavior, measured peak memory, HTTPS native sharing or exact iOS filename preservation. The qualified Exercise fixture and deployed Network/Storage/header gates remain open. No release-readiness or deployment decision is implied.

The work adds no server, upload, persistent financial data, network endpoint, dependency, or analytics. No private statement was used. Existing accounting rules, parser behavior, achievements, capacity limits and the L deployment freeze remain unchanged.

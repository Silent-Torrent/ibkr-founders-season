# iPhone VoiceOver preflight — 2026-09-14

## Scope and result

Starting from clean `a155d163ea72e966e051ee46c977e706392ff173`, the user explicitly agreed to the proposed temporary VoiceOver/listening workflow. This resolves the previous consent wait; it does not authorize a network/security change, deployment, real-statement transfer or unrelated deletion.

The proposed first segment was portrait Simplified Chinese Demo: navigation/control names, privacy-dialog reading/focus, and manual-summary reading/selection. No file picker/import, clipboard copy or PNG was planned for that segment. It did **not** run because the phone could not reach the current local test address. D07 remains `OPEN`; no speech, focus-order or application-navigation pass is claimed. This is a connection prerequisite blocker, not a failed speech test.

## Direct observations

- Reconnected iPhone Mirroring and freshly checked About: **iPhone 15 Plus / iOS 27.0**. Personal device identifiers are intentionally not retained.
- Accessibility and the VoiceOver detail screen both showed **Off**. VoiceOver was not enabled in this attempt; older VoiceOver observations remain separate history.
- The unchanged production 0.24 bundle was served temporarily on the current Mac LAN address, port 4174, using Node 22 and Vite preview with `--strictPort`; it was not bound to all interfaces.
- Mac-side HTTP returned 200 and the served main JavaScript matched the existing production hash. This is Mac-side reachability only, not phone loading or a served-all-assets check.
- Original input source was Simplified Pinyin (`SCIM.ITABC`). A temporary switch to ABC was verified before typing the local URL; its ASCII spelling was visually checked before Return. Pinyin restoration was independently read back afterward. No clipboard/paste operation occurred.
- Safari on the phone explicitly displayed “Safari can’t open the page because it couldn’t connect to the server.” No application page loaded in this attempt.
- A read-only inspection of Mac System Settings showed an active personal-hotspot connection; iPhone Settings showed a different Wi-Fi network. **Different current networks are directly observed.** This is a relevant connectivity obstacle, not proof of the only cause, a firewall defect, router client isolation, or success after a future switch. Network names/addresses are intentionally omitted from this repository record.
- No network, firewall, security/access, VoiceOver, product, deployment or persistent application-preference change was made. Mac System Settings was returned to its original General page. No real statement, CSV import, PNG, phone file/photo deletion or new clipboard use occurred. Earlier clipboard-restoration uncertainty and the old Photos D06 item remain untouched.

## Cleanup and unchanged inputs

- The sole identified failed test tab was closed. Safari returned to Start Page; reopening the tab overview showed only Start Page. Home was then observed.
- Owned server PID `14517` was rechecked for its exact Node/Vite preview command and 4174 binding immediately before TERM. Session `77258` exited 143. A subsequent PID check and listener check for ports 4173/4174 found none.
- No new phone files or generated images existed from this attempt, so none were deleted. Closing the failed tab is not a claim to erase browser history or a system clipboard.
- Production asset SHA-256 values checked before serving and unchanged at final cleanup:

| Asset | SHA-256 |
| --- | --- |
| `index-D2xVCgsR.js` | `da868302e8f099bfd67b296b9bf9084d28940372797a8f0b69a7c347a654543b` |
| `index-W6y1gsmE.css` | `cdbe3454f57206cb87a7734aaa7c495c4cef10437017d14f751dd4f115fb3803` |
| `ibkrParser.worker-Dy6yjzTG.js` | `088f401e02c1b53aa3fe210ca7ef9e5f5343b8c929d078a5270d317896439b5a` |

No product edit, rebuild or product test-suite rerun was needed or performed. Documentation checks do not constitute an application acceptance pass.

## Next boundary

Ask before changing either device's network. The proposed scoped option is temporarily moving the Mac to the phone's current Wi-Fi and restoring/rechecking its original hotspot after testing; explain the temporary connectivity interruption and same-LAN availability of the fictional test page. This would not authorize changing the phone network, router, VPN, firewall or other security/access settings. If a password is needed, the user enters it in the system interface. Do not bypass browser warnings or reopen deployment to work around this failure. Actual same-network reachability must still be verified before enabling VoiceOver. A shared Wi-Fi may still isolate devices; that possibility is not currently proven.

After connectivity is established, retain the already received VoiceOver consent, accompany the user and collect actual listening feedback in small stages. Only the user can confirm speech here; screenshot focus is not audio evidence. Explain any later fictional-file import/transfer stage separately and clean its exact test objects. Demo-only checks cannot close complete D07.

The current product remains **0.24**, with **9 OPEN / 3 CLOSED** baseline gates (5 device/cleanup, 1 financial-source, 3 deployment). No new baseline gate is added for this prerequisite. D01 remains developer-owned measurement-method work; the previously accepted L01 and D03/D04/D05 scopes remain unchanged. **L deployment freeze remains in force.**

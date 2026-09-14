# iPhone same-Wi-Fi retest — 2026-09-14

## Authorized scope and actual result

Starting from clean `b9496c16f8a2b9d1a627dcc12923ecd2c4df723b`, the user replied “可以” to the specific proposal to move the Mac temporarily to the phone's current Wi-Fi and restore its original personal hotspot afterward. Temporary VoiceOver/listening consent had already been received. Neither consent reopens deployment or authorizes changes to the phone network, router, VPN, firewall, privacy controls or other security permissions.

The Mac visibly joined the approved shared Wi-Fi. Both devices' settings then showed the same network name, matching IPv4 subnet membership and the same router. The unchanged 0.24 production bundle was served on only the current Mac LAN address at port 4174. Mac-side HTTP returned 200 and served main JavaScript matched its production hash; phone Safari, after a visually checked ASCII URL submission, still explicitly reported that it could not connect to the server. The app did not load. **VoiceOver was not enabled in this attempt; this is a connection prerequisite failure, not a failed speech test.**

## Bounded read-only diagnostics

- Phone Settings: VPN Off; current Wi-Fi HTTP proxy Off; VoiceOver detail/list screens Off. Network/privacy toggles were inspected only, not changed. Device remains the previously freshly checked iPhone 15 Plus / iOS 27.0; no repeated About pass is claimed for this later stage.
- Mac: application firewall and block-all state were already disabled when read; this attempt did not disable or enable them. Their state therefore does not justify a new firewall-disabling workaround. Broader network extensions/filtering were not audited or ruled out.
- The Mac's route to the phone's exact current IPv4 used the current Wi-Fi interface directly. No alternate tunnel route was observed for that destination; this is not a comprehensive VPN audit.
- One bounded two-packet ICMP probe to that phone address received no replies (exit 2). It is not proof of HTTP reachability, client isolation or the cause of the Safari failure. No subnet scan, packet capture or router changes occurred.
- Shared-network client isolation remains a hypothesis, not an established diagnosis. Matching network names and address configuration do not prove that peer traffic is permitted. Do not repeat refreshes/pings or disable privacy/security protections to force a pass.
- Personal network names, IP/router/MAC addresses and unrelated device information are intentionally omitted from this committed record. No real statement or other sensitive file was read/transferred, and no portal/login/terms/security-warning bypass occurred.

## Cleanup and restoration

- The sole identified failed test tab was closed; Safari returned to Start Page. The phone later returned to observed Home. No new phone file, PNG, import or clipboard operation occurred, so no phone files/photos were deleted.
- Original Mac input source `SCIM.ITABC` was checked, temporarily switched to verified ABC only for ASCII URL entry, then restored and independently read back. No paste helper was used. Earlier clipboard uncertainty remains unchanged.
- Owned server PID `15008` was rechecked for exact command/binding before TERM. Session `47329` exited 143; the process and ports 4173/4174 were subsequently absent. The ICMP session also completed; no test service is intentionally left running.
- All three existing production asset hashes matched the previous preflight before serving and at cleanup; no product change, build or full product-suite rerun occurred.
- **Original hotspot restoration failed and remains unresolved.** The exact original hotspot's Connect action was used, but the UI retained an association indicator and the first readbacks retained the shared-network address/route. macOS then explicitly reported that it could not join the Wi-Fi network. The dialog was cancelled without running Wireless Diagnostics; the settings page again showed the shared Wi-Fi connected. Mac Settings is left on Wi-Fi for the user-assisted restoration, not returned to General. Ask the user to ensure the original hotspot device is nearby and available before retrying; do not say the original network has been restored. All owned test services were already stopped before this restoration attempt.

## Next boundary

The agreed same-network retest has been attempted; do not ask again for the already granted VoiceOver or this completed network-switch consent. The immediate user handoff is **original-hotspot availability and restoration**; no unverified repeated connection attempt is underway. For further phone acceptance, obtain an appropriate reachable, trusted test network through user coordination; do not assume this shared network permits peer traffic. A different device/network arrangement or additional access requires its own scoped explanation and authorization. Actual phone loading must precede the agreed VoiceOver/listening segment.

No acceptance gate closes: **0.24, 9 OPEN / 3 CLOSED** (5 device/cleanup, 1 financial source, 3 deployment). D01 remains developer-owned measurement-method work; old Photos D06 and all prior evidence scopes remain unchanged. **L remains frozen.**

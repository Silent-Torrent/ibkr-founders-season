# Cloud development migration — 2026-10-29

## Authorization and source

The user requested cloud migration for access, editing and development from different devices, and explicitly chose to keep the source public. GitHub metadata and the signed-in web UI confirmed `Silent-Torrent/ibkr-founders-season`, public visibility, and `main` at `afac8e5` before migration. The old desktop checkout was clean at `191b41a` and was fast-forwarded to that live source; the October 21 MIT release was preserved.

The migration includes tracked source, documentation, synthetic fixtures, Git history and a reproducible development environment. It excludes local credentials, raw brokerage statements, `.env.local`, machine-specific deployment state and redundant local build/temporary archives. No synced ChatGPT `sources/` files were changed. Cloud code access does not synchronize browser-session financial reports or chat history.

## Configuration

- Official Node 22 Bookworm development image, non-root `node` user, Chromium, zsh and CJK fonts.
- Locked dependency installation on creation; existing full regression command retained.
- Explicit cloud start commands with exact per-Codespace host allowlisting and fixed 5173/4173 ports. No wildcard host trust or browser isolation bypass.
- Private authenticated forwarded ports; actual account/port observations are recorded below, not inferred from the Docker configuration.
- Existing production CSP and financial application source remain unchanged.
- The old Vite 8.2.2 and source-map-js 1.2.1 dependencies triggered the current audit. Vite was updated within the same minor line to 8.2.4; the transitive source-map fix is recorded in the lockfile. Initial failing audits remain distinct from the final check.

## Account observations

On October 29, the signed-in account had GitHub Free, no existing Codespaces, and no reported Codespaces metered use. The existing Codespaces budget was $0 with usage blocked beyond that budget. It was retained. The default idle timeout was changed from 30 to 15 minutes and the UI confirmed the update. Default retention remained 30 days. No payment details, paid subscription, broad repository permission or secret was added.

## Acceptance status

- Static configuration and launcher input validation: PASS. Real local Vite dev and preview requests returned 200 for the exact allowed cloud host and 403 for a different tenant; duplicate server starts failed on the occupied fixed port. Owned servers were stopped after the check.
- Local Node 22 full regression after dependency repair: PASS. `VERIFY_MAC.command` completed: fresh npm ci, zero known audit vulnerabilities, all existing suites and the production Chrome/real Worker regression (36 Worker targets). Vite 8.2.4 and source-map-js 1.2.2 are locked.
- Actual Codespace creation: PASS. The account lists one 2-core work area named `IBKR Cloud Development`, selected in Southeast Asia, with 2.51 GB reported storage. The editor reached a remote-connection Done notification, but the file tree and terminal did not become usable. Actual dependency installation and runtime acceptance are unverified.
- Authenticated dev/production preview and private port access: BLOCKED by the editor connection; no app port was started or made public.
- Stop/resume control-plane operation: observed (Stop acknowledged, then the same Codespace returned to Active). Editor functionality after resume: still unverified/blocked. Cloud regression: NOT RUN.
- Actual second physical device and mobile editing: NOT RUN.

### Current blocker and next action

Chrome logged a GitHub authentication-provider registration timeout, a Web Worker Extension Host startup timeout and a remote ExtensionHost WebSocket timeout. Ordinary reload, a stable-channel recovery entry and stopping/reopening the same Codespace did not yield a usable file tree or terminal during this session. These observations do not establish a root cause in the network, credentials or container. No browser/network security settings were weakened.

The user was asked to try the same named Codespace from another device. On recovery, first run `git pull --ff-only` and rebuild the development container if prompted: the existing Codespace was created from `7935030`, before the explicit Chromium sandbox package was added in `d7df368`. Then verify npm installation, the unchanged full regression, private 5173/4173 previews, source editing and push, and actual device access. Do not call the migration fully accepted before those checks. The final live work area was Active with a configured 15-minute idle timeout; no app server was observed running.

Configuration alone does not prove a running cloud environment. The product stays at checkpoint 0.42 with 9 OPEN / 3 CLOSED release gates; personal development previews do not establish public production readiness, iOS/Safari baseline acceptance or broker authenticity.

## References

- [Codespaces billing](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces)
- [Port forwarding](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace)
- [Vite cross-origin advisory and fixed versions](https://github.com/advisories/GHSA-9jrq-w75r-8gcw)
- [Vite filesystem advisory and fixed versions](https://github.com/advisories/GHSA-rq7h-c2jc-7f22)
- [Source-map advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)

- [Official client troubleshooting](https://docs.github.com/en/codespaces/troubleshooting/troubleshooting-github-codespaces-clients)
- [Official connection troubleshooting](https://docs.github.com/en/codespaces/troubleshooting/troubleshooting-your-connection-to-github-codespaces)

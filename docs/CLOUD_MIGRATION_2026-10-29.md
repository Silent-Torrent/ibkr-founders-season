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
- Local Node 22 full regression after dependency repair: RUNNING. Fresh npm ci and npm audit passed with zero known vulnerabilities (Vite 8.2.4, source-map-js 1.2.2).
- Actual Codespace creation and dependency installation: PENDING.
- Authenticated dev/production preview and private port access: PENDING.
- Cloud regression and stop/resume: PENDING.
- Actual second physical device and mobile editing: NOT RUN.

This record will be updated with observed results. Configuration alone does not prove a running cloud environment. The product stays at checkpoint 0.42 with 9 OPEN / 3 CLOSED release gates; personal development previews do not establish public production readiness, iOS/Safari baseline acceptance or broker authenticity.

## References

- [Codespaces billing](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces)
- [Port forwarding](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace)
- [Vite cross-origin advisory and fixed versions](https://github.com/advisories/GHSA-9jrq-w75r-8gcw)
- [Vite filesystem advisory and fixed versions](https://github.com/advisories/GHSA-rq7h-c2jc-7f22)
- [Source-map advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)

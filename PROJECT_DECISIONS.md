# Locked product decisions — v0.4

This record includes the user's approved decisions through 2026-10-21 plus implementation safeguards that do not expand the approved scope. It supersedes conflicting v0.1 and v0.2 storage, identity, verification, PDF-input, browser-support, source-control, and deployment assumptions. The 2026-10-21 decision replaces the v0.3 private-source requirement with authorization to publish the source under MIT; hosted application deployment remains frozen.

## Product

P&L Arena is an annual-season performance identity layer for IBKR stock and options users.

## Season model

- One natural year equals one season.
- 2026 is the Founders Season / beta season.
- No daily, weekly, monthly, or quarterly rankings in the MVP.
- Users may update their standing by importing a newer YTD report.
- A newer YTD snapshot replaces the older one; snapshots are not summed.

## Data

- Current MVP input: English IBKR Activity Statement CSV.
- CSV is required for machine calculation. A matching PDF is optional reconciliation evidence; PDF-only does not create a ranked result.
- One account only.
- Current natural-year YTD only.
- Raw file parsed in browser.
- IBKR YTD MTM is the season P&L source of truth.
- Current unrealized P&L is explanatory, not added to YTD MTM.
- Self-uploaded CSV status: Self-Reported, never Verified.
- Repository-owned fictional fixtures matched by normalized SHA-256 content digest are labelled Fully Synthetic Test, not Self-Reported; this content match is not a general authenticity detector.
- Source tiers: Demo → Self-Reported → Reconciled Self-Reported → Broker-Sourced.
- CSV/PDF agreement can reach Reconciled Self-Reported only. Verified/Broker-Sourced requires a future approved direct read-only source.

## Product surfaces

- Ledger: underlying-level stock + options performance.
- Arena: synthetic product demo in MVP.
- Trophies: data-triggered and locked preview badges.
- Import: export instructions and local parser.
- Share card: local PNG and text summary.

## Ranking model

Future official annual boards:

1. Season Return.
2. Season P&L.
3. Capital Divisions.

Exact account balance is private by default. Net liquidation value determines a division, not a skill score.

- Current capital-division thresholds are USD-only. Non-USD NAV remains ungrouped until an exchange-rate policy is explicitly approved.
- Default share outputs omit holdings, account identifiers, and exact net liquidation value, but a displayed USD division can still reveal a broad balance range.

- Absolute Season P&L and TWR/Season Return are separate boards.
- The ranking unit is an account-season entry; the product does not claim one natural person has only one brokerage account.
- Self-Reported/Reconciled Self-Reported and Broker-Sourced results must use separate boards, not merely different icons.
- No prize with material value is awarded from self-reported files.

## Architecture

- React + TypeScript + Vite.
- Static Web App for MVP.
- No authentication, backend, database, or payment.
- Raw files and the full normalized report live in current-session browser memory by default.
- `localStorage` is limited to non-sensitive preferences such as locale. A future “remember locally” feature requires explicit opt-in and separate review.
- The supported browser baseline is iOS 16.4+ and Safari 16.4+.
- That baseline applies to the production bundle. The Vite development server is not compatibility evidence for Safari/iOS 16.4.
- The user authorized public source publication under the MIT License on 2026-10-21. The earlier beta-stage private-repository restriction is superseded; see `docs/OPEN_SOURCE_RELEASE.md` for publication status.
- Git commits must use the user's approved GitHub `noreply` email, not a personal email address.
- The earlier authorization for an access-protected Vercel Preview is paused because the provider forced the empty project's first Preview request into Production.
- On 2026-08-30 the user chose **A + C**: keep Vercel at zero deployments and perform read-only research into private-test alternatives. No alternate provider or hosting upload is approved by that choice.
- The user chose **L** on 2026-08-30: continue local development and defer hosted deployment until the local product is ready. Its original private-GitHub requirement was superseded by the 2026-10-21 source-publication decision. Hosting research remains reference material, not deployment authorization.
- Do not create, publish, or expose any external deployment until the user explicitly approves a researched route and its provider-specific release gate.
- Any future public or Production deployment requires a new explicit user decision and a fresh release-gate review.

### Deployment implementation status — 2026-08-30

- An empty Hobby-plan Vercel project now exists with Vercel Authentication set to Standard Protection. It has no surviving deployment and no connected Git repository.
- Vercel classified the first upload as Production even though the CLI request explicitly used `--target=preview`; it also assigned the default production alias. The deployment was immediately removed, and both generated URLs were verified as `404 DEPLOYMENT_NOT_FOUND`.
- The provider currently forces a new project's first deployment to Production. Therefore the frozen Preview-only decision cannot be completed on this empty Vercel project without a new user decision about a non-public Production bootstrap or a different hosting route. Do not retry the upload while the project has zero deployments.
- Provider evidence: [open Vercel CLI issue #17069](https://github.com/vercel/vercel/issues/17069) and [Vercel staff confirmation on 2026-08-22](https://community.vercel.com/t/fresh-no-git-cli-and-rest-deployments-classified-as-production-despite-documented-preview-defaults/46150).
- A read-only comparison now identifies Netlify Free Private + manual Draft Deploy as the strongest owner-only persistent-cloud candidate; Tailscale Serve as an optional temporary owner-device bridge; and Cloudflare Pages + Access as a more complex multi-user fallback. This is not deployment approval.
- Under the subsequent L decision, no alternate-host selection is currently pending; external deployment work is deliberately deferred while local product-integrity and security work continues.
- The complete scope, official references, proposed gates and stop conditions are in `docs/PRIVATE_TEST_HOSTING_RESEARCH_2026-08-30.md`.

## Security and data collection

- The MVP sends no raw statement, account identifier, symbol, holding, amount, filename, or full error object to a server or analytics provider.
- Product telemetry is off by default. Any future telemetry uses a fixed non-financial field whitelist, consent where required, and a finite retention period.
- Never collect IBKR username, password, PIN, 2FA code, trading permission, or order-capable credential.
- Server-side raw uploads and an IBKR read-only connection are separate high-risk stages. Each requires explicit approval, security gates, and independent review.
- Public pages cannot be made uncrawlable; sensitive data must therefore never be present in public pages or unauthenticated APIs.

## Brand

- Data layer: restrained, dark, financial, legible.
- Entertainment layer: playful badges and season identity.
- Three interface locales: English, Simplified Chinese, Traditional Chinese.
- Long-term phrase: “Serious P&L. Unserious Wall Street.”

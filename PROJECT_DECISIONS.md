# Locked product decisions — v0.3

Updated and approved by the user on 2026-08-29. This version supersedes conflicting v0.1 and v0.2 storage, identity, verification, PDF-input, browser-support, source-control, and deployment assumptions.

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
- The remote source repository must be a GitHub private repository during the current beta stage.
- Git commits must use the user's approved GitHub `noreply` email, not a personal email address.
- External deployment is limited to a Vercel Preview protected by access control. Do not create, publish, or expose a Vercel Production deployment or production domain in the current stage.
- Any future public or Production deployment requires a new explicit user decision and a fresh release-gate review.

### Deployment implementation status — 2026-08-29

- An empty Hobby-plan Vercel project now exists with Vercel Authentication set to Standard Protection. It has no surviving deployment and no connected Git repository.
- Vercel classified the first upload as Production even though the CLI request explicitly used `--target=preview`; it also assigned the default production alias. The deployment was immediately removed, and both generated URLs were verified as `404 DEPLOYMENT_NOT_FOUND`.
- The provider currently forces a new project's first deployment to Production. Therefore the frozen Preview-only decision cannot be completed on this empty Vercel project without a new user decision about a non-public Production bootstrap or a different hosting route. Do not retry the upload while the project has zero deployments.
- Provider evidence: [open Vercel CLI issue #17069](https://github.com/vercel/vercel/issues/17069) and [Vercel staff confirmation on 2026-08-22](https://community.vercel.com/t/fresh-no-git-cli-and-rest-deployments-classified-as-production-despite-documented-preview-defaults/46150).

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

# AGENTS.md — P&L Arena / IBKR Founders Season

This file is the operating contract for any coding agent working in this repository.

## 1. Read before doing anything

Before editing, running commands, installing packages, or proposing architecture changes, read:

1. `WORK_HANDOFF.md`
2. `PROJECT_DECISIONS.md`
3. `MVP_BACKLOG.md`
4. `VERIFICATION.md`
5. `README.md`

For the first local Work session, do not run or modify the project until the user explicitly asks. Begin with a repository audit and report what is present, what is unverified, and the safest next action.

## 2. Locked product decisions

Do not change these without explicit user approval:

- One natural year equals one season.
- 2026 is the Founders Season / beta season.
- MVP accepts one English IBKR Activity Statement CSV for the current natural-year YTD period.
- One IBKR account only.
- A newer YTD snapshot replaces the older snapshot; snapshots are never summed.
- IBKR YTD Mark-to-Market P&L is the season P&L source of truth.
- Current unrealized P&L is explanatory and must not be added again to YTD MTM.
- Self-uploaded CSV results are `Self-Reported`, never `Verified`.
- CSV is the required machine-readable input; PDF is optional reconciliation evidence and PDF-only does not produce a ranked result.
- Trust tiers are `Demo`, `Self-Reported`, `Reconciled Self-Reported`, and `Broker-Sourced`.
- Raw CSV parsing is local in the browser.
- Raw files and the full normalized report remain in current-session memory by default; only non-sensitive preferences may use `localStorage`.
- MVP has no authentication, backend, database, payment, trading capability, or IBKR credential collection.
- Interface locales: English, Simplified Chinese, Traditional Chinese.
- Data presentation is serious; trophies, season identity, and share cards may be playful.
- MVP does not include real public leaderboards, posts, comments, or chat.
- Future ranking identity is an account-season record, not a nickname and not a claim of one natural person per account.
- Supported browser baseline: iOS 16.4+ and Safari 16.4+; compatibility claims apply to the production bundle, not the Vite development server.
- Public source publication under the MIT License was authorized on 2026-10-21, superseding the earlier private-repository restriction. Commits must still use the user's approved GitHub `noreply` identity.
- The 2026-08-30 decision L continues to supersede the earlier Preview-only authorization: hosted application deployment is frozen while local development and GitHub source maintenance continue. The 2026-10-21 source-publication authorization does not authorize Vercel or another hosted deployment; Production deployment or public application exposure still requires an explicit user decision and provider-specific release-gate review.

## 3. Financial-data correctness rules

This is a financial analytics product. A visually attractive but numerically incorrect result is a failed implementation.

- Never infer P&L by simply summing premiums, cash flows, and unrealized values.
- Never treat deposits, withdrawals, transfers, or account balance changes as profit.
- Never label a partial report as all-time performance.
- Never combine overlapping reports.
- Never silently ignore unsupported rows or reconciliation differences.
- Preserve asset-class separation: Stocks, Options, and Other.
- Map options to their underlying symbol before aggregation.
- Assignment, exercise, and expiration must be represented as lifecycle events, not invented profit.
- Every accounting change requires a parser fixture or test case.
- When the data source is ambiguous, expose a warning instead of guessing.

## 4. Security and privacy rules

- Never request or store an IBKR username, password, trading token, or trading permission.
- Do not send raw statements to a server in the MVP.
- Do not add analytics that capture financial rows, symbols, balances, account IDs, or uploaded filenames.
- Account identifiers must not be persisted in the MVP. A future server-side continuity identifier requires a secret-key HMAC, not a plain hash.
- Do not add third-party scripts without explaining their data access and obtaining user approval.
- Do not persist the full normalized financial report in `localStorage`, `sessionStorage`, IndexedDB, or Cache Storage without a separately approved opt-in design.

## 5. Engineering rules

- Stack: React, TypeScript, Vite.
- Prefer small, testable modules over large parser files.
- Use strict types; avoid `any` unless isolated and documented.
- Keep UI components separate from parsing and accounting logic.
- Do not introduce a new framework, state library, backend, or database without a demonstrated need and user approval.
- Keep dependencies minimal and pinned.
- Preserve mobile usability, especially iPhone Safari import and share-card export.
- Update `MVP_BACKLOG.md` and `VERIFICATION.md` when completing or validating work.
- Summarize each code change in plain Chinese for the user, including risks and what remains unverified.

## 6. Expected repository structure

Core parser and domain logic should remain under `src/lib/` or be split into clearer submodules if the parser grows. UI belongs under `src/components/` and `src/pages/`. Test fixtures belong under `public/` or a dedicated `tests/fixtures/` directory.

If `src/lib/ibkr.ts` continues growing, prioritize splitting it into:

- section detection
- report metadata validation
- performance parsing
- positions parsing
- trade parsing
- option lifecycle parsing
- underlying normalization
- reconciliation

Do not refactor merely for style before the real IBKR report is reconciled.

## 7. First local Work task

The first task is an audit, not feature development:

1. Inspect the repository and dependency manifest.
2. Read the parser and smoke test.
3. Identify assumptions that require a real redacted IBKR YTD CSV and matching PDF.
4. Report blockers and recommend the smallest next step.
5. Do not run installation, development server, or build until the user authorizes it.

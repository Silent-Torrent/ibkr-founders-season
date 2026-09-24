# Option-event identity integrity — 2026-09-25, checkpoint 0.27

## Reproduced problem

A fully fictional current-schema Trades fixture had one 16:00 Assignment of quantity -1. Adding a second row for the same contract and calendar day at 17:00 with quantity -2 made the old parser return no errors and `dataQuality=good`, but it still counted only one Assignment and retained provenance for the first row only. The old key was underlying + raw contract + day + event type; it silently discarded distinct source rows. The first new parser assertion failed against that old behavior with `Distinct same-day assignment rows were silently collapsed: []`. No private broker report was opened or used.

## Bounded repair

- Within the already selected authoritative lifecycle source (dedicated section if it has Data rows; otherwise Trades), matching section/header/field values keep the existing duplicate-row behavior. Different rows with one supported event identity now cause `option_event_identity_conflict` and no report. They are not guessed to be one event or automatically counted as two. This does not change P&L arithmetic.
- Identity matching normalizes contract/underlying capitalization and whitespace. A second red test showed that raw-case variation bypassed the first repair; it now fails closed.
- The identity key also matches two strictly parsed standard spellings when root matches the resolved underlying: `ZZFICTA 19JUN26 125 P` and `ZZFICTA260619P00125000`. Calendar date, call/put and exact thousandth-unit strike are validated before matching. Another red test showed the compact spelling bypass before this step. Different expiration, right and strike remain different series in fictional regressions. Unsupported, adjusted, four-digit-year and other unverified notation falls back to a separate raw-text key; the repair does **not** establish universal economic-contract equivalence.
- The error and specific instruction not to merge/edit rows are available in English, Simplified Chinese and Traditional Chinese. The fixed parser/import diagnostic total is now 44. An unsuccessful import preserves the report already open in the tab.

## Verification and limits

Parser regressions cover distinct same-day Trades rows, dedicated-event rows, case and whitespace variations, strict compact equivalence including exact `125.5` and `125.005` decimal strikes, distinct series and matching repeated rows. An independent read-only review also checked decimal equivalence without finding an obvious false merge. The production-Chrome regression used only a generated fictional collision through the real Worker, observed the specific error/recovery, then verified that the previous three-row synthetic Ledger, source label and Season P&L remained unchanged. The temporary test browser/profile and generated CSV were removed by the test runner.

Final Node 22.23.2 `npm run check` exited 0, including parser, streaming, materialization, Worker, i18n, accessibility, compatibility, policy, launcher, fictional phone-pack and production-Chrome suites. Final `npm run build` exited 0, producing `index-TT4XqpJK.js`, `ibkrParser.worker-B959cVCv.js` and `index-W6y1gsmE.css`. `npm audit --audit-level=high` found 0 vulnerabilities. These local tests do not verify a real broker Exercise row, all possible contract spellings, iPhone VoiceOver, iOS/Safari 16.4, Worker-exclusive peak memory, or any deployment.

The fixed P0 release gates stay **9 OPEN / 3 CLOSED**. F01, D01/D02/D06–D08 and R01–R03 remain open; the user's L deployment freeze is unchanged.

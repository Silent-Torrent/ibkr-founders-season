# Option-event date integrity — 2026-09-24, checkpoint 0.26

## Problem and scope

The repository-safe, fully fictional current-schema fixture showed a real parser gap: when a selected option Assignment row had an empty or impossible date, the direct parser still produced a `good` report and incremented the event count. The Worker response boundary also accepted an otherwise valid event with no date. An out-of-period date was rejected by the old Worker boundary, but the direct parser had still returned a misleading `good` report. These are distinct observations; neither proves a defect in a real private IBKR report.

A new parser smoke assertion was run against the old code first and failed with `A dedicated missing option-event date was accepted: []`. No private report was opened or copied for this test.

## Repair

- Every selected Assignment, Exercise or Expiration event must have a valid calendar date within the statement's inclusive YTD period. Missing, nonexistent and out-of-period dates now return the fixed `option_event_date_invalid` error and no report; they do not increment lifecycle counts or become undated achievements.
- The already-supported date forms remain accepted, including a plain `June 20, 2026` and the fictional Trades `2026-06-19, 16:00:00` Date/Time cell. Only a recognizable, valid time suffix is removed before date parsing; `25:00:00` is rejected. The independent review caught the month-first comma ambiguity before this correction.
- `OptionEvent.date` is now required in the in-app type and the Worker response validator, with the period check retained. The browser still treats every imported file as `Self-reported · not broker-verified`; the change is not authenticity verification and does not infer any unproven real Exercise CSV shape.
- The error and its specific re-export guidance are present in English, Simplified Chinese and Traditional Chinese. No P&L arithmetic, 5 MiB/row/symbol/event capacity, persistence, upload, deployment or achievement threshold changed.

## Verification and limits

- Parser smoke tests cover the dedicated lifecycle section and Trades fallback: blank, nonexistent, before-period and after-period dates fail closed; a missing dedicated Date column fails; month-first dates and the known time-suffixed form remain accepted.
- Worker boundary tests require a date on an otherwise valid event and continue to accept a dated event, including an empty optional contract.
- A production-Chrome import regression constructs its malformed input only from the fully fictional fixture, receives the localized event-date error and recovery text through the real Worker, then returns to the prior three-row synthetic Ledger with its Season P&L and source label unchanged. The temporary browser profile and generated fixture are removed by the test runner.
- Final Node 22.23.2 `npm run check` exited 0, including all parser/streaming/materialization, Worker, three-locale, accessibility, compatibility, privacy/product-policy, launcher, fictional phone-pack and production-Chrome suites. The production-Chrome run passed the new malformed-date import/recovery/preserved-report assertion, ordinary cancellation/capacity checks and the decoded 1200×1500 PNG check. `npm run build` exited 0 and produced `index-CX2NKqBh.js`, `ibkrParser.worker-BSLI_BU5.js` and `index-W6y1gsmE.css`; `npm audit --audit-level=high` reported 0 vulnerabilities. These checks do not establish real iPhone VoiceOver or iOS/Safari 16.4 compatibility.

The P0 release gate count remains **9 OPEN / 3 CLOSED**. F01 still requires a qualified completed-Exercise CSV shape; D01/D02/D06–D08 and R01–R03 remain separate. L deployment freeze is unchanged.

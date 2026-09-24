# Checkpoint 0.35 — Flex boundary rows and production Worker adversarial imports (2026-09-25)

## Scope and source boundary

This checkpoint uses only the repository's wholly fictional current-schema CSV and synthetic mutations generated during local tests. No personal IBKR CSV/PDF, phone file, external deployment, or broker account was used. It follows the separate 0.34 parser/privacy checkpoint; no prior phone observation transfers to this build.

The [official IBKR Activity Flex delivery guide](https://www.ibkrguides.com/reportingreference/reportguide/delivery%20configuration%20and%20general%20configuration.htm) documents optional head/trailer records. For its section boundary rows, `BOS` has the section code, `BOS`, and a description; `EOS` has the section code, `EOS`, a record-count checksum, and an amount checksum. The amount checksum uses NetTradeMoney for Transactions, PositionValue for Positions, and defaults to zero in other sections. The guide lists `BOA`/`EOA` as account boundary descriptors but does not give their payload layout on that page. This source supports a narrow BOS/EOS field-shape guard, not checksum recomputation, a blanket rule for every IBKR export, or broker-file authenticity.

## Parser red-to-green check

Before the repair, a registered accounting section's `BOS` or `EOS` descriptor made the entire row disappear from materialized accounting, including a populated extra field. Four synthetic rows were added to the parser smoke test: `MTMP,BOS,MTM Performance Summary in Base,208.863355`, `MTMP,EOS,Stocks,ZZFICTA`, `MTMP,EOS,123,456`, and `MTMP,EOS,123,0,208.863355`. The old-code red test accepted at least the extra-field case without an error. The new rule returns `accounting_section_conflict` and no report for all four: a `BOS` row cannot carry populated cells beyond its description, and an `EOS` row requires a nonnegative integral record count, a numeric amount checksum, and no populated cells beyond those fields. Only the documented Transaction/Position Flex codes may carry a nonzero amount checksum; `MTMP` may not. A synthetic `MTMP,EOS,123,0` remains accepted, as do the four documented Transaction/Position code shapes with a nonzero numeric amount. Empty trailing cells remain tolerated, consistent with the CSV row-width policy.

`BOA`/`EOA` are still treated as recognized account boundaries without claiming that their unverified payload shapes are validated. The parser does not recompute section record or amount checksums, and a well-formed-looking row does not prove the report came from IBKR.

## Production-browser boundary

The production-Chrome regression now constructs the following entirely fictional mutations, supplies each through the browser file input via DevTools to the built module Worker, checks a visible localized error and recovery path, then returns to Ledger to compare its source, row count, Season P&L and displayed rows against the previously accepted fictional report. This does not exercise the phone's native file picker:

- Populated unknown MTM record type.
- Conflicting stock `Symbol` and `Underlying`.
- Same-day option-event identity collision hidden by two- versus four-digit expiry-year notation.
- Populated unrecognized `P & L` column.
- Populated extra field after an otherwise valid Flex `EOS` checksum.

The same desktop run checks that the 320 px PNG privacy disclosure is visible within the viewport and associated with its action for assistive technology. These are production desktop-browser/Worker checks, not iPhone VoiceOver speech or a deployed-host Network/Storage test.

## Verification and remaining limits

Final Node 22.23.2 `npm run check` passed its TypeScript, parser, streaming, materialization, Worker boundary, i18n, accessibility, compatibility, policy, launchers, fictional phone-pack and production-browser suites. The production-browser run reported 44 local requests and 26 Worker targets; these counts describe the test run, not deployed traffic. Standalone `npm run build` passed with `index-CBIDZIjz.js`, `ibkrParser.worker-BsXKF5SU.js`, and `index-D6ARIZiW.css`. `npm audit --audit-level=high` reported zero vulnerabilities. See [VERIFICATION.md](../VERIFICATION.md) for the concise command record. This checkpoint cannot close D01 Worker peak, D02 iOS/Safari 16.4, D06 old Photos item, D07 complete VoiceOver speech/focus order, D08 full rotation, F01 sourced Exercise shape, or R01–R03 release/deployment gates. The fixed release ledger remains **9 OPEN / 3 CLOSED** under the user's **L deployment freeze**.

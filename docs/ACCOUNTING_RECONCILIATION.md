# Accounting and reconciliation specification

Status: **locked accounting contract aligned to coded checkpoint 0.9**
Scope: one English IBKR Activity Statement CSV, one account, current calendar-year YTD
Priority: when UI copy, legacy code, or a synthetic fixture conflicts with this document, stop and resolve the conflict before publishing a result.

This document defines what the product may calculate, what it may only explain, how displayed values are traced through local normalized source references, and when a result is safe to display or rank. It does not turn a user-uploaded file into broker-verified data.

Implementation checkpoint 0.9 uses the field names and difference direction below, fixes the CSV epsilon at `0.000001`, and implements the MTM, statement-period P/L, and NAV-bridge checks with local `SourceRef` provenance. The Ledger exposes references for major portfolio metrics and these three checks; the underlying drawer exposes references for every displayed implemented metric and lifecycle event.

## 1. Canonical terms and fields

Use distinct field names. Do not reuse `pnl`, `total`, or `difference` for metrics with different meanings.

| Canonical field | Meaning | Primary source |
| --- | --- | --- |
| `reportedAllAssetsYtdMtm` | IBKR-reported all-assets YTD mark-to-market P&L; the Season P&L source of truth | `Mark-to-Market Performance Summary`, all-assets total row |
| `stockPnl` | Sum of supported stock YTD MTM detail rows | selected YTD performance section |
| `optionPnl` | Sum of supported equity/index-option YTD MTM detail rows after underlying mapping | same |
| `otherPnl` | Sum of every supported, explicitly non-stock/non-option YTD MTM detail row | same |
| `parsedAllAssetsYtdMtm` | `stock + options + other` from parsed detail rows | derived |
| `stockPnl + optionPnl` | Conceptual product-only stock-and-options view; not a separately stored `PortfolioReport` field | derived |
| `statementPeriodTotalPnl` | IBKR's total P/L for the statement period; a NAV diagnostic, not the Season P&L | `Total P/L for Statement Period` |
| `seasonReturn` | IBKR-reported YTD time-weighted rate of return | explicit TWR field in selected YTD, NAV, or Change-in-NAV records |
| `SymbolPnl.totalCurrentUnrealized` | Per-underlying unrealized P&L at report end | `Realized & Unrealized Performance Summary` |
| `SymbolPnl.totalRealizedYtd` | Per-underlying realized explanatory P&L | selected YTD and/or realized/unrealized summary |

Required public labels:

- `reportedAllAssetsYtdMtm`: **Season P&L — IBKR YTD MTM**.
- `stockPnl + optionPnl` conceptual view: **Stock & Options YTD MTM — excludes Other and non-MTM statement items**.
- `SymbolPnl.totalCurrentUnrealized`: **Current unrealized — explanatory only**.
- Self-uploaded results: **Self-Reported** or **Reconciled Self-Reported**, never **Verified**.

## 2. Season P&L and asset buckets

The canonical annual result is:

```text
Season P&L = reportedAllAssetsYtdMtm
```

The parsed-detail reconciliation is:

```text
parsedAllAssetsYtdMtm
  = stockPnl
  + optionPnl
  + otherPnl
```

The broker total remains the displayed Season P&L after reconciliation. The parsed sum is a check and an explanatory breakdown; it must not silently replace a present broker total.

### 2.1 Stocks

- Only rows explicitly classified as stocks, or rows with a missing category whose stock interpretation is proven by a tested IBKR schema, enter `stockPnl`.
- An unrecognized explicit category must never default to stock.
- Stock commissions already reflected in IBKR YTD MTM must not be added again.

### 2.2 Options

- Equity and index options enter `optionPnl`.
- Map an option contract to its underlying before aggregation.
- Prefer a tested relationship from `Financial Instrument Information` (including its `Underlying` field). Do not assume a description, contract symbol, and broker instrument symbol are interchangeable.
- Contract-text parsing is a fallback only. Ambiguous or conflicting mappings produce a warning and must not be guessed.
- `Assignment`, `Exercise`, and `Expiration` are lifecycle events. They do not create an extra P&L entry.

### 2.3 Other

- `otherPnl` includes every supported explicit YTD MTM category that is not stock or option, such as Forex. Explicit labels containing `CFD` are separately regression-tested to remain `Other`, including labels that also contain `Equity` or `Stock`. Futures, bonds, funds, CFD-specific product semantics, and other unsupported categories remain `Other` until separately tested rules exist.
- Do not force an `Other` row into an equity underlying when no valid relationship exists. A currency pair or other instrument may remain its own canonical instrument key.
- Unsupported rows and unmapped amounts must be counted and surfaced. They must never be dropped silently.

### 2.4 Stock-and-options product metric

If the product wants the narrower thesis metric, calculate:

```text
conceptual stock-and-options view
  = stockPnl
  + optionPnl
```

This is a **product-defined metric**, not the IBKR all-assets Season P&L. It excludes Forex and every other non-stock/non-option MTM category. It also does not add standalone statement-period items such as interest or fees. Those items may be relevant to `statementPeriodTotalPnl`, but are not to be appended to this metric.

The UI and any future ranking must keep this metric separate from the all-assets Season P&L. A small icon or footnote is insufficient; the metric name itself must state the scope.

## 3. TWR

- Use only an explicit IBKR YTD `Time Weighted Rate of Return`/`TWR` field.
- Store it as a finite decimal fraction that can cross the Number-based Worker contract without silent precision loss: for example, `16.46%` becomes `0.1646`.
- Do not derive TWR from P&L, beginning NAV, ending NAV, deposits, or withdrawals.
- If multiple candidate TWR fields exist, require them to agree after normalization. Otherwise set TWR to unavailable and raise a conflict warning.
- If the explicit field is absent, display “Unavailable”; do not invent a fallback return.
- TWR ranking and absolute-P&L ranking are separate boards. Capital division is context, not a substitute for a return definition.

## 4. Realized and unrealized values are explanatory

The following is not a valid Season P&L formula:

```text
SymbolPnl.totalRealizedYtd + SymbolPnl.totalCurrentUnrealized
```

It may differ from YTD MTM because current unrealized values can contain gains or losses formed before January 1, and because the statement's performance, cash-flow, income, fee, and currency treatments are not interchangeable.

Rules:

- Show realized and current unrealized values only in an explanation layer.
- Never add current unrealized to YTD MTM.
- Never add gross option premium received to option MTM or realized P&L.
- Never count assignment, exercise, or expiration as a second profit/loss.
- Never infer a missing realized value from trades unless a separately approved accounting model and fixture set exists.
- If the realized/unrealized section is absent, Season P&L may still be available, but the explanation layer must say it is unavailable.

The historical private calibration confirmed this rule without retaining private amounts, account identifiers, instruments, transactions, or exact private-derived structure fingerprints in this repository.

## 5. NAV and statement-period bridge

Deposits, withdrawals, transfers, and changes in account balance are not profit.

At minimum, calculate this diagnostic bridge using signed values as IBKR reports them:

```text
calculatedEndingNav
  = beginningNav
  + netExternalCashFlow
  + statementPeriodTotalPnl
  + nonPnlNavAdjustments

navBridgeDifference
  = reportedEndingNav - calculatedEndingNav
```

`netExternalCashFlow` includes deposits and withdrawals with source signs. `nonPnlNavAdjustments` is allowed only for explicit IBKR bridge rows such as transfers or other named NAV adjustments. Do not use an unnamed balancing plug.

The statement-period profit diagnostic may contain more components than the Season P&L:

```text
statementPeriodTotalPnl
  ~= reportedAllAssetsYtdMtm
   + explicitNonMtmPnlComponents
```

`explicitNonMtmPnlComponents` can include separately reported interest, fees, or other named items according to the actual IBKR bridge. Dividends, withholding tax, commissions, interest, and fees must follow the signs and placement shown by the statement. They must not be added twice merely because they also appear in detail sections.

Required checks:

1. Sum the `Change in NAV` component rows and compare them with the reported NAV change.
2. Reconcile `statementPeriodTotalPnl` to its named component rows.
3. Reconcile beginning NAV, signed external flows, statement-period P/L, named non-P&L adjustments, and ending NAV.
4. Keep all three results distinct from the Season P&L metric.

If a report variant lacks an explicit component, mark that bridge check `NOT_AVAILABLE`; do not assume zero.

## 6. CSV parsing and source provenance

### 6.1 Record model

IBKR CSV sections are heterogeneous. The parser must support:

- repeated headers inside one section;
- more than one header shape in the same section;
- `Data`, `SubTotal`, and `Total` rows as distinct record types;
- a tested section-specific record whose record-type cell is empty;
- row widths that differ between sections;
- commas, parentheses, signs, field-specific percentages, blanks, and dash placeholders;
- repeated `Header` records without treating them as transactions.

Header state is scoped to the raw source-section identity. A later header in the same section replaces the active schema only for subsequent rows, and each stored record retains that header's technical signature.

Recognized amount columns are unitless. TWR/return fields use a separate percentage parser, and currency comes from a separate validated three-letter field. A row containing duplicate recognized amount or identity columns is ambiguous and must be blocked even when the values appear to agree. A raw name such as `YTD MTM2` is not a generated duplicate suffix and must not impersonate `YTD MTM`.

### 6.2 Source reference contract

Displayed portfolio metrics, reconciliation checks, underlying metrics, and lifecycle events carry local `SourceRef` objects. `ParserDiagnostic` warnings are fixed codes (with only tightly controlled parameters where defined) and do not themselves contain `SourceRef` arrays.

```text
SourceRef {
  source: "csv" | "pdf"
  section: string
  recordType?: string
  rowNumber?: number       // one-based CSV row
  pageNumber?: number      // one-based PDF page
  headerSignature?: string
  field: string
}
```

`section` and `field` are normalized technical aliases, not original CSV codes, BOS descriptions, or raw header text. The raw source token may remain only in ephemeral parser memory; it must not be sent to telemetry or persisted in a public record. Account identifiers, names, filenames, transaction IDs, and full financial rows must never appear in logs.

For a sum, retain the contributing row references or a deterministic local range/set reference. A source drawer must be able to answer “which local rows produced this number?” without exposing those rows outside the user's device.

### 6.3 Source priority

1. Exactly one supported YTD performance source (`Mark-to-Market`, Month/YTD, or an explicitly registered equivalent/code): Season P&L, asset-class totals, instrument/underlying detail.
2. Explicit TWR field: Season Return.
3. `Realized & Unrealized Performance Summary`: explanation only.
4. `Net Asset Value`, `Change in NAV`, `Total P/L for Statement Period`, cash-flow, income, tax, interest, and fee sections: bridge diagnostics.
5. `Trades`, `Open Positions`, and `Financial Instrument Information`: lifecycle, mapping, and supporting diagnostics; not a substitute MTM calculation.

Known section codes are mapped only by the hard-coded allowlist. BOS descriptions are non-authoritative metadata and are ignored; an unknown code cannot inherit meaning from a plausible BOS description. Do not fall back from a missing all-assets YTD MTM total to trade cash flows, current unrealized, ending-minus-beginning NAV, or statement-period total P/L.

Checkpoint 0.9 accepts one supported YTD performance source per file. If MTM and Month/YTD summaries coexist, reject the file with an ambiguity diagnostic rather than adding them or selecting by row order. This is a temporary compatibility boundary: supporting both requires a representative mixed-schema fixture, canonical underlying-level aggregation, and an equivalence check across their different row granularities.

## 7. Precision and rounding

- Parse only grammar-valid numeric tokens into finite JavaScript numbers that retain their value across the Worker boundary; the normalized report does not retain the original token or its trailing decimal scale.
- Sum unrounded values. Never round each row before aggregation.
- Use decimal-safe arithmetic for accounting checks. Binary floating-point noise must not change a status.
- Reject an input or aggregate that cannot be represented at its parsed decimal scale without silent value change. Round accepted values only for display.
- Store TWR as an accepted decimal fraction; the original token/scale is not retained. Round only its displayed percentage.
- Use the statement's base currency for portfolio totals. Do not add raw amounts from different currencies without an IBKR-provided base-currency value.
- For currencies supported by the MVP, use their correct display minor unit; the current USD fixture displays two decimals.

Tolerance classes:

| Check | Pass rule |
| --- | --- |
| CSV accounting equation | fixed `abs(diff) <= 0.000001` base-currency unit |
| Direct PDF aggregate vs CSV | compare PDF value with CSV rounded to the PDF field's visible scale; values must match at that scale |
| Sum of multiple PDF-displayed rows | tolerance may be at most `rowCount * 0.5 * 10^-displayScale`; record that tolerance explicitly |
| Metadata/account/period/currency | exact normalized match; no numeric tolerance |

Do not use a percentage-of-total tolerance to conceal a material dollar difference. A warning threshold is not permission to publish a mismatched ranking value.

## 8. Difference directions and statuses

Never expose an unsigned field named only `difference`. Use these formulas:

```text
mtmReconciliationDifference
  = reportedAllAssetsYtdMtm - parsedAllAssetsYtdMtm

navBridgeDifference
  = reportedEndingNav - calculatedEndingNav

csvPdfFieldDifference
  = pdfDisplayedValue - round(csvExactValue, pdfDisplayScale)
The sign therefore means “reported/observed source minus calculated/expected value.” Tests must assert both magnitude and sign.

Canonical statuses:

| Status | Meaning | Ranking eligibility |
| --- | --- | --- |
| `PASS_EXACT` | Full-precision values agree within the CSV epsilon | eligible on the applicable Self-Reported tier |
| `PASS_ROUNDED` | PDF agrees with the correctly rounded CSV value | supporting evidence only |
| `WARNING` | Values exist but differ beyond tolerance, unsupported rows exist, or a non-critical explanation is missing | not eligible until resolved |
| `BLOCKED` | Wrong period, multiple accounts, account/period mismatch, missing Season P&L source, ambiguous schema, or incomplete mandatory data | not eligible and no canonical result published |
| `NOT_AVAILABLE` | The source does not provide an optional check | never describe as passed |

Every check result contains `status`, `reasonCode`, and `sourceRefs`; numeric values, difference, and tolerance are present only when the check has the corresponding evidence.

Checkpoint 0.3 has removed the legacy opposite-direction field from the parser contract. The implemented field is `mtmReconciliationDifference`, and both implementation and signed regression tests now use `reportedAllAssetsYtdMtm - parsedAllAssetsYtdMtm`.

## 9. CSV-to-PDF reconciliation

The CSV is the primary machine-readable input. The PDF is optional, secondary evidence for human-visible cross-checking.

Required cross-checks when a PDF is supplied:

1. Statement type and period.
2. Account identifier, compared only in ephemeral local memory and never logged or persisted in raw form.
3. Base currency.
4. Generation time when both files expose it. A close time supports same-export-batch plausibility but is not proof of origin.
5. All-assets YTD MTM.
6. Statement-period total P/L.
7. Realized and current-unrealized summary totals.
8. TWR.
9. NAV bridge endpoints and named totals.
10. Instrument coverage/counts when reliably extractable, without persisting private instrument lists.

For financial fields, compare the PDF number with the CSV number rounded to the exact visible PDF scale. A full-precision CSV value and a two-decimal PDF display are consistent when the rounded values match.

Outcomes:

- CSV accepted without PDF: `Self-Reported`.
- CSV and PDF pass mandatory cross-checks: `Reconciled Self-Reported`.
- Any mandatory account/period mismatch: `BLOCKED`.
- A PDF-only import, if added later, is low-confidence preview data and is not ranking-eligible.
- Neither file hashes nor CSV/PDF agreement proves that IBKR created the files. Only a future approved direct broker source may be called `Broker-Sourced` or `Verified`.

## 10. Test matrix

All accounting changes require a redacted or synthetic fixture. Tests must assert value, source references, difference direction, status, warnings, and whether ranking is allowed.

| ID | Fixture/condition | Expected result |
| --- | --- | --- |
| M01 | English, one-account, Jan 1 to current YTD | metadata accepted |
| M02 | Monthly, quarterly, or custom start date | `BLOCKED` |
| M03 | Prior/future season or end date after current date | `BLOCKED` |
| M04 | Multiple account identifiers | `BLOCKED` |
| M05 | Newer YTD snapshot | replaces older snapshot; never sums |
| M06 | Older or identical snapshot | older cannot overwrite; identical is duplicate |
| S01 | Repeated headers and two header shapes in one section | each data row uses the correct active schema |
| S02 | Three trade header variants | no row shifted; totals are not treated as trades |
| S03 | Empty record-type cell in the known total-P/L section | parsed only by the tested section rule |
| S04 | Duplicate header rows | ignored as headers, not flagged as duplicate transactions |
| S05 | Parentheses, commas, negative sign, blank, dash; percent only in a return field | parsed without sign or scale loss |
| S06 | Generic/partial section name such as `Summary` | cannot impersonate a registered accounting section |
| S07 | Currency wrapper, embedded letters, exponent notation, loose spaces, malformed grouping/parentheses, or empty currency marker in an amount field | rejected as non-numeric; never rewritten into another amount |
| S08 | Duplicate recognized amount or Symbol/asset columns, in either order | `BLOCKED`; never first-column wins |
| S09 | Raw unregistered header ending in a digit | cannot impersonate a known field |
| S10 | Exact/synonym duplicate accounting section or conflicting section-code pair | `BLOCKED`; never merged or double-counted |
| S11 | MTM and Month/YTD sources coexist | checkpoint 0.9 `BLOCKED`; cross-schema equivalence remains future work |
| S12 | Statement, Account Information, or BOF periods disagree | `BLOCKED`; never source-order wins |
| S13 | Decimal cancellation or aggregate cannot cross the Number-based output contract exactly | decimal-safe result or `BLOCKED`; never binary-drift pass |
| S14 | Malformed/mismatching realized, unrealized, NAV, or base-cash broker total | `BLOCKED`; never ignored as an unused subtotal |
| S15 | Required accounting token is blank, `-`, or `--`, while surrounding totals are coherently altered | `BLOCKED`; missing is never zero |
| S16 | A repeated-header block loses a required total/identity/component alias, or a complete MTM/realized/unrealized component set does not equal its row total | `BLOCKED`; never drop the affected asset block. A section-wide current Flex MTMP schema without retired `Other` remains valid and is tested separately |
| S17 | A present horizontal/vertical Cash Report lacks exactly one readable base-currency Ending Cash, has no data, or NAV cash and that ending cash disagree | `BLOCKED`; never let missing/drifted fields or source priority bypass the comparison |
| S18 | NAV long + short differs from current total, prior + change differs from current, or detail rows do not sum to the broker Total | `BLOCKED`; never publish a self-inconsistent NAV/cash value |
| S19 | NAV contains both `Cash` and `SLB Cash Collateral`, or only the collateral field | Match ordinary `Cash` exactly; collateral participates in NAV totals but is never published as available cash |
| S20 | Current Flex NAV arrives as one wide `EQUT`/`EQUS`/NAV Summary record | Require one unambiguous full-field account-level record, the complete registered asset column set, numeric `Cash` and `Total`, exact component closure to `Total`, agreement of any Account ID/Report Date with statement metadata, and an absent/empty Model; partial field selection and model slices fail closed |
| S21 | A critical section ends with a Header that has no following Data/SubTotal/Total row | `BLOCKED` as a truncated/incomplete block; never let an earlier valid block hide the dangling header |
| A01 | Stocks + options + Forex | Forex remains `Other`; all three buckets reconcile |
| A02 | Explicit unknown asset category | never defaults to stock; `WARNING` or `BLOCKED` by materiality |
| A03 | Option mapped by Financial Instrument Information | joins to the correct underlying with source refs |
| A04 | Conflicting/missing option mapping | no guess; amount and contract surfaced as unresolved |
| A05 | Explicit `Equity CFD` or `Stock CFD` category | remains `Other`; never enters stock MTM |
| P01 | Detail rows exactly equal all-assets total | `PASS_EXACT`, zero signed difference |
| P02 | Broker total exceeds parsed sum | positive `mtmReconciliationDifference` |
| P03 | Parsed sum exceeds broker total | negative `mtmReconciliationDifference` |
| P04 | Realized + current unrealized differs from YTD MTM | Season P&L unchanged; explanation shown |
| P05 | Large deposit/withdrawal with unchanged performance | cash flow never enters Season P&L |
| P06 | Interest/fees reconcile statement P/L but not all-assets MTM | NAV bridge passes; Season P&L unchanged |
| P07 | Non-zero `Other` | included in all-assets parsed reconciliation; stock-and-options metric visibly excludes it |
| P08 | Closed CFD/Other has realized P&L but zero YTD MTM/current unrealized/events | instrument and realized explanation retained |
| N01 | Beginning NAV + flows + P/L + named adjustments = ending NAV | `PASS_EXACT` |
| N02 | Required bridge component missing | `NOT_AVAILABLE` or `WARNING`, never assumed zero |
| E01 | `A` and combined `A;P` | assignment event, no extra P&L |
| E02 | `Ex` | exercise event, no extra P&L |
| E03 | `Ep` | expiration event, no extra P&L |
| E04 | no lifecycle rows | explanation warning only; no fabricated event |
| X01 | CSV and PDF metadata plus rounded totals agree | `Reconciled Self-Reported`; never `Verified` |
| X02 | PDF value equals rounded CSV but not CSV full precision | `PASS_ROUNDED` |
| X03 | Account or period differs | `BLOCKED` |
| X04 | PDF total differs beyond its visible-scale tolerance | `WARNING`, not ranking-eligible |
| Q01 | Source drawer requested for a displayed metric | contributing local rows/pages are traceable |
| Q02 | Logs/telemetry inspected | no filename, account ID, name, symbol list, raw row, amount, or transaction ID |

## 11. Private-calibration boundary and gaps

One private 2026 English single-account YTD CSV/PDF pair was historically inspected read-only. The original files and exact private-derived structure fingerprints (row/page/section/transaction/instrument counts or lists) must remain outside fixtures, source control, logs, and documentation. Repository evidence comes from fully fictional fixtures. The final checkpoint 0.9 private rerun recorded only that all three reconciliation checks passed exactly and the source hash was unchanged, never private content.

The historical calibration covered heterogeneous headers, multiple accounting/supporting categories, option-underlying mapping, and assignment/expiration examples. Its key CSV/PDF relationships reconciled at the applicable precision, but consistency is not authenticity and exercise was not observed.

Known gaps that require additional synthetic or separately redacted fixtures:

- exercise events;
- futures, bonds, funds, CFD-specific product semantics beyond the tested `Other` routing, and other unsupported asset classes;
- conflicting/missing option-underlying relationships;
- multi-account and consolidated statements from actual IBKR exports;
- non-USD base currencies and currencies with non-two-decimal display rules;
- changed English IBKR templates and field aliases;
- image-only, encrypted, malformed, very large, and hostile PDFs;
- prior-season, leap-year, year-end, and future-date boundaries;
- corporate actions and transfers that affect the NAV bridge;
- cases where PDF tables split or round component rows differently;
- direct broker-sourced provenance, which is not part of the MVP.

## 12. Release gate

A build must not publish or rank a canonical Season P&L unless all of the following are true:

1. Metadata is valid for one current-year YTD account.
2. The explicit all-assets YTD MTM source row exists.
3. Asset detail is classified without silently dropped material rows.
4. `mtmReconciliationDifference` is `PASS_EXACT`.
5. Every displayed accounting value has source references.
6. Realized, unrealized, cash-flow, interest, fee, and lifecycle fields remain explanatory and are not double-counted.
7. The result is labelled with its true source tier.

PDF cross-checking can elevate `Self-Reported` to `Reconciled Self-Reported`; it is not required for a local ledger preview and can never by itself produce `Verified`.

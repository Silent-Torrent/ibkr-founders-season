# Accounting and reconciliation specification

Status: **locked implementation contract for the 2026 Founders Season MVP**
Scope: one English IBKR Activity Statement CSV, one account, current calendar-year YTD
Priority: when UI copy, legacy code, or a synthetic fixture conflicts with this document, stop and resolve the conflict before publishing a result.

This document defines what the product may calculate, what it may only explain, how every value must be traced to source rows, and when a result is safe to display or rank. It does not turn a user-uploaded file into broker-verified data.

Implementation checkpoint 0.3 uses the canonical MTM field names and difference direction in this document, fixes the CSV epsilon at `0.000001`, and implements the MTM, statement-period P/L, and NAV-bridge checks with local `SourceRef` provenance. The Ledger exposes expandable references for major portfolio metrics and these three checks. A complete per-value source drawer for every underlying-level UI number remains a separate UI task.

## 1. Canonical terms and fields

Use distinct field names. Do not reuse `pnl`, `total`, or `difference` for metrics with different meanings.

| Canonical field | Meaning | Primary source |
| --- | --- | --- |
| `reportedAllAssetsYtdMtm` | IBKR-reported all-assets YTD mark-to-market P&L; the Season P&L source of truth | `Mark-to-Market Performance Summary`, all-assets total row |
| `parsedStockYtdMtm` | Sum of supported stock YTD MTM detail rows | `Mark-to-Market Performance Summary` |
| `parsedOptionYtdMtm` | Sum of supported equity/index-option YTD MTM detail rows after underlying mapping | same |
| `parsedOtherYtdMtm` | Sum of every supported, explicitly non-stock/non-option YTD MTM detail row | same |
| `parsedAllAssetsYtdMtm` | `stock + options + other` from parsed detail rows | derived |
| `stockOptionsProductYtdMtm` | Product-only stock-and-options metric; never the all-assets Season P&L | derived |
| `statementPeriodTotalPnl` | IBKR's total P/L for the statement period; a NAV diagnostic, not the Season P&L | `Total P/L for Statement Period` |
| `seasonTwr` | IBKR-reported YTD time-weighted rate of return | explicit TWR field in `Net Asset Value` or `Change in NAV` |
| `currentUnrealizedPnl` | Unrealized P&L at report end | `Realized & Unrealized Performance Summary` |
| `reportedRealizedPnl` | Realized P&L reported for the statement period | same |

Required public labels:

- `reportedAllAssetsYtdMtm`: **Season P&L — IBKR YTD MTM**.
- `stockOptionsProductYtdMtm`: **Stock & Options YTD MTM — excludes Other and non-MTM statement items**.
- `currentUnrealizedPnl`: **Current unrealized — explanatory only**.
- Self-uploaded results: **Self-Reported** or **Reconciled Self-Reported**, never **Verified**.

## 2. Season P&L and asset buckets

The canonical annual result is:

```text
Season P&L = reportedAllAssetsYtdMtm
```

The parsed-detail reconciliation is:

```text
parsedAllAssetsYtdMtm
  = parsedStockYtdMtm
  + parsedOptionYtdMtm
  + parsedOtherYtdMtm
```

The broker total remains the displayed Season P&L after reconciliation. The parsed sum is a check and an explanatory breakdown; it must not silently replace a present broker total.

### 2.1 Stocks

- Only rows explicitly classified as stocks, or rows with a missing category whose stock interpretation is proven by a tested IBKR schema, enter `parsedStockYtdMtm`.
- An unrecognized explicit category must never default to stock.
- Stock commissions already reflected in IBKR YTD MTM must not be added again.

### 2.2 Options

- Equity and index options enter `parsedOptionYtdMtm`.
- Map an option contract to its underlying before aggregation.
- Prefer a tested relationship from `Financial Instrument Information` (including its `Underlying` field). In the current private audit sample, option descriptions used by `Trades` and `Open Positions` mapped to that section's `Description`; they were not guaranteed to equal its `Symbol`.
- Contract-text parsing is a fallback only. Ambiguous or conflicting mappings produce a warning and must not be guessed.
- `Assignment`, `Exercise`, and `Expiration` are lifecycle events. They do not create an extra P&L entry.

### 2.3 Other

- `parsedOtherYtdMtm` includes every supported explicit YTD MTM category that is not stock or option, such as Forex. Future categories such as futures, bonds, funds, or CFDs remain `Other` until a separately tested rule exists.
- Do not force an `Other` row into an equity underlying when no valid relationship exists. A currency pair or other instrument may remain its own canonical instrument key.
- Unsupported rows and unmapped amounts must be counted and surfaced. They must never be dropped silently.

### 2.4 Stock-and-options product metric

If the product wants the narrower thesis metric, calculate:

```text
stockOptionsProductYtdMtm
  = parsedStockYtdMtm
  + parsedOptionYtdMtm
```

This is a **product-defined metric**, not the IBKR all-assets Season P&L. It excludes Forex and every other non-stock/non-option MTM category. It also does not add standalone statement-period items such as interest or fees. Those items may be relevant to `statementPeriodTotalPnl`, but are not to be appended to this metric.

The UI and any future ranking must keep this metric separate from the all-assets Season P&L. A small icon or footnote is insufficient; the metric name itself must state the scope.

## 3. TWR

- Use only an explicit IBKR YTD `Time Weighted Rate of Return`/`TWR` field.
- Store it as a decimal fraction at source precision: for example, `16.46%` becomes `0.1646`.
- Do not derive TWR from P&L, beginning NAV, ending NAV, deposits, or withdrawals.
- If multiple candidate TWR fields exist, require them to agree after normalization. Otherwise set TWR to unavailable and raise a conflict warning.
- If the explicit field is absent, display “Unavailable”; do not invent a fallback return.
- TWR ranking and absolute-P&L ranking are separate boards. Capital division is context, not a substitute for a return definition.

## 4. Realized and unrealized values are explanatory

The following is not a valid Season P&L formula:

```text
reportedRealizedPnl + currentUnrealizedPnl
```

It may differ from YTD MTM because current unrealized values can contain gains or losses formed before January 1, and because the statement's performance, cash-flow, income, fee, and currency treatments are not interchangeable.

Rules:

- Show realized and current unrealized values only in an explanation layer.
- Never add current unrealized to YTD MTM.
- Never add gross option premium received to option MTM or realized P&L.
- Never count assignment, exercise, or expiration as a second profit/loss.
- Never infer a missing realized value from trades unless a separately approved accounting model and fixture set exists.
- If the realized/unrealized section is absent, Season P&L may still be available, but the explanation layer must say it is unavailable.

The current private sample confirms this rule: its all-assets YTD MTM and its realized-plus-current-unrealized total were both internally valid but different. No private amount, account identifier, instrument, or transaction is retained in this repository.

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
- commas, parentheses, signs, percentages, blanks, and dash placeholders;
- exact duplicate headers without treating them as duplicate transactions.

Header state is scoped to the current section and header signature. A later header in the same section replaces the active schema only for subsequent rows of that shape. Do not keep one global “last header per section” when multiple shapes occur.

### 6.2 Source reference contract

Every derived metric and every warning must carry one or more local `SourceRef` objects:

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

The raw source token may remain in ephemeral parser memory for diagnostics, but must not be sent to telemetry or persisted in a public record. Account identifiers, names, filenames, transaction IDs, and full financial rows must never appear in logs.

For a sum, retain the contributing row references or a deterministic local range/set reference. A source drawer must be able to answer “which local rows produced this number?” without exposing those rows outside the user's device.

### 6.3 Source priority

1. `Mark-to-Market Performance Summary`: Season P&L, asset-class totals, instrument/underlying detail.
2. Explicit TWR field: Season Return.
3. `Realized & Unrealized Performance Summary`: explanation only.
4. `Net Asset Value`, `Change in NAV`, `Total P/L for Statement Period`, cash-flow, income, tax, interest, and fee sections: bridge diagnostics.
5. `Trades`, `Open Positions`, and `Financial Instrument Information`: lifecycle, mapping, and supporting diagnostics; not a substitute MTM calculation.

Do not fall back from a missing all-assets YTD MTM total to trade cash flows, current unrealized, ending-minus-beginning NAV, or statement-period total P/L.

## 7. Precision and rounding

- Preserve every original numeric token and its decimal scale locally.
- Sum unrounded values. Never round each row before aggregation.
- Use decimal-safe arithmetic for accounting checks. Binary floating-point noise must not change a status.
- Store money at the maximum precision supplied by the CSV. Round only for display.
- Store TWR as a decimal fraction at source precision; round only its displayed percentage.
- Use the statement's base currency for portfolio totals. Do not add raw amounts from different currencies without an IBKR-provided base-currency value.
- For currencies supported by the MVP, use their correct display minor unit; the current USD fixture displays two decimals.

Tolerance classes:

| Check | Pass rule |
| --- | --- |
| CSV full-precision equation | `abs(diff) <= 0.000001` base-currency unit, unless the source precision implies a smaller exact quantum |
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
```

The sign therefore means “reported/observed source minus calculated/expected value.” Tests must assert both magnitude and sign.

Canonical statuses:

| Status | Meaning | Ranking eligibility |
| --- | --- | --- |
| `PASS_EXACT` | Full-precision values agree within the CSV epsilon | eligible on the applicable Self-Reported tier |
| `PASS_ROUNDED` | PDF agrees with the correctly rounded CSV value | supporting evidence only |
| `WARNING` | Values exist but differ beyond tolerance, unsupported rows exist, or a non-critical explanation is missing | not eligible until resolved |
| `BLOCKED` | Wrong period, multiple accounts, account/period mismatch, missing Season P&L source, ambiguous schema, or incomplete mandatory data | not eligible and no canonical result published |
| `NOT_AVAILABLE` | The source does not provide an optional check | never describe as passed |

Every check result contains `status`, exact `difference`, exact `tolerance`, `reasonCode`, and `sourceRefs`.

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
| S05 | Parentheses, commas, negative sign, percent, blank, dash | parsed without sign or scale loss |
| A01 | Stocks + options + Forex | Forex remains `Other`; all three buckets reconcile |
| A02 | Explicit unknown asset category | never defaults to stock; `WARNING` or `BLOCKED` by materiality |
| A03 | Option mapped by Financial Instrument Information | joins to the correct underlying with source refs |
| A04 | Conflicting/missing option mapping | no guess; amount and contract surfaced as unresolved |
| P01 | Detail rows exactly equal all-assets total | `PASS_EXACT`, zero signed difference |
| P02 | Broker total exceeds parsed sum | positive `mtmReconciliationDifference` |
| P03 | Parsed sum exceeds broker total | negative `mtmReconciliationDifference` |
| P04 | Realized + current unrealized differs from YTD MTM | Season P&L unchanged; explanation shown |
| P05 | Large deposit/withdrawal with unchanged performance | cash flow never enters Season P&L |
| P06 | Interest/fees reconcile statement P/L but not all-assets MTM | NAV bridge passes; Season P&L unchanged |
| P07 | Non-zero `Other` | included in all-assets parsed reconciliation; stock-and-options metric visibly excludes it |
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

## 11. Current private-sample coverage and gaps

The 2026 private audit sample was inspected read-only. The original files must remain outside fixtures, source control, logs, and documentation.

Coverage confirmed without retaining private financial content:

- CSV: 965 rows, 26 sections, heterogeneous row widths.
- PDF: 27 pages, text-based and visually inspected across all pages.
- Repeated and multiple header shapes occurred in NAV, open-position, trade, and financial-instrument sections.
- The trade section had three header variants and 195 data records spanning stocks, options, and Forex.
- Financial Instrument Information had 52 records, including 24 option records with an `Underlying` value.
- The sample covered multiple currencies, dividends, withholding tax, interest/accruals, fees, deposits/withdrawals, stock lending, open positions, and cash reporting.
- Assignment (`A`) and expiration (`Ep`) lifecycle codes occurred. No exercise (`Ex`) event occurred.
- CSV/PDF account, period, generation batch, TWR, all-assets YTD MTM, statement-period P/L, realized/unrealized totals, and NAV bridge reconciled at their applicable precision.
- The current read-only parser verification returned `PASS_EXACT` for the MTM, statement-period P/L, and NAV-bridge diagnostics without writing private source content into the repository.
- Two exact duplicate rows were repeated headers, not duplicate transactions.
- The PDF had no digital signature; successful reconciliation therefore established consistency, not authenticity.

Known gaps that require additional synthetic or separately redacted fixtures:

- exercise events;
- futures, bonds, funds, CFDs, and other unsupported asset classes;
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

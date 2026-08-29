# IBKR current-schema synthetic fixture

`ibkr-current-schema-synthetic.csv` is a repository-safe regression fixture for the frozen 2026 MVP import contract. It is **not** an IBKR statement, an anonymized customer statement, or evidence of brokerage activity.

## Privacy and provenance

- Every account label, name, identifier, instrument, transaction, date, quantity, price and monetary amount was invented specifically for this fixture.
- No row was copied, transformed, rounded or sampled from the private calibration CSV or PDF.
- The symbols `ZZFICTA`, `ZZFICTB`, `ZZFICTC`, the test-currency pair `XTS.USD`, and every `SYNTH-*` identifier are fixture-only labels.
- This file must always be treated as `Demo`/test data. It cannot be labelled `Self-Reported`, `Reconciled Self-Reported`, `Broker-Sourced` or `Verified`.

## Schema coverage

The fixture deliberately includes the current English, one-account, calendar-year YTD Activity Statement patterns that are easy to regress:

- 26 logical sections with heterogeneous row widths;
- exact repeated headers;
- two header shapes in `Net Asset Value`, `Open Positions`, and `Financial Instrument Information`;
- three header shapes in `Trades`;
- `Data`, `SubTotal`, and `Total` record types;
- the observed MTM field names `Mark-to-Market P/L Position`, `Transaction`, `Commissions`, `Other`, and `Total`;
- asset-class MTM summaries represented as `Data` rows with `Asset Category=Total`, whose Stocks/Options/Forex meaning comes from the immediately preceding category context;
- a single 14-column `Total P/L for Statement Period` row with an empty record-type cell and only column 13 (`Mark-to-Market P/L Total`, zero-based index 12) populated after the section name; it intentionally borrows the preceding MTM header and has no section-specific header;
- commas, parentheses, a negative sign, a percentage, blanks, and a dash placeholder;
- Stocks, Equity and Index Options, Forex, and `Total (All Assets)` MTM rows;
- the two named MTM-following statement items `Broker Interest Paid and Received` and `Other Fees` before the bare Total P/L row;
- option descriptions that must map through `Financial Instrument Information.Description` to `Underlying`;
- assignment code `A` and expiration code `Ep` in `Trades`;
- base-currency summary and aggregate rows in deposits, dividends, withholding tax, and interest;
- a Fees `Subtitle` column with a `Subtitle=Total` aggregate, and a Withholding Tax `Code` column;
- the `Interest Accruals` field-value layout and the complex `Change in Dividend Accruals` layout whose starting/total/ending labels are in `Asset Category` and values are in `Net Amount`;
- cash, open-position, lending, collateral, and code sections.

There is intentionally **no exercise (`Ex`) event**. The fixture validates assignment and expiration structure only; it must not be cited as exercise coverage.

## Expected accounting values

All amounts are in USD and retain six decimal places unless a source field uses a different scale.

### Season P&L and MTM buckets

```text
parsedStockYtdMtm
  = 208.863355 + (-41.240878)
  = 167.622477

parsedOptionYtdMtm
  = 354.777778 + 95.444445
  = 450.222223

parsedOtherYtdMtm
  = 122.278756

parsedAllAssetsYtdMtm
  = 167.622477 + 450.222223 + 122.278756
  = 740.123456

reportedAllAssetsYtdMtm
  = 740.123456

mtmReconciliationDifference
  = reportedAllAssetsYtdMtm - parsedAllAssetsYtdMtm
  = 0.000000

stockOptionsProductYtdMtm
  = 167.622477 + 450.222223
  = 617.844700
```

The all-assets component check is independently closed:

```text
Position P/L     640.956111
Transaction P/L  101.387347
Commissions      -14.620002
Other             12.400000
--------------------------------
All-assets MTM    740.123456
```

The statement-level lines immediately following `Total (All Assets)` are separate named items, not asset-class detail:

```text
All-assets MTM                    740.123456
Broker Interest Paid and Received 12.340001
Other Fees                        -2.220002
------------------------------------------------
Total P/L for Statement Period   750.243455
```

### Statement-period P/L and NAV bridge

`Mark-to-Market` in `Change in NAV` is the position-plus-transaction amount before the separately named commissions, dividend/tax and non-MTM statement components.

```text
Change-in-NAV performance components
  = 742.343458                 Mark-to-Market
    + 15.500000                Dividends
    -  3.100000                Withholding Tax
    + 12.340001                Interest
    +  1.111111                Change in Interest Accruals
    -  2.220002                Other Fees
    - 14.620002                Commissions
    -  1.111111                Other FX Translations
  = 750.243455

statementPeriodTotalPnl
  = reportedAllAssetsYtdMtm
    + Broker Interest Paid and Received
    + Other Fees
  = 740.123456 + 12.340001 - 2.220002
  = 750.243455

calculatedEndingNav
  = beginningNav + netExternalCashFlow + statementPeriodTotalPnl
  = 25000.125000 + 8000.000000 + 750.243455
  = 33750.368455

navBridgeDifference
  = reportedEndingNav - calculatedEndingNav
  = 33750.368455 - 33750.368455
  = 0.000000
```

The deposit is an external cash flow and is never part of Season P&L.

The interest-accrual bridge is also exact:

```text
Ending Accrual Balance
  = Starting Accrual Balance
    + Interest Accrued
    + Accrual Reversal
    + FX Translation
  = 0.000000 + 1.111111 + 0.000000 + 0.000000
  = 1.111111
```

`Change in Interest Accruals` and `Other FX Translations` are separate Change-in-NAV rows and happen to offset in this fixture. They must still be parsed and traced independently.

### Aggregate-row de-duplication

The deposits, dividends, withholding-tax and interest sections contain both detail and aggregate presentation rows. These are alternate views of the same amount, not additive transactions.

In particular, the Interest section contains all four of the following appearances of `12.340001`:

1. one USD detail row;
2. `Total` in the source currency;
3. `Total in USD` after conversion;
4. the final base-currency `Total Interest in USD`.

The canonical interest amount is `12.340001` exactly once. A parser must select the correct aggregate scope or de-duplicate it; summing the four appearances to `49.360004` is an error. The same rule applies to the other base-currency summary sections and to the Fees `Subtitle=Total` row.

The Change in Dividend Accruals section has starting, total and ending `Net Amount` values of `0.000000`. Its shape is covered, but it contributes no P/L or NAV change in this fixture.

### Realized and current unrealized explanation

```text
reportedRealizedPnl        = 411.212120
currentUnrealizedPnl       =  95.515152
realizedPlusUnrealized     = 506.727272

reportedAllAssetsYtdMtm    = 740.123456
```

The two valid totals intentionally differ by `233.396184`. This is a regression guard against adding current unrealized P/L to YTD MTM or replacing the Season P&L with realized-plus-unrealized.

### TWR and lifecycle events

- Explicit statement TWR: `7.654321%`, stored canonically as `0.07654321`; it is not derived from NAV or cash flow.
- Assignment events: `1`.
- Expiration events: `1`.
- Exercise events: `0` — intentional coverage gap.

## Expected status

- Metadata: accepted as one English 2026 YTD account.
- MTM reconciliation: `PASS_EXACT` with signed difference `0.000000` and CSV tolerance no greater than `0.000001`.
- NAV bridge: `PASS_EXACT` with signed difference `0.000000`.
- UI source label: `Fully Synthetic Test` / `全虚构测试` / `全虛構測試` when the normalized SHA-256 digest matches this exact repository fixture.
- Ranking source tier: fixture/demo only; never Self-Reported and never a user ranking or local-achievement record.

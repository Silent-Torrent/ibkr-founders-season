# Option exercise evidence review — 2026-08-30

## Question

Can the missing exercise-event regression be closed from public IBKR documentation without using or inventing a private user's exercise record?

## Confirmed from official IBKR material

- IBKR's reporting guide defines the **Option Exercises, Assignments and Expirations** statement section and says it includes exercise, assignment and expiration activity. It documents `Symbol`, `Date/Time`, and `Transaction Type`, with the transaction type shown as `Assignment`, `Exercise`, or `Expiration`: <https://www.ibkrguides.com/reportingreference/reportguide/optionexercies_assignments_expirations_default.htm>
- IBKR's official code table defines `A` as Assignment, `Ex` as Exercise, and `Ep` as Resulted from an Expired Position: <https://www.ibkrguides.com/reportingreference/reportguide/codestradeconfirm.htm>
- IBKR's public Activity Statement sample index explicitly says its samples are HTML, not CSV: <https://www.ibkrguides.com/reportingreference/reportguide/activity%20statement%20samples.htm>

These sources confirm the event meanings and the statement section's human-readable fields. The `Ex` code page is specifically a Trade Confirmation reference; it does not prove that an Activity Statement CSV will use that code. None of the sources contains a completed exercise row in an English Activity Statement CSV.

## Decision

Keep the exercise item open. Do not relabel the bundled invented exercise row, change an `Ep` row to `Ex`, or construct a new CSV row and call it independently proven. That would test our own assumption rather than the broker's actual CSV serialization.

## Evidence required to close the item

Use either:

1. an official IBKR CSV/Flex schema or sample that shows the exact completed-exercise section, headers, record types, and row values; or
2. a real English, single-account Activity Statement CSV containing an exercise, inspected locally and read-only, followed by a separate fully fictional regression fixture based only on the confirmed shape.

The closing regression must verify event type, date, option contract, underlying mapping, source references, and that lifecycle detection does not add P&L a second time. No private row, account, symbol, amount, or filename may enter the repository.

## 2026-09-24 official-source follow-up

The [IBKR Flex reporting reference](https://www.ibkrguides.com/reportingreference/reportguide/options_exercises_expirations_fq.htm) confirms that the corresponding section groups assignments, exercises and expirations, then currency and option contract. It describes `Date`, `Transaction Type`, option and underlying identifiers, quantity, prices, proceeds and trade ID. Its field list contains two entries named `Symbol`; it is a field reference, not a completed CSV data row or a unique column-order contract. The [default Activity Statement reference](https://www.ibkrguides.com/reportingreference/reportguide/optionexercies_assignments_expirations_default.htm) similarly documents event meaning and display fields. [IBKR's Flex delivery guide](https://www.ibkrguides.com/reportingreference/reportguide/delivery%20configuration%20and%20general%20configuration.htm) says CSV is a selectable output format and describes optional header/trailer records, so the reference pages alone do not establish the exported row shape for this MVP importer.

No official completed-exercise Activity Statement CSV or Activity Flex CSV row was found in this bounded review. F01 remains **OPEN**. The next useful evidence is an English, single-account IBKR export from a period with a completed exercise: inspect only the exact section/header and one or two qualifying rows locally and read-only, then make a wholly fictional regression based on the confirmed shape. Do not confuse `Ex` in a different code list, `Ex Date`, or a pending exercise with a completed exercise row.

## 2026-09-25 additional code-table boundary

The [official IBKR Reporting Guide code table](https://www.ibkrguides.com/reportingreference/reportguide/codes_realized.htm) also lists `AEx` (automatic dividend-related exercise), `MEx` (manual dividend-related exercise), and `GEA` (expiration **or** assignment from offsetting positions). The guide identifies the table as spanning multiple statement sections; it does not show these tokens in a completed row of this MVP's supported Activity Statement CSV. Current fictional tests therefore reject these candidate option lifecycle codes rather than silently drop them, classify `GEA` as one event, or label an `AEx`/`MEx` row as a verified exercise. See [checkpoint 0.29](OPTION_EVENT_TYPE_INTEGRITY_EVIDENCE_2026-09-25.md). F01 remains **OPEN**; the actual section/header/row/date/contract/source and no-double-count checks above are still required.

## 2026-09-25 separate-feed boundary

IBKR's [Reporting Integration guide](https://www.interactivebrokers.com/campus/ibkr-reporting/reporting-integration/) defines `EXE = Exercise` in its **Activity data-feed** transaction-code list. That feed must be requested separately, has its own file layouts and FTP delivery, and may even be given a `.csv` extension. A matching extension or the word `Activity` does not make its `EXE` record a completed row in this MVP's **Client Portal Activity Statement CSV**. A further bounded check of the official public [Activity Statement sample index](https://www.ibkrguides.com/reportingreference/reportguide/activity%20statement%20samples.htm) still found HTML examples only. No supported-format completed-Exercise CSV line was established; F01 remains **OPEN**.

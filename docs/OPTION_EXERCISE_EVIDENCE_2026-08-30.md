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

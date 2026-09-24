# CSV structure and numeric-cell integrity — 2026-09-25, checkpoint 0.28

## Reproduced problems

Only repository-owned fictional data was used. In the current-schema fixture, changing the all-assets YTD MTM total from `740.123456` to malformed `7"40.123456"` previously returned `errors=[]`, `dataQuality=good`, and the unchanged numeric Season P&L: a quote in the middle of an unquoted field had been silently discarded. The first new streaming assertion failed on the old code. Other malformed quote continuations and a bare CR inside a field were also accepted.

Independent review then found a separate pre-existing mismatch with the documented strict numeric grammar. Changing the same fictional total to a quoted `"\n740.123456\n"` value still yielded a good report because the tokenizer removed field-edge whitespace before numeric validation. A literal numeric parser test for `' 740.123456'` and a tokenizer raw-edge test both failed first. No private broker CSV/PDF was opened for these regressions.

## Bounded repair

- A quote can open a field only before any unquoted content. Within a quoted field, doubled quotes remain the valid escape. Only comma, LF, CRLF or end of file may follow the closing quote; extra text or spaces fail with existing `csv_malformed`.
- Outside quoted content, CR must be followed by LF, including across separate streamed chunks. Bare CR is not discarded. Valid LF/CRLF, BOM, Unicode, doubled quotes and multiline quoted *text* remain supported.
- The tokenizer now passes field content without edge trimming to its consumers. Its existing whitespace-only-row skipping is retained. Number, percentage and return parsing reject surrounding whitespace rather than changing its source value. Ordinary text/header normalization remains section-specific.
- Existing English, Simplified Chinese and Traditional Chinese diagnostics/recovery are reused. No new code, financial formula, account policy, storage path, Worker protocol or deployment behavior was added; the fixed diagnostic count stays 44.

## Verification and limits

Streaming tests cover misplaced/reopened quotes, text/space after a closing quote, bare CR, every UTF-16 split point and one-character chunks, plus preservation of quoted field edges and skipping a whitespace-only row. Parser smoke tests reject malformed financial totals with `csv_malformed` or `accounting_value_invalid`, and also reject leading/trailing whitespace in number/percent helpers and a quoted multiline TWR. Valid quoted multiline *text* still parses.

Production Chrome imports two separately generated fictional failures through the real Worker. The misplaced quote displays `The CSV structure is malformed.` and the fresh-export recovery. The whitespace-wrapped total produces `accounting_value_invalid` in parser diagnostics, while the browser's first visible diagnostic says the all-assets total is missing and instructs a fresh export rather than editing totals. Both failed imports leave the previous three-row fictional Ledger, `Fully synthetic test` source badge and Season P&L unchanged. The browser test runner removes its temporary profile and generated CSVs.

Final local verification: Node 22.23.2 `npm run check` passed all parser, streaming, selective-materialization, Worker, i18n, accessibility, compatibility, privacy/policy, launcher, fictional stress-pack and production-Chrome groups; `npm run build` passed; `npm audit --audit-level=high` found 0 vulnerabilities; `git diff --check` passed. Production assets were `index-B_QF-OX-.js`, `ibkrParser.worker-qLC_AbPZ.js` and `index-W6y1gsmE.css`.

This is a bounded structure/field-integrity improvement, not broker-file authenticity verification. It does not prove every IBKR export variant is supported, nor provide a real iPhone, iOS/Safari 16.4, Worker-exclusive memory peak or deployed-site result. Fixed P0 gates remain **9 OPEN / 3 CLOSED** (D01, D02, D06–D08, F01, R01–R03 open); the user's L deployment freeze remains in force.

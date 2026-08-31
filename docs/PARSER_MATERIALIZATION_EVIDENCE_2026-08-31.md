# Parser selective-materialization evidence — 2026-08-31

## Scope

Checkpoint 0.13 reduces parser-side retained input for a valid IBKR-shaped CSV while preserving the existing fail-closed accounting, scope, alias-conflict, provenance, and report-capacity rules. This record covers direct Node 22 parser regressions and one same-machine memory proxy. It is not a browser, iPhone, accessibility, authenticity, or deployment approval record.

All generated statements are fully fictional, ASCII-only, created at test runtime, and not committed as multi-megabyte fixtures.

## Implemented parser boundary

- The production parser uses a row visitor that tokenizes one logical CSV row at a time. It no longer begins by constructing a full-file `string[][]`.
- Quoted fields, embedded newlines, BOM handling, CRLF handling, Unicode content, and one-based logical row numbers retain regression coverage against the compatibility parser.
- The 100,000-row limit is enforced during tokenization.
- One logical CSV row may contain at most 4,096 fields. Exactly 4,096 is accepted; field 4,097 returns the fixed `csv_too_many_fields` diagnostic rather than a generic exception or `worker_failure`.
- The first IBKR scan retains records only for registered sections that downstream accounting, identity, NAV, cash, TWR, realized/unrealized, or event logic consumes. It still keeps the bounded global metadata needed for exact section-count, BOF, and header-block checks.
- FII is excluded from the general retained section store and read in a second row-by-row scan. That scan still validates every FII row's registered section shape, account/Model scope, required identity fields, and option alias consistency. A conflict on an unused alias still fails the whole statement.
- FII alias state remains global long enough to preserve that conflict rule. Final underlying mappings and mapping `SourceRef` collections are retained only for aliases demanded by the consumed accounting, realized, or selected event records; attacker-controlled unused alias keys are released before report assembly.

## Deterministic pressure regressions

The dedicated `test:materialization` suite calls the real `parseIbkrActivityStatement` entry point.

| Case | Constructed boundary | Required result |
| --- | --- | --- |
| Unused FII before core | Exactly 5,242,880 bytes and 100,000 rows, including 20,000 valid option FII noise rows before the consumed FII row | No parser errors; one core symbol; one event; Season/option P&L of 7; every retained FII source reference points to the consumed row |
| Unused FII after core | The same exact byte/row/noise counts, with noise after the consumed FII row | The same core symbols, events, and P&L as the before-order case; no noise FII source reference |
| Cross-section mapping candidates | Exactly 5,242,880 bytes and 100,000 rows, with 10,000 distinct option contracts present in both FII and non-event Trades candidate rows | No parser errors; candidates are cross-checked and released; one `CORE` report symbol; zero final events; Season P&L of 7 |
| Duplicate Trades | 25,001 identical valid Trades rows for one option contract | No parser errors; input rows deduplicate to one assignment event rather than being rejected by the 25,000 final-output-item budget |
| Per-row fields | One logical row at exactly 4,096 fields, then one at 4,097 fields | Exact boundary accepted; boundary plus one rejected with fixed `csv_too_many_fields` |

For each 20,000-row unused-FII case, the regression independently checks uniqueness of both the option alias column and the description column. This prevents a duplicate-row shortcut from making the pressure case look larger than the actual alias state it exercises. Moving those rows from before to after the consumed FII block must not change the projected base currency, symbols, lifecycle events, stock/option/other P&L, reported total, or parsed total.

The 10,000-candidate case pressures global FII/Trades candidate comparison and release while the report keeps one symbol. Because the Trades rows have no lifecycle type, they are not 10,000 final demanded mappings; this case must not be cited as such. The duplicate-Trades case separately proves that the 25,000 item budget applies to the deduplicated `ParseResult`/report structure, not blindly to valid raw input rows.

## Same-machine memory proxy

The diagnostic script runs one generated fixture in a fresh Node 22 process with explicit garbage collection available and records `process.resourceUsage().maxRSS` before and after the real parser call.

For the ordinary exact-capacity fixture on this Mac:

- before selective materialization: approximately 48 MiB `maxRSS` increase;
- checkpoint 0.13: approximately 10 MiB `maxRSS` increase.

This is useful directional evidence that the parser no longer retains the previous full row table and broad section store. It is not an automated hard limit. `maxRSS` is a process high-water measure, and the delta can change with the operating system, allocator, V8 JIT state, module caches, process baseline, test order, and other activity. The comparison must not be presented as a guaranteed 38 MiB saving, a browser Worker allocation count, an iPhone memory budget, or a production service-level objective.

## Explicit non-claims and remaining work

- The Worker still calls `Blob.text()`. The entire accepted file is therefore decoded into one JavaScript string before parsing begins.
- The parser scans that decoded text twice: once for the selective statement index and once for FII.
- True `Blob.stream()` ingestion, incremental CSV byte decoding, incremental hashing, and a single-pass streaming parser are not implemented.
- The current measurement does not capture browser Worker transfer/decoding overhead, browser garbage collection, UI/report rendering, PNG export, or the combined page process.
- Real iPhone Safari 16.4+ import, cancellation, timeout, PNG download, and peak-memory behavior remain unverified.
- VoiceOver and real-device accessibility remain unverified.
- The regressions verify parser behavior and resource-shaping invariants; they do not prove that a user-supplied statement is authentic or unedited.
- Hosting remains frozen under the user's 2026-08-30 L decision. This checkpoint does not authorize an upload, deployment, domain, external test, or public release, and it must not be described as release-ready.

## Reproduction commands

Use the repository's supported Node 22 runtime:

```bash
npm run test:materialization
node --expose-gc scripts/measure-parser-memory.mjs capacity
```

The materialization regression is part of `npm run check`. The memory command is diagnostic only and intentionally is not a pass/fail gate.

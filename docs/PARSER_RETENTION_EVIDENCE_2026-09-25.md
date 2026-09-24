# Parser intermediate-retention evidence — 2026-09-25 checkpoint 0.33

## Scope and reason

This is a local, fully fictional parser optimization, not a release-gate reinterpretation. D01 still requires defensible browser-Worker peak allocation evidence and a threshold established on a supported real iPhone/Safari. Prior Chrome samples missed short-lived allocations, while renderer process high-water counts the page and multiple Workers together. Neither can be labeled a Worker-exclusive continuous peak. The current Mac also has only Xcode Command Line Tools, not Xcode's iOS instrumentation/simulator tools; no iOS 16.4 device was supplied in this stage.

Read-only code review found that the first pass retained 25,001 identical Trades records although output already deduplicated them to one event. The second mapping pass retained inferred entries for 10,000 distinct unused contracts even though only demanded aliases could reach its mapping output. FII's `aliasStates` and authoritative candidate conflict states were **not** dropped: unused conflicts are a required fail-closed signal.

## Bounded changes and invariants

- In the first-pass `visit`, section count, repeated-header state and beyond-header populated-cell checks still run before a row may be elided. Only immediately adjacent Trades `DATA` rows with the same raw cells and same source identity are collapsed. The first record and row number remain, including its SourceRefs. A different header, row, source section, type or intervening CSV record breaks the run. The tokenizer continues to count all physical nonempty rows against the 100,000-row cap, and the full-file fingerprint still covers the whole input.
- `buildInstrumentUnderlyingMap` still records all explicit aliases and global conflicts. It keeps source references only for demanded explicit aliases and creates inferred candidates only for demanded aliases. Inference is deterministic from the normalized contract; an undemanded inference cannot supply a final mapping or an independent conflict that FII/explicit states have not already recorded.
- No raw report storage, account/network behavior, trust tier, ranking formula, dependency or production policy changed. Identical broker Trades rows might in reality represent separate executions, but the existing event-identity rule already considered them one event; this optimization does not newly claim broker authenticity or resolve F01.

## Reproducible checks and numeric limits

Fixed `2026-08-30T12:00:00Z` and salt `materialization-diff` were used to SHA-256 the JSON serialization of the **complete** ParseResult before and after the patch. The digest was unchanged for each synthetic fixture:

| Fixture | Rows / bytes | Complete-result SHA-256 before and after |
| --- | ---: | --- |
| 25,001 identical Trades | 25,013 / 2,576,157 | `378a490f76f0dc69ee65fecf7486465890565a1e2021b9391a3cfb530564fd02` |
| 10,000 FII/Trades candidates | 100,000 / 5,242,880 | `8c76dde94fed8401a2ac7191910f1c79e16d768f18821e227d10a155974c3755` |

New fixed assertions require first-row Trades event provenance; retain unused explicit-alias conflicts within Trades and against FII; detect a distinct same-day event after duplicates; and reject a changed header or contradictory lifecycle code after the full 25,001-row run. Existing cross-section alias, Blob/synchronous equality and exact-capacity tests remain. The first extra test mistakenly appended an Underlying value under the fixture's shorter active Trades header and failed as a test-construction error; restoring the correct synthetic header made the intended conflict case pass. Another assertion initially looked at the first sorted event (a later expiration), not the target assignment; selecting the assignment event made the provenance assertion precise. These did not disclose private data or require product workarounds.

The Node 22 `measure:parser-memory` command, one fresh process per fixture and side, produced:

| Fixture | Before | After |
| --- | ---: | ---: |
| Duplicate Trades parse duration | 3,738.2 ms | 243.1 ms |
| Duplicate Trades post-parse JS heap | 67.9 MiB | 33.7 MiB |
| Candidate-FII post-parse JS heap | 66.1 MiB | 40.6 MiB |

These are single-run **post-parse Node readings**, not an allocation peak, not a statistically established benchmark and not browser/iPhone memory. GC timing and runtime conditions can vary. Do not use the figures to set a limit or close D01.

Node 22.23.2 `npm run check` exited 0 across type, parser, streaming, materialization, Worker, policy/accessibility/compatibility and production-Chrome browser suites; the added high-pressure contradiction assertions were rerun after the full check and passed. The production build exited 0 with `ibkrParser.worker-Cjcd1XFM.js`, `index-TUGl6aEN.js` and `index-W6y1gsmE.css`. `npm audit --audit-level=high` found 0 vulnerabilities. An independent read-only diff review found no P0/P1 issue. No private statement, iPhone, deployment or external service was involved. During the attempted device preflight, iPhone Mirroring showed “Mac 已锁定” twice; no phone interaction or permission setting was changed.

## Release boundary

D01 remains `OPEN`. No newly qualified Worker-peak method or supported-device threshold was obtained. D02/D06-D08, F01 and R01-R03 also remain `OPEN`, keeping the fixed ledger at **9 OPEN / 3 CLOSED**. The L external-deployment freeze remains in force. The 0.30 iPhone speech confirmation belongs to its earlier build and does not transfer to 0.33.

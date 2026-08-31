# Parser streaming evidence — checkpoint 0.14

Date: 2026-08-31
Environment: macOS, Node 22.23.2, npm 10.9.8, local production Chrome

## Outcome

The production Worker no longer materializes an accepted CSV with whole-file `Blob.text()` or `arrayBuffer()`. It opens the filename-free immutable Blob twice and decodes transient application chunks of at most 64 KiB with one streaming UTF-8 decoder per pass:

1. The first pass drives the selective statement-index collector and incrementally computes the existing UTF-16 fingerprint plus the normalized synthetic-fixture SHA-256 identity.
2. After the account and actually demanded instrument aliases are known, the second pass drives the FII collector. Global FII scope/schema/identity/alias conflicts remain visible, while final mappings and source references remain demand-limited.

The synchronous string API remains available for existing direct-parser users. Both input routes share the same tokenizer, row collectors and accounting finalizer.

## Boundary and equivalence evidence

`npm run test:streaming` passed and covers:

- every two-part UTF-16 split of a compact BOM/CRLF/quoted-newline/doubled-quote/Chinese/emoji/no-final-newline CSV, plus one-code-unit chunks;
- every two-part UTF-8 byte split of the same input, plus one-byte chunks;
- five malformed or truncated UTF-8 cases whose decoded output matches `Blob.text()` replacement behavior;
- exact 250,000 accepted and 250,001 rejected field characters;
- exact 4,096 accepted and 4,097 rejected fields;
- exact 100,000 accepted and 100,001 rejected non-empty logical rows;
- three standard SHA-256 vectors and twelve text inputs checked against Node crypto at every byte/text split, including an emoji surrogate-pair boundary;
- complete fixed-time/fixed-salt `ParseResult` equality for LF, CRLF, leading-BOM and one-character-mutated synthetic fixtures;
- complete equality for 20,000 unused FII rows before and after the demanded row, 10,000 cross-section FII/Trades candidates, and 25,001 duplicate Trades rows.

The production Worker contract test passed with a repeatable test Blob whose `text()` and whole-Blob `arrayBuffer()` throw. It opened exactly two streams, consumed the complete byte length on each pass, returned the same complete result as the synchronous parser, and retained the synthetic trust label. Separate tests prove that the protocol rejects `File`, the main-thread helper strips `File.name` through a native Blob clone, timeout overrides cannot extend or disable the 12,000 ms maximum, and shorter positive timeouts remain available.

## Browser and private calibration

The complete local verification passed. Its freshly built production bundle imported the exact 5,242,880-byte / 100,000-row / 500-symbol / 1,000-event fictional statement through the real Chrome module Worker in about 814 ms. The same run retained cancellation/Worker-termination behavior, rejected the separate 501-symbol and 1,001-event exact-capacity files with the fixed capacity diagnostic, produced and decoded the privacy-checked 1200×1500 PNG, and made no external page request or POST. The locked dependency install and audit reported zero known installed-package vulnerabilities, and the final production build succeeded.

One private English single-account 2026 YTD CSV was re-read outside the repository. The synchronous and Blob-streaming results were completely equal; all three reconciliations remained `PASS_EXACT`, the report retained good data quality, and a before/after SHA-256 check confirmed that the source file was unchanged. No private source or derived private value was copied into the repository.

## Diagnostic memory observation

`npm run measure:parser-memory -- capacity` now calls the Blob-streaming entry rather than the synchronous string entry. In the final same-machine run, after Blob construction and a forced collection established the parser-call baseline, the exact-capacity parse completed in about 747 ms, retained about 2.3 MiB additional live Node heap after a second collection, and did not move that process's existing `maxRSS` high-water mark after that baseline.

This is directional diagnostic evidence only. Blob construction happened before the baseline, and process high-water results vary with the allocator, JIT, module cache, operating system and prior process activity. An unchanged high-water mark does not mean the parser allocated nothing. The figures are not arithmetically comparable with checkpoint 0.13's string-path proxy and are not an automated pass/fail limit.

## Explicit non-claims

- Two Blob passes are intentional; this is not a single-pass parser.
- The implementation does not prove that a browser engine never caches the immutable Blob internally.
- The selective statement index, global FII alias states and final normalized report still occupy memory.
- Local Node and desktop-Chrome results do not establish iPhone/Safari peak memory, Safari 16.4 behavior, VoiceOver accessibility, deployed headers, deployed storage behavior or release readiness.
- Internal arithmetic checks and normalized synthetic hashes do not authenticate an arbitrary user statement or detect every AI-edited forgery.
- Hosting remains frozen under decision L; no upload, deployment, external test or public domain was created by this checkpoint.

## Repeat commands

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npm run test:streaming
npm run test:worker
npm run test:materialization
npm run test:browser
npm run measure:parser-memory -- capacity
./VERIFY_MAC.command
```

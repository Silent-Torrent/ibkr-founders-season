# Checkpoint 0.34 — local parser identity and share-disclosure checks (2026-09-25)

## Scope

An independent static review and in-memory probes used only `tests/fixtures/ibkr-current-schema-synthetic.csv`, the repository's fully fictional statement. No private IBKR report was opened, copied, uploaded or used to make a new fixture. No iPhone, real broker source, hosting configuration or external deployment was changed. This checkpoint follows the separate 0.33 phone test; its phone observations and pending speech answers do not transfer to the 0.34 bundle.

## Red-to-green parser counterexamples

| Fully fictional change | Old observed result | New bounded rule |
| --- | --- | --- |
| Append an MTM stock detail with its record type changed from `Data` to `Detail`, retaining its nonempty fields. | `errors=[]`, `good` report and unchanged Season P&L: the extra row vanished before accounting checks. | A populated unsupported record type in a registered section produces `accounting_section_conflict` and no report. Known Flex `BOS`/`EOS`/`BOA`/`EOA` control records are exempt; a nonempty `EOS` checksum and the previously verified empty-record-type Total P/L row pass their separate tests. |
| Add a valid `Underlying` column to every MTM block but give `Stocks,ZZFICTA` an explicit `ZZFICTB` underlying. | Season P&L and all three reconciliations still passed exactly, yet `208.863355` of stock MTM moved from ZZFICTA to ZZFICTB. | A nonempty STOCK `Symbol`/`Underlying` mismatch fails the import through the existing mapping-conflict path. A matching explicit underlying remains accepted. Other asset classes were not newly constrained without source semantics. |
| Add a second same-day Assignment row with the same contract's year written `19JUN2026` rather than `19JUN26` and distinct source content. | The same 125-P series counted twice, with `errors=[]` and `good` quality. | Strict 2- or 4-digit-year spaced option notation is normalized to one calendar-year contract identity; different selected source rows now produce `option_event_identity_conflict`. Existing case/spacing/OCC and distinct-series cases still pass. Three-digit years are no longer inferred as valid contract notation. |
| Append a header-named `Unrecognized P/L` column, populated only on one MTM detail. A second review found `Unrecognized P & L` had the same gap. | `errors=[]`, `good` and all three exact checks despite the unhandled nonzero amount. | Populated, unrecognized P/L/P & L/P and L/PNL/profit/loss/MTM-named columns in a selected performance family fail closed; a wholly blank new column does not. The known Month/YTD MTD comparison columns remain allowed. This is a **narrow schema-drift guard**, not proof that every possible broker field name or future accounting layout is understood. |

The red assertions were run against the pre-repair behavior and failed with the stated false-good results. The updated parser smoke suite passed after the repairs. These synthetic mutations demonstrate parser safety boundaries, not that IBKR actually emits each mutated row.

## Share privacy copy

The PNG already displayed an asset-size division when a USD net liquidation value was available. Although the previous notice truthfully excluded the **exact** value, it did not explicitly tell users that the division reveals an approximate account-size range. English, Simplified Chinese and Traditional Chinese now say so beside Download PNG; the button references the disclosure for assistive technology. The copied/manual share output and PNG data fields were not changed. The three-language policy/accessibility tests check the wording, visible markup and button association. The approximate band still represents sensitive financial information, so the user must decide whether to share the image externally.

## Verification and limits

- Node 22.23.2 `npm run check` exited 0: TypeScript, parser, streaming, materialization, Worker boundary, i18n, accessibility, compatibility, privacy/policy, launcher, fictional iPhone-pack and full production-Chrome browser suites. The Chrome run used its ordinary fictional import, failure/preservation, cancellation, capacity and PNG paths; it did **not** separately import each new 0.34 adversarial mutation through the browser Worker.
- `npm run build` exited 0 with `index-CzBbJeEl.js`, `ibkrParser.worker-DyBxjpLN.js` and `index-D6ARIZiW.css`. `npm audit --audit-level=high` returned zero reported vulnerabilities. This audit is not a penetration test.
- The Mac's default Homebrew Node 25 loader currently fails because its `libsimdjson.31.dylib` is absent; all successful commands above explicitly used the working Node 22 path. No package installation or global runtime repair was made.
- No 0.34 iPhone/Safari/VoiceOver result exists. D01 Worker peak, D02 real iOS/Safari 16.4, D06 old Photos item, D07 full spoken/focus order, D08 complete physical rotation, F01 qualified Exercise CSV and R01–R03 deployment gates remain OPEN. Fixed ledger: **9 OPEN / 3 CLOSED**; decision **L deployment freeze** remains in force.

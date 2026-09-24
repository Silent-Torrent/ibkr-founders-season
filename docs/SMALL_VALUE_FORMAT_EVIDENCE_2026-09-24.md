# Small non-zero value display — 2026-09-24

## Scope

Checkpoint 0.25 is a display-only follow-up to the 0.24 local candidate. It does not change IBKR parsing, accounting, source trust, ranking, file storage, dependencies, or deployment policy.

## Reproduced defect and repair

The shared ordinary currency formatter previously forced zero decimal places. In the supported Node 22 runtime, both `+0.40` and `-0.40` USD displayed as unsigned `$0`; the one-decimal percentage formatter similarly displayed `+0.04%` and `-0.04%` as unsigned `0%`. The new regression first failed on the old currency behavior (`'$0' !== '+$0.40'`). This was a presentation defect, not a change in stored/calculated values.

The ordinary currency formatter now uses the existing precision-preserving currency path only for non-zero magnitudes below one currency unit, including compact requests; exact zero and all values of at least one unit keep their former ordinary display rule. Small non-zero returns below `0.1%` use two significant digits, with scientific notation for extreme magnitudes. The `0.05%` boundary is covered so it does not jump from `+0.05%` to `+0.1%` at the threshold. Input remains a number; no source text is interpolated.

## Checked evidence

- Node 22 product-policy checks cover the shared formatters in English, Simplified Chinese, and Traditional Chinese: both signs, true zero, sub-unit USD and JPY, compact small USD, a one-micro-unit amount, return values near `0.05%`, extreme scientific notation, malformed currency and non-finite inputs.
- Static Ledger and share-summary regressions exercise the actual shared display paths with fully fictional small gains, losses and returns.
- The complete local test suite and final production build were run under the repository-required Node 22 runtime. Their final results are recorded in `VERIFICATION.md`.
- The production bundle loaded on the mirrored iPhone 15 Plus / iOS 27.0 over a temporary private hotspot preview and visibly navigated from English Demo Ledger to Import while VoiceOver was temporarily on. This is a page/navigation observation only: no small-value statement was imported, and no spoken label/order was confirmed by the agent. The single project tab was closed, Safari returned to Start Page, VoiceOver was verified Off, the original Pinyin input source was read back, and the owned preview stopped with its port unbound. No phone file, clipboard, PNG, account statement or network setting changed.

## Limits

This change retains the application's existing rounded display for values of at least one unit and does not claim every displayed digit is a broker-statement exact decimal. Desktop/Node tests and iOS 27.0 page loading do not establish the iOS/Safari 16.4 support floor, complete VoiceOver speech/focus order, or D01's Worker memory threshold. D07, D01 and all other open release gates remain open; the L deployment freeze is unchanged.

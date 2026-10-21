# Contributing to P&L Arena

P&L Arena is an early-stage local application for understanding Interactive Brokers annual stock-and-options performance. Contributions should preserve accurate accounting, source traceability and local processing of financial data.

## Before making changes

Read [README.md](README.md), [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md) and [AGENTS.md](AGENTS.md). Current product and device limitations are recorded in [VERIFICATION.md](VERIFICATION.md) and the [release gate tracker](docs/RELEASE_GATE_TRACKER.md).

For a substantial change, explain the problem, proposed scope and expected result in an issue before implementing it. Keep pull requests focused and describe the behavior changed, evidence checked and remaining limitations.

## Safe examples and bug reports

Use wholly synthetic CSV fixtures. Do not submit real or merely redacted brokerage statements, account identifiers, holdings, personal contact details, credentials, private keys, or screenshots containing financial data. Existing repository fixtures are fictional and are documented in [tests/fixtures/README.md](tests/fixtures/README.md).

Reproduce parser problems with the smallest synthetic example that preserves the relevant structure. Do not infer unsupported broker formats or use internal arithmetic consistency as proof of broker authenticity.

## Development and validation

Use Node 22.12 or newer within the Node 22 line and install the pinned dependencies with `npm ci`. See the README for the local development route and Chrome prerequisites.

Run `npm run check` for application changes. Every accounting change needs a meaningful fixture or regression case. Report which checks actually ran; desktop Chrome results do not establish iPhone or Safari baseline acceptance.

Documentation and license-only changes should be checked for consistency and valid metadata without being presented as new application-test evidence.

## Scope and licensing

The MIT License in [LICENSE](LICENSE) applies to the project. Keep copyright and license notices with redistributed copies or substantial portions. Package metadata retains `"private": true` to prevent accidental npm publication; this does not change source licensing.

The maintainer's 2026-10-21 source-publication decision does not authorize hosted application deployment or change the financial-data privacy rules.

# Open-source publication

Date: 2026-10-21

## Authorization and scope

The maintainer explicitly authorized changing this repository to open source on 2026-10-21. Source code and project documentation use the MIT License; the copyright notice uses the existing public GitHub identity.

This supersedes the earlier private-source requirement. It does not authorize a hosted application, publish financial statements, enable an IBKR connection, or close product release gates. Decision L remains in force for hosted deployment, and the product release tracker remains at 9 OPEN / 3 CLOSED.

## Preparation

- MIT License added at the repository root.
- `package.json` and the root package entry in `package-lock.json` identify `MIT`.
- `"private": true` remains set to prevent accidental npm publication.
- README, agent instructions, project decisions, handoff, backlog and verification records distinguish source publication from application hosting.
- Contributor guidance requires wholly synthetic examples and prohibits private financial data or credentials in public contributions.
- Application code, dependencies, lockfile dependency resolutions and accounting rules are unchanged.

## Disclosure review

The review covered all listed branches and tags at commit `191b41aaefe38751bec37cfa13b0f8c38fc932c2`: one branch, no tags, 67 commits and 742 historical file versions. Each reconstructed historical version matched its Git blob SHA-1, and the final 157-file tree matched the repository snapshot. All-state issue and pull-request lists and the releases list were empty.

Pattern and contextual checks found no credential or real financial-statement blocker in that scope. Historical author and committer emails used GitHub noreply addresses. Both committed CSV paths are documented synthetic fixtures. A few private-network test addresses remain as historical environment details. This is a bounded disclosure review and does not guarantee detection of arbitrary unrecognized secret formats.

## GitHub visibility

**Public — verified on 2026-10-21.** Repository settings show "This repository is currently public", and GitHub repository metadata returns `visibility: public`. The MIT source publication is complete at https://github.com/Silent-Torrent/ibkr-founders-season.

The 13 prepared files were committed to `main` in `db065c45db37e57a7c0dc6f75ae5a6fa9307028a` and `e2e744fc82a78544a2a9a9387b7ca71d5f8a8a4d`. Every published file matched the reviewed Git blob hash; no unrelated file was changed or removed. Both commits use the approved GitHub noreply author identity and GitHub noreply committer identity. The application remains at checkpoint 0.42, and hosted deployment remains frozen.

## Validation boundary

This is a source-licensing and documentation change. Existing test records remain historical evidence. No new parser, browser, iPhone, dependency-audit or hosted-deployment pass is implied.

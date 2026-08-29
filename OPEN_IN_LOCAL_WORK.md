# Open this project in local Work / Codex

## Goal

Move the repository into a local folder and let Work/Codex read it without installing dependencies or starting the application yet.

## Recommended local folder

```text
~/Developer/ibkr-founders-season
```

Any normal folder is acceptable, but avoid leaving the working copy inside a temporary Downloads subfolder for long-term development.

## Steps

1. Download and unzip the workspace package.
2. Move the inner `ibkr-founders-season` folder to `~/Developer/`.
3. In the ChatGPT desktop app, open Work or Codex and select the local `ibkr-founders-season` folder.
4. Grant access only to this project folder.
5. Start with the prompt in `FIRST_WORK_PROMPT.txt`.

Do not double-click `START_MAC.command` yet. Do not run `npm install` until the repository audit is complete and the user explicitly approves execution.

## Optional Terminal move command

Run only after the ZIP has been downloaded and extracted:

```bash
mkdir -p ~/Developer
mv ~/Downloads/ibkr-founders-season ~/Developer/
```

If a folder with that name already exists, do not overwrite it. Rename the new folder or inspect both versions first.

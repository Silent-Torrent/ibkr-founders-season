FROM mcr.microsoft.com/devcontainers/javascript-node:22-bookworm

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium chromium-sandbox zsh fonts-noto-cjk python3-venv \
    && rm -rf /var/lib/apt/lists/*

COPY --chown=node:node editor-requirements.txt /tmp/ibkr-editor-requirements.txt
USER node
RUN python3 -m venv /home/node/.local/share/ibkr-cloud-editor \
    && /home/node/.local/share/ibkr-cloud-editor/bin/python -m pip install --no-cache-dir \
        --requirement /tmp/ibkr-editor-requirements.txt \
    && /home/node/.local/share/ibkr-cloud-editor/bin/python -m pip check

# gh codespace jupyter discovers these official entry points through PATH.
# Keep Jupyter's default token authentication; no server credentials are baked in.
USER root
RUN ln -s /home/node/.local/share/ibkr-cloud-editor/bin/jupyter /usr/local/bin/jupyter \
    && ln -s /home/node/.local/share/ibkr-cloud-editor/bin/jupyter-lab /usr/local/bin/jupyter-lab \
    && rm /tmp/ibkr-editor-requirements.txt

USER node

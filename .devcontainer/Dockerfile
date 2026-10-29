FROM mcr.microsoft.com/devcontainers/javascript-node:22-bookworm

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium chromium-sandbox zsh fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

USER node

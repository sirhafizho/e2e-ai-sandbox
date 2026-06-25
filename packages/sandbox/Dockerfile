FROM ubuntu:24.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# System packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    git \
    jq \
    tree \
    unzip \
    openssh-client \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
    fd-find \
    ripgrep \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s "$(which fdfind)" /usr/local/bin/fd

# Install Node.js 22 (LTS)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user (remove ubuntu user that owns UID 1000 in 24.04)
RUN userdel -r ubuntu 2>/dev/null || true \
    && useradd -m -s /bin/bash -u 1000 forge

# Create workspace directory
RUN mkdir -p /workspace && chown forge:forge /workspace

# Set default working directory
WORKDIR /workspace

# Switch to non-root user
USER forge

# Default command
CMD ["bash"]

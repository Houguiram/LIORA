FROM node:20-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y \
    ca-certificates \
    bash \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Copy package manifests first for better layer caching
COPY package.json package-lock.json* ./

# Install production deps
# Use install with legacy peer deps to accommodate peer ranges across Mastra pkgs
RUN npm install --omit=dev --legacy-peer-deps

# Copy source
COPY . .

# Expose default Coral ports optionally used by ecosystem
EXPOSE 3001 5555

# Use tsx to run the TypeScript entrypoint
CMD ["npx", "tsx", "src/coral/coral-agent-entrypoint.ts"]



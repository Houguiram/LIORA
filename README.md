## Local Mastra Agent (Docker)

This agent bridges Coral MCP tools with local Mastra tools to generate images/videos end-to-end.

### Prerequisites

- Coral Server running and reachable by the container
- API keys for providers you use (OpenAI, Fal, Notion)

### Setup

1. Copy env template and fill values:

```bash
cp .env_sample .env
```

2. Build image:

```bash
docker build -t local-mastra-agent:latest .
```

3. Run container (adjust network and env as needed):

```bash
docker run --rm \
  --name local-mastra-agent \
  --env-file .env \
  --network host \# if Coral runs on host
  local-mastra-agent:latest
```

If you cannot use host networking, set `CORAL_SSE_URL` in `.env` to the Coral Server address resolvable from inside the container.

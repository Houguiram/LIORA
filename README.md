## LIORA — GenAI Expert Agent

LIORA is an AI agent specialized in generating images and videos. It automatically selects the best available model and workflow for a given task, and it can orchestrate multi‑step workflows when needed. The project is built with TypeScript, Effect, and Mastra, and integrates with the Coral Protocol for agent-to-agent and user communication.

### Highlights

- **Best model selection**: Chooses the right model and endpoint for the job.
- **End-to-end generation**: Produces actual assets (not just recipes) when desired.
- **Multi-step workflows**: Chains steps and reuses intermediate outputs when helpful.
- **Pluggable tools/services**: Clean separation via Effect services and Mastra tools.
- **Coral Protocol integration**: Exposes tools over MCP and listens/responds to mentions.

## Repository layout

- `src/mastra/`
  - `agents/`
    - `genai-agent.ts` — Generates the final asset (image/video) end-to-end using tools
    - `genai-recipe-agent.ts` — Chooses model and crafts an optimized prompt (a "recipe")
  - `tools/`
    - `best-practice-tool.ts` — Retrieves best practices for a prompt
    - `best-practice-tool-with-payment.ts` — Same, with payment claims
    - `genai-execution-tool.ts` — Executes generation (maps generic model → fal.ai endpoint)
    - `genai-execution-tool-with-payment.ts` — Same, with payment claims
  - `index.ts` — Mastra instance wiring (agents, storage, logger)
- `src/effects/` — Core logic (Effect services)
  - `best-practice-service.ts` — Loads best practices via repository, with payment gating
  - `best-practice-repository/`
    - `best-practice-repository.ts` — Repository contracts, mock, and live binding
    - `notion-repository.ts` — Notion-backed repository implementation
  - `genai-service.ts` — Orchestrates payments and fal.ai generation
  - `fal-service.ts` — fal.ai client wrapper (live + mock)
  - `payment-service.ts` — Coral payments client (live + mock)
  - `recipe-service.ts` — Recipe generator (WIP placeholder)
  - `recipe-agent-workflow.ts` — Prototype workflow using the services (dev/testing)
- `src/coral/`
  - `coral-agent-entrypoint.ts` — Coral-integrated agent for end-to-end generation (with payments)
  - `coral-recipe-agent-entrypoint.ts` — Coral-integrated agent for model/prompt recipes
- `src/utils/offline.ts` — Toggle offline mode for local dev LLMs (Ollama)
- `coral-agent.toml` — Coral integration metadata and runtime options
- `Dockerfile` — Production container image
- `run_agent.sh` — Convenience script to run the Coral entrypoint locally

## How it works

### Agents

- `genAiAgent` (Mastra):
  - Validates the user prompt is a GenAI request (image/video)
  - Calls `best-practice-tool` with the exact user prompt
  - Chooses the best model and optionally optimizes the prompt
  - Calls `genai-execution-tool` to generate the asset
  - Returns only this JSON: `{ url: string; model: string; prompt: string; explanation: string }`

- `genAiRecipeAgent` (Mastra):
  - Fetches best practices and chooses a model
  - Crafts an optimized prompt
  - Returns: `{ model: string; optimisedPrompt: string; explanation: string }`

For Coral integration, the entrypoints compose a bridging agent that loads Coral tools (over MCP), merges them with local Mastra tools, and then runs a loop that waits for mentions and responds using Coral tools.

### Tools

- `get-best-practices` (with/without payments)
  - Input: `{ prompt: string }`
  - Output: `{ error?: string; bestPractices: Array<{ insight: string; relevantModels: string[] }> }`

- `genai-execute` (with/without payments)
  - Input: `{ model: string; prompt: string; outputType: "image" | "video"; imageUrl?: string }`
  - Output: `{ error?: string; requestId?: string; data?: any; resolvedModel?: string }`

`genai-execute` resolves a generic model name to a concrete fal.ai endpoint and then triggers generation. See `resolveFalEndpoint` in `src/effects/genai-service.ts` for details and tests.

### Services (Effect)

- `BestPracticeService` → loads best practices from `BestPracticeRepository` and claims a small budget via `PaymentService`.
- `BestPracticeRepository` → Notion-backed implementation (`notion-repository.ts`) and mocks for offline/dev.
- `GenAiService` → claims budget via `PaymentService`, resolves the fal.ai endpoint, then calls `FalService` to generate.
- `FalService` → fal.ai subscribe API integration (live + mock).
- `PaymentService` → Coral payments API client (`/api/v1/internal/claim/:sessionId`).

## Requirements

- Node.js >= 20.9.0
- npm (or pnpm/yarn, if you prefer)
- Optional for offline LLMs: [Ollama](https://ollama.com) with the `llama3.2` model
- For live generation: fal.ai account and API key
- For best practices: Notion database and token
- For Coral integration: running Coral SSE server and an active session

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` from `.env_sample` and fill in values:

```bash
cp .env_sample .env
```

3. Ensure your environment has any additional variables required by providers (e.g. `MISTRAL_API_KEY`).

## Environment variables

From `.env_sample`:

- `OPENAI_API_KEY` — optional; not used by default here
- `NOTION_API_TOKEN` — Notion API token
- `NOTION_BEST_PRACTICES_DB_ID` — Notion database ID with best practices
- `FAL_KEY` — fal.ai API key

- `CORAL_SSE_URL` — Coral SSE server URL, e.g. `http://localhost:5555/devmode/exampleApplication/privkey/session1/sse`
- `CORAL_AGENT_ID` — Agent identity when connecting to Coral, e.g. `LIORA`
- `TIMEOUT_MS` — Optional timeouts for Coral tools and connections (default `30000`)

- `CORAL_API_URL` — Coral server base URL for payments, e.g. `http://localhost:5555`
- `CORAL_SESSION_ID` — Coral session identifier for payments

Additional provider variables you may need (depending on your setup):

- `MISTRAL_API_KEY` — Required if you use the Mistral online model

### Notion database schema

Expected properties (names must match):

- Insight text: `Insight 1` (type: Title or Rich text)
- Relevant models: `Model` (type: Multi-select or Rich text)
- Output type: `Output type` (type: Multi-select or Rich text) with values among `image`, `video`, `voice`
- Multistep flag: `Multistep` (type: Checkbox, Select, or Rich text of `true`/`yes`/`1`)

## Running with Mastra (local dev)

Start Mastra in dev mode (includes UI/telemetry depending on your global setup):

```bash
npm run dev
```

Build and start:

```bash
npm run build
npm run start
```

The Mastra instance is defined in `src/mastra/index.ts` and includes both `genAiAgent` and `genAiRecipeAgent`.

## Running with Coral Protocol

Ensure your Coral SSE server is running and `.env` is configured (`CORAL_SSE_URL`, `CORAL_AGENT_ID`, `TIMEOUT_MS`).

Run the end‑to‑end generation agent entrypoint:

```bash
bash ./run_agent.sh
```

To run the recipe entrypoint instead:

```bash
npx tsx src/coral/coral-recipe-agent-entrypoint.ts
```

Agent metadata for Coral is in `coral-agent.toml`. The Docker runtime is also declared there.

## Docker

Build the image:

```bash
docker build -t liora-agent .
```

Run with environment:

```bash
docker run --rm \
  --name liora \
  --env-file ./.env \
  liora-agent
```

Ports `3001` and `5555` are exposed in the image for convenience.

## Offline/local LLM mode

Toggle `IS_OFFLINE` in `src/utils/offline.ts` to `true` to run the agents with a local Ollama model (defaults to `llama3.2` at `http://localhost:11434/api`). Ensure you have Ollama installed and the model pulled.

## Testing

Unit tests (Vitest) cover endpoint resolution logic used for fal.ai routing:

```bash
npm test
```

See `src/effects/genai-service.test.ts`.

## Troubleshooting

- Missing keys/config
  - Best practices: ensure `NOTION_API_TOKEN` and `NOTION_BEST_PRACTICES_DB_ID`
  - Generation: ensure `FAL_KEY`
  - Mistral online model: ensure `MISTRAL_API_KEY` (or switch to offline/Ollama)
  - Coral payments: ensure `CORAL_API_URL` and `CORAL_SESSION_ID`

- No output URL
  - The execution tool returns `data` from fal.ai; select the primary URL corresponding to the requested `outputType`.
  - If none is available, the agent will return an error as per system rules.

- Recipe workflow
  - `RecipeServiceLive` is currently a placeholder. The demo workflow uses mocks.

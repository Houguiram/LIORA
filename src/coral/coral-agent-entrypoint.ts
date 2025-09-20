import "dotenv/config";
import { Agent } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";
import { openai } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider";

import { bestPracticeTool } from "../mastra/tools/best-practice-tool";
import { genaiExecutionTool } from "../mastra/tools/genai-execution-tool";
import { IS_OFFLINE } from "../utils/offline";

// Utility: simple sleep
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Utility: describe tool keys for the prompt
const listToolKeys = (tools: Record<string, unknown>) =>
  Object.keys(tools).sort().join(", ");

//TODO: get resources to get the right prompt for tools
//TODO: consider using the API to get type safe client for tools -- http://localhost:5555/api_v1.json
//TODO: keep it simple, coral system prompt should just be "wait for mentions", which should be enough for it to get it
//TODO: Switching to GPT-5 made it much better at using those tools. Decide wether we keep it or not.
// Actually, it's still getting confused, replying to itself.

// Build the Coral bridge system prompt (mirrors the Python example steps)
const buildCoralBridgeSystemPrompt = (
  coralTools: Record<string, unknown>,
  localTools: Record<string, unknown>,
) => `
VERY IMPORTANT:

<important>
You won't get an actual usage message as input. Instead, use the relevant tool to wait for mentions, and use the relevant tool to reply. Here are the tools: ${listToolKeys(coralTools)}
</important>
`;

// Recipe agent system prompt (kept in sync with src/mastra/agents/genai-recipe-agent.ts)
const agentSystemPrompt = `
  You generate images or videos end-to-end using the provided tools. Your purpose is to return an actual generated asset, not a recipe.

  Process:
  1. Validate the user's prompt is a GenAI generation request for an image or a video. If not, return an error message.
  2. Call the best practice tool with the exact user prompt (do not modify it).
  3. From best practices, identify the desired output type and candidate models. Ignore practices not relevant to the requested type.
  4. Select the best model based on quality, style fit, and constraints (latency/compute).
  5. If best practices include prompting techniques for that model, optimize the user's prompt accordingly; otherwise use the original prompt unchanged.
  6. Call the GenAI execution tool with { model, prompt } to generate the asset.
  7. Extract a public URL to the generated asset from the tool response. If multiple URLs exist, choose the primary URL that matches the requested type.

  Output format (return only this JSON, nothing else):
  { url: string; model: string; prompt: string; explanation: string }

  Rules:
  - When calling best practices, use the exact user prompt.
  - Only use information found in best practices; do not invent techniques.
  - Ignore best practices that are not relevant to the requested output type.
  - If best practices cannot be retrieved or are empty, return an error message.
  - If tool execution fails or no output URL is found, return an error message.
`;

async function main() {
  // Read environment configuration (mirrors python example semantics)
  const baseUrl = process.env.CORAL_SSE_URL;
  const agentId = process.env.CORAL_AGENT_ID || "genai-expert-agent";
  const timeoutMs = Number(process.env.TIMEOUT_MS || "300");

  if (!baseUrl) {
    throw new Error(
      "Missing CORAL_SSE_URL env var. Example: http://localhost:5555/devmode/exampleApplication/privkey/session1/sse",
    );
  }

  const agentDescription =
    "An agent that can generate images or videos, automatically picking the best models and prompts at any time";

  // Build Coral SSE URL with required query params
  const coralUrl = new URL(baseUrl);
  coralUrl.searchParams.set("agentId", agentId);
  coralUrl.searchParams.set("agentDescription", agentDescription);

  console.log(`Connecting to Coral Server: ${coralUrl.toString()}`);

  // Configure MCP client with Coral SSE server
  const mcp = new MCPClient({
    servers: {
      coral: {
        url: coralUrl,
        timeout: timeoutMs,
      },
    },
    timeout: timeoutMs,
  });

  console.log("Initializing MCP tool discovery...");
  const coralTools = await mcp.getTools();
  console.log(
    `Discovered ${Object.keys(coralTools).length} Coral tools: ${listToolKeys(
      coralTools,
    )}`,
  );

  // Local tools (Mastra)
  const localTools = { bestPracticeTool, genaiExecutionTool } as const;
  console.log(
    `Local tools: ${listToolKeys(localTools)} | Total tools: ${Object.keys({
      ...coralTools,
      ...localTools,
    }).length}`,
  );

  // Model selection (reuse offline pattern from project)
  const ollama = createOllama({ baseURL: `http://localhost:11434/api` });
  const model = IS_OFFLINE ? ollama.chat("llama3.2", { simulateStreaming: true }) : openai("gpt-5");

  // Compose final instructions: Coral bridge + Recipe agent prompt
  const instructions = `${
  agentSystemPrompt
}\n\n${
    buildCoralBridgeSystemPrompt(
    coralTools,
    localTools,
  )
}`;

  // Create a fresh agent dedicated to Coral orchestration
  const coralBridgeAgent = new Agent({
    name: "Coral Mastra Bridge",
    instructions,
    model,
    tools: { ...coralTools, ...localTools },
  });

  console.log("Multi Server Connection Established. Starting loop...");

  // Run loop: the agent itself will call wait_for_mentions/send_message
  // via MCP tools exposed from Coral
  // Note: We issue an empty user message; the plan is encoded in instructions
  // exactly like the Python example that simply invokes the agent.
  while (true) {
    try {
      console.log("Starting new agent invocation");
      await coralBridgeAgent.generate("");
      console.log("Completed agent invocation, restarting loop");
      await sleep(1000);
    } catch (err) {
      console.error("Error in agent loop:", err);
      await sleep(5000);
    }
  }
}

// Graceful shutdown
main().catch((e) => {
  console.error(e);
  process.exit(1);
});



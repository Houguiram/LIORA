import "dotenv/config";
import { Agent } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";
import { openai } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider";

import { bestPracticeTool } from "../mastra/tools/best-practice-tool";
import { genaiExecutionTool } from "../mastra/tools/genai-execution-tool";
import { IS_OFFLINE } from "../utils/offline";
import { bestPracticeToolWithPayment } from "../mastra/tools/best-practice-tool-with-payment";
import { genaiExecutionToolWithPayment } from "../mastra/tools/genai-execution-tool-with-payment";

// Utility: simple sleep
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Utility: describe tool keys for the prompt
const listToolKeys = (tools: Record<string, unknown>) =>
  Object.keys(tools).sort().join(", ");

//TODO: get resources to get the right prompt for tools
//TODO: consider using the API to get type safe client for tools -- http://localhost:5555/api_v1.json

// Recipe agent system prompt (kept in sync with src/mastra/agents/genai-recipe-agent.ts)
const agentSystemPrompt = `
  You generate images or videos end-to-end using the provided tools. Your purpose is to return an actual generated asset, not a recipe.

  Process:
  - If the user provides a prompt, call the best practice tool with the exact user prompt (do not modify it).
  - From best practices, identify the desired output type and candidate models. Ignore practices not relevant to the requested type.
  - Select the best model based on quality, style fit, and constraints (latency/compute).
  - If best practices include prompting techniques for that model, optimize the user's prompt accordingly; otherwise use the original prompt unchanged.
  - Call the GenAI execution tool with { model, prompt } to generate the asset.
  - Extract a public URL to the generated asset from the tool response. If multiple URLs exist, choose the primary URL that matches the requested type.
  - If the best way to achieve the user's goal is to go through multiple steps, go through the steps one by one, reusing the URL of outputs from previous steps as input to the next step as needed.

  Rules:
  - When calling best practices, use the exact user prompt.
  - Only use information found in best practices; do not invent techniques.
  - Ignore best practices that are not relevant to the requested output type.
  - If best practices cannot be retrieved or are empty, send an error message.
  - If tool execution fails or no output URL is found, send an error message.

  REMEMBER, VERY IMPORTANT: 
  <important>
  In most cases assistant message output will not reach the user.  Use Coral tooling where possible to communicate with the user or other agents instead.
  Do not stop executing until you've sent back a message within the thread you've been mentioned in!
  </important>

`;

async function main() {
  // Read environment configuration (mirrors python example semantics)
  const baseUrl = process.env.CORAL_SSE_URL;
  const agentId = process.env.CORAL_AGENT_ID || "genai-expert-agent";
  const timeoutMs = Number(process.env.TIMEOUT_MS || "3000");

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
  const coralResources = await mcp.resources.list();
  console.log(JSON.stringify(coralResources, null, 2));
  console.log(
    `Discovered ${Object.keys(coralTools).length} Coral tools: ${listToolKeys(
      coralTools,
    )}`,
  );

  // Read Coral's official instructions resource for system prompt composition
  const instructionUri = "Instruction.resource";
  let coralInstructions = "";
  try {
    const readResult = await mcp.resources.read("coral", instructionUri);
    const contents = (readResult as any)?.contents ?? [];
    const texts = contents
      .map((c: any) => (c && typeof c.text === "string" ? c.text : ""))
      .filter(Boolean);
    coralInstructions = texts.join("\n").trim();
    if (!coralInstructions) {
      console.warn(
        `Coral instructions resource returned no text for uri: ${instructionUri}`,
      );
    } else {
      console.log("Coral instructions:", coralInstructions);
    }
  } catch (e) {
    console.warn("Failed to read Coral instructions resource:", e);
  }

  // Local tools (Mastra)
  const localTools = { bestPracticeToolWithPayment, genaiExecutionToolWithPayment } as const;
  console.log(
    `Local tools: ${listToolKeys(localTools)} | Total tools: ${Object.keys({
      ...coralTools,
      ...localTools,
    }).length}`,
  );

  // Model selection (reuse offline pattern from project)
  const ollama = createOllama({ baseURL: `http://localhost:11434/api` });
  const model = IS_OFFLINE ? ollama.chat("llama3.2", { simulateStreaming: true }) : openai("gpt-5");

  // Compose final instructions: Coral instructions + Recipe agent prompt
  const coralBridgeNote = coralInstructions || "";
  const instructions = `${coralBridgeNote}\n\n${agentSystemPrompt}`;

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
      const output = await coralBridgeAgent.generate("Wait for mentions", {
        onStepFinish: (step) => {
          console.log(`Step finished: TOOLS: ${JSON.stringify(step.toolCalls)} TEXT: ${step.text}`);
        },
      });
      console.log("Agent output:", output)
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



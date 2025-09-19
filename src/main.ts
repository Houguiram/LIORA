import "dotenv/config";
import { Agent } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";
import { openai } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider";

import { bestPracticeTool } from "./mastra/tools/best-practice-tool";
import { IS_OFFLINE } from "./utils/offline";

// Utility: simple sleep
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Utility: describe tool keys for the prompt
const listToolKeys = (tools: Record<string, unknown>) =>
  Object.keys(tools).sort().join(", ");

async function main() {
  // Read environment configuration (mirrors python example semantics)
  const baseUrl = process.env.CORAL_SSE_URL;
  const agentId = process.env.CORAL_AGENT_ID || "local-mastra-agent";
  const timeoutMs = Number(process.env.TIMEOUT_MS || "300");

  if (!baseUrl) {
    throw new Error(
      "Missing CORAL_SSE_URL env var. Example: http://localhost:5555/devmode/exampleApplication/privkey/session1/sse",
    );
  }

  const agentDescription =
    "An agent that can pick models and craft optimised prompts for GenAI based on best practices";

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
  const localTools = { bestPracticeTool } as const;
  console.log(
    `Local tools: ${listToolKeys(localTools)} | Total tools: ${Object.keys({
      ...coralTools,
      ...localTools,
    }).length}`,
  );

  // Model selection (reuse offline pattern from project)
  const ollama = createOllama({ baseURL: `http://localhost:11434/api` });
  const model = IS_OFFLINE ? ollama.chat("llama3.2", { simulateStreaming: true }) : openai("gpt-4o-mini");

  // Compose instructions mirroring the Python example steps
  const instructions = `
You are an agent interacting with tools from the Coral Server and your own tools. Your task is to perform any instructions coming from any agent.

Follow these steps in order:
1. Call wait_for_mentions from Coral tools (timeoutMs: 30000) to receive mentions from other agents.
2. When you receive a mention, keep the thread ID and the sender ID.
3. Take 2 seconds to think about the content (instruction) of the message and check only from the list of your tools available for you to action.
4. Check the tool schema and make a plan in steps for the task you want to perform.
5. Only call the tools you need to perform for each step of the plan to complete the instruction in the content.
6. Take 3 seconds and think about the content and see if you have executed the instruction to the best of your ability and the tools. Make this your response as "answer".
7. Use send_message from Coral tools to send a message in the same thread ID to the sender Id you received the mention from, with content: "answer".
8. If any error occurs, use send_message to send a message in the same thread ID to the sender Id you received the mention from, with content: "error".
9. Always respond back to the sender agent even if you have no answer or error.
9. Wait for 2 seconds and repeat the process from step 1.

These are the list of Coral tools (names are prefixed by the server name): ${listToolKeys(
    coralTools,
  )}
These are the list of your local tools: ${listToolKeys(localTools)}
`;

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



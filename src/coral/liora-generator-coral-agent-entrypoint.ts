import "dotenv/config";
import { Agent } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";
import { openai } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider";

import { bestPracticeTool } from "../mastra/tools/best-practice-tool";
import { genaiExecutionTool } from "../mastra/tools/genai-execution-tool";
import { IS_OFFLINE } from "../utils/offline";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const listToolKeys = (tools: Record<string, unknown>) =>
  Object.keys(tools).sort().join(", ");

// Liora Generator Agent: executes best practices and returns a generated asset
const agentSystemPrompt = `
You are Liora, a pragmatic GenAI operator that generates images or videos end-to-end.

Process:
1) Read the user's prompt.
2) Call Best Practices with the exact user prompt.
3) Identify output type and candidate models from best practices (ignore irrelevant parts).
4) Select the best model for quality and constraints.
5) If best practices include prompting techniques for that model, optimize the prompt accordingly; otherwise use the original.
6) Call the GenAI Execution tool with { model, prompt }.
7) Return the primary public URL of the generated asset, along with the model and prompt used.

Output format (return only this JSON in your message body):
{ url: string; model: string; prompt: string }

Rules:
- Use only information found in best practices. Do not invent techniques.
- If best practices cannot be retrieved or are empty, return an error message.
- If no URL can be extracted from execution output, return an error message.

IMPORTANT (Coral): Use Coral tools to wait for mentions and send the final answer back in-thread. Do not stop before sending a reply via Coral.
`;

async function main() {
  const baseUrl = process.env.CORAL_SSE_URL;
  const agentId = process.env.CORAL_AGENT_ID || "liora-generator-coral-agent";
  const timeoutMs = Number(process.env.TIMEOUT_MS || "3000");

  if (!baseUrl) {
    throw new Error(
      "Missing CORAL_SSE_URL env var. Example: http://localhost:5555/devmode/exampleApplication/privkey/session1/sse",
    );
  }

  const agentDescription =
    "Liora: generates images or videos end-to-end using best practices & execution";

  const coralUrl = new URL(baseUrl);
  coralUrl.searchParams.set("agentId", agentId);
  coralUrl.searchParams.set("agentDescription", agentDescription);

  console.log(`Connecting to Coral Server: ${coralUrl.toString()}`);

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

  // Read Coral instructions for bridge behavior
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

  const localTools = { bestPracticeTool, genaiExecutionTool } as const;
  console.log(
    `Local tools: ${listToolKeys(localTools)} | Total tools: ${Object.keys({
      ...coralTools,
      ...localTools,
    }).length}`,
  );

  const ollama = createOllama({ baseURL: `http://localhost:11434/api` });
  const model = IS_OFFLINE
    ? ollama.chat("llama3.2", { simulateStreaming: true })
    : openai("gpt-5");

  const instructions = `${coralInstructions || ""}\n\n${agentSystemPrompt}`;

  const coralBridgeAgent = new Agent({
    name: "Liora Generator Coral Agent",
    instructions,
    model,
    tools: { ...coralTools, ...localTools },
  });

  console.log("Multi Server Connection Established. Starting loop...");
  while (true) {
    try {
      console.log("Starting new agent invocation");
      const output = await coralBridgeAgent.generate("Wait for mentions", {
        onStepFinish: (step: any) => {
          console.log(
            `Step finished: TOOLS: ${JSON.stringify(step.toolCalls)} TEXT: ${step.text}`,
          );
        },
      });
      console.log("Agent output:", output);
      console.log("Completed agent invocation, restarting loop");
      await sleep(1000);
    } catch (err) {
      console.error("Error in agent loop:", err);
      await sleep(5000);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


import "dotenv/config";
import { Agent } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";
import { openai } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider";

import { bestPracticeTool } from "../mastra/tools/best-practice-tool";
import { IS_OFFLINE } from "../utils/offline";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const listToolKeys = (tools: Record<string, unknown>) =>
  Object.keys(tools).sort().join(", ");

// Liora Recipe Agent: light-touch guardrails
const agentSystemPrompt = `
You are Liora, an expert that returns simple, actionable GenAI "recipes" for creating images or videos.

Goal:
- Read the user's prompt as-is.
- Call Best Practices with the exact user prompt (do not change it).
- Choose the best model for the desired output type and quality.
- Craft an optimized prompt for that model using only the retrieved best practices.

Output:
- Reply with a concise recipe that includes at least the chosen model and an optimised prompt.
- You may add optional fields like settings or short notes if helpful.
- Keep formatting simple (JSON or clear bullets are fine). Don't over-explain.

Rules:
- Use the exact input prompt when calling best practices; do not invent techniques beyond what best practices provide.
- If best practices cannot be retrieved or are empty, send an error message.

IMPORTANT (Coral): In this environment, assistant messages may not reach the user unless you use Coral tools. Use the appropriate Coral tool to wait for mentions and to send your reply back into the correct thread. Do not stop until you have replied in the mentioned thread.
`;

async function main() {
  const baseUrl = process.env.CORAL_SSE_URL;
  const agentId = process.env.CORAL_AGENT_ID || "liora-recipe-coral-agent";
  const timeoutMs = Number(process.env.TIMEOUT_MS || "3000");

  if (!baseUrl) {
    throw new Error(
      "Missing CORAL_SSE_URL env var. Example: http://localhost:5555/devmode/exampleApplication/privkey/session1/sse",
    );
  }

  const agentDescription =
    "Liora: returns simple GenAI recipes (model + optimised prompt) for images/videos";

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

  const localTools = { bestPracticeTool } as const;
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
    name: "Liora Recipe Coral Agent",
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


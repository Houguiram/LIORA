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
  - If best practices cannot be retrieved or are empty, send an error message.
  - If tool execution fails or no output URL is found, send an error message.
  - To send a result or an error message, use the appropriate tool.
`;

async function main() {
  // Read environment configuration (mirrors python example semantics)
  const baseUrl = process.env.CORAL_SSE_URL;
  const agentId = process.env.CORAL_AGENT_ID || "genai-expert-agent";
  const timeoutMs = Number(process.env.TIMEOUT_MS || "30000");

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

  // Create an agent that ONLY has local tools; we'll call Coral tools manually
  const localExecutionAgent = new Agent({
    name: "GenAI Execution Agent",
    instructions: agentSystemPrompt,
    model,
    tools: { ...localTools },
  });

  // Helper: robustly find a tool by fuzzy name
  const findTool = (
    tools: Record<string, any>,
    candidates: string[],
  ) => {
    const keys = Object.keys(tools);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const cand of candidates) {
      const n = norm(cand);
      const key = keys.find((k) => norm(k).includes(n));
      if (key) return { key, tool: (tools as any)[key] };
    }
    return undefined;
  };

  // Helper: invoke a tool across common call shapes
  const invokeTool = async (tool: any, input: any) => {
    // 1) direct function
    if (typeof tool === "function") {
      return await tool(input);
    }
    // 2) createTool shape
    if (tool && typeof tool.execute === "function") {
      return await tool.execute({ context: input });
    }
    // 3) alternative call shapes
    if (tool && typeof tool.call === "function") {
      return await tool.call(input);
    }
    if (tool && typeof tool.invoke === "function") {
      return await tool.invoke(input);
    }
    throw new Error("Unsupported tool shape for invocation");
  };

  // Helper: safely extract thread/sender/content from mention payloads
  const extractMention = (m: any) => {
    const threadId =
      m?.threadId ?? m?.thread_id ?? m?.thread ?? m?.data?.threadId ?? m?.data?.thread_id;
    const senderId =
      m?.senderId ?? m?.sender_id ?? m?.sender ?? m?.from ?? m?.data?.senderId ?? m?.data?.sender_id;
    const content =
      m?.content ?? m?.message ?? m?.text ?? m?.data?.content ?? m?.data?.message ?? m?.data?.text;
    return { threadId, senderId, content } as {
      threadId?: string;
      senderId?: string;
      content?: string;
    };
  };

  // Resolve Coral tools we need
  const waitToolEntry = findTool(coralTools as any, [
    "wait_for_mentions",
    "wait-for-mentions",
    "waitForMentions",
  ]);
  const sendToolEntry = findTool(coralTools as any, [
    "send_message",
    "send-message",
    "sendMessage",
  ]);

  if (!waitToolEntry || !sendToolEntry) {
    console.error(
      "Required Coral tools not found.",
      "Available:",
      listToolKeys(coralTools),
    );
    return;
  }

  console.log(
    `Resolved Coral tools: wait='${waitToolEntry.key}', send='${sendToolEntry.key}'`,
  );

  console.log("Connection established. Starting manual loop...");

  while (true) {
    try {
      // 1) Block for mentions
      const mentionResult = await invokeTool(waitToolEntry.tool, { timeoutMs: 30000 });
      const mentions = Array.isArray(mentionResult)
        ? mentionResult
        : mentionResult
          ? [mentionResult]
          : [];

      if (mentions.length === 0) {
        await sleep(100);
        continue;
      }

      for (const m of mentions) {
        const { threadId, senderId, content } = extractMention(m);
        if (!threadId || !senderId) {
          console.warn("Received mention without routing identifiers:", m);
          continue;
        }

        let answer = "";
        try {
          const generated = await localExecutionAgent.generate(
            typeof content === "string" ? content : JSON.stringify(content ?? {}),
          );
          // Agent.generate returns a string; if not, stringify
          answer = typeof generated === "string" ? generated : JSON.stringify(generated);
        } catch (e) {
          console.error("Error generating response from local agent:", e);
          answer = `error: ${(e as Error).message}`;
        }

        // 2) Try to send response back with schema fallbacks
        const payloads = [
          { threadId, recipientId: senderId, content: answer },
          { thread_id: threadId, recipient_id: senderId, content: answer },
          { threadId, to: senderId, content: answer },
        ];

        let sent = false;
        for (const p of payloads) {
          try {
            await invokeTool(sendToolEntry.tool, p);
            sent = true;
            break;
          } catch (e) {
            // try next shape
          }
        }
        if (!sent) {
          console.error("Failed to send message with all payload shapes", {
            threadId,
            senderId,
          });
        }
      }

      await sleep(2000);
    } catch (err) {
      console.error("Error in manual loop:", err);
      await sleep(5000);
    }
  }
}

// Graceful shutdown
main().catch((e) => {
  console.error(e);
  process.exit(1);
});



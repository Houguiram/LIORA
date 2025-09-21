import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";

import { createOllama } from "ollama-ai-provider";
import { bestPracticeTool } from "../tools/best-practice-tool";
import { genaiExecutionTool } from "../tools/genai-execution-tool";
import { IS_OFFLINE } from "../../utils/offline";

const OLLAMA_HOST = "localhost";
const ollama = createOllama({
  baseURL: `http://${OLLAMA_HOST}:11434/api`,
});
const modelId = "llama3.2";
const localModel = ollama.chat(modelId, { simulateStreaming: true });
const onlineModel = openai("gpt-5");

const model = IS_OFFLINE ? localModel : onlineModel;

export const genAiAgent = new Agent({
  name: "GenAI Agent",
  instructions: `
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
`,
  model,
  tools: { bestPracticeTool, genaiExecutionTool },
  memory: new Memory({
    storage: new LibSQLStore({
      url: "file:../mastra.db", // path is relative to the .mastra/output directory
    }),
  }),
});

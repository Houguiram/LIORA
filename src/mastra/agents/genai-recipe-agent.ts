import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { weatherTool } from "../tools/weather-tool";

import { createOllama } from "ollama-ai-provider";
import { bestPracticeTool } from "../tools/best-practice-tool";

const OLLAMA_HOST = "localhost";
// const OLLAMA_HOST = process.env.OLLAMA_HOST

const ollama = createOllama({
  baseURL: `http://${OLLAMA_HOST}:11434/api`,
});

// const modelId = "deepseek-r1:8b";
const modelId = "llama3.2";
const model = ollama.chat(modelId, { simulateStreaming: true });

export const genAiRecipeAgent = new Agent({
  name: "GenAI Recipe Agent",
  instructions: `
  You are an expert at picking the right tool for the job to generate images and videos using AI.

  Users will provide you with their prompt, which is what they are trying to generate.
  Your goal is to pick the right model and produce an optimised prompt for it to
  generate high-quality images and videos using AI
  models that can produce realistic, engaging, and relevant visual content.

  - Identify the best AI model for generating visual content based on the
  characteristics of the desired output (e.g. realism, style, complexity).
  - Optimize the input to the chosen model to achieve the desired output quality.
  - Consider the strengths and limitations of different AI models, including their
  requirements for data, processing time, and computational resources.

  The process should involve:
  1. Understanding the user's prompt and requirements.
  2. Retrieving relevant information about the best performing models for
  generating visual content (e.g. characteristics, strengths, limitations).
  3. Identifying the optimal model and input parameters for achieving high-quality
  output.
  4. Generating an optimized prompt or input that will elicit a desired response
  from the chosen model.

  The output should be a JSON object containing the chosen model and the optimised prompt, that the user can use to generate an image or video that meets the user's
  requirements and preferences.
`,
  // model: openai("gpt-4o-mini"),
  model,
  tools: { bestPracticeTool },
  memory: new Memory({
    storage: new LibSQLStore({
      url: "file:../mastra.db", // path is relative to the .mastra/output directory
    }),
  }),
});

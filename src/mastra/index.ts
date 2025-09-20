import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";
import { genAiRecipeAgent } from "./agents/genai-recipe-agent";
import { genAiAgent } from "./agents/genai-agent";

export const mastra = new Mastra({
  workflows: {},
  agents: { genAiRecipeAgent, genAiAgent },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
});

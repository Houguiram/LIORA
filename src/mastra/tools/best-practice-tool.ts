import { createTool } from "@mastra/core/tools";
import { Effect } from "effect";
import { z } from "zod";
import {
  BestPracticeService,
  BestPracticeServiceLive,
  BestPracticeServiceMock,
} from "../../effects/best-practice-service";

// Choose implementation here
const USE_MOCK = true;

export const bestPracticeTool = createTool({
  id: "get-best-practices",
  description: "Get relevant best practices for a GenAI prompt",
  inputSchema: z.object({
    prompt: z.string().describe("GenAI prompt"),
  }),
  outputSchema: z.object({
    bestPractices: z.array(
      z.object({
        insight: z.string(),
        relevantModels: z.array(z.string()),
      }),
    ),
  }),
  execute: async ({ context }) => {
    const service = USE_MOCK
      ? BestPracticeServiceMock
      : BestPracticeServiceLive;

    const program = getBestPracticeRunnable(context.prompt).pipe(
      Effect.provideService(BestPracticeService, service),
    );

    return await Effect.runPromise(program);
  },
});

const getBestPracticeRunnable = (prompt: string) =>
  Effect.gen(function* () {
    const service = yield* BestPracticeService;
    const response = yield* service.getRelevantForPrompt(prompt);
    const output = { bestPractices: response };
    return output;
  });

import { createTool } from "@mastra/core/tools";
import { Effect } from "effect";
import { z } from "zod";
import {
  BestPracticeService,
  BestPracticeServiceLive,
  BestPracticeServiceMock,
} from "../../effects/best-practice-service";
import { IS_OFFLINE } from "../../utils/offline";

export const bestPracticeTool = createTool({
  id: "get-best-practices",
  description: "Get relevant best practices for a GenAI prompt",
  inputSchema: z.object({
    prompt: z.string().describe("GenAI prompt"),
  }),
  outputSchema: z.object({
    error: z.string().optional(),
    bestPractices: z.array(
      z.object({
        insight: z.string(),
        relevantModels: z.array(z.string()),
      })
    ),
  }),
  execute: async ({ context }) => {
    const service = IS_OFFLINE
      ? BestPracticeServiceMock
      : BestPracticeServiceLive;
    const _service = BestPracticeServiceMock;

    const program = getBestPracticeRunnable(context.prompt).pipe(
      Effect.tap((output) =>
        Effect.log(
          `Got best practices: { prompt: "${context.prompt}", bestPractices: "${JSON.stringify(output, null, 2)}"`
        )
      ),
      Effect.provideService(BestPracticeService, service)
    );

    return await Effect.runPromise(program);
  },
});

const getBestPracticeRunnable = (prompt: string) =>
  Effect.gen(function* () {
    const service = yield* BestPracticeService;
    const response = yield* service.getRelevantForPrompt(prompt).pipe(
      Effect.catchAll((err) => {
        return Effect.succeed({ error: err.message });
      })
    );
    const isError = "error" in response;
    if (isError) {
      return { error: response.error, bestPractices: [] };
    }
    const output = { bestPractices: response };
    return output;
  });

import { createTool } from "@mastra/core/tools";
import { Effect } from "effect";
import { z } from "zod";
import { FalService, FalServiceLive, FalServiceMock } from "../../effects/fal-service";
import { IS_OFFLINE } from "../../utils/offline";

export const falGenerationTool = createTool({
  id: "fal-generate",
  description: "Generate images or videos using fal.ai models",
  inputSchema: z.object({
    model: z.string().describe("fal.ai endpoint ID, e.g. 'fal-ai/flux/dev'"),
    prompt: z.string().describe("User prompt for generation"),
    input: z
      .record(z.string(), z.any())
      .optional()
      .describe("Extra input fields specific to the model, merged with prompt"),
  }),
  outputSchema: z.object({
    error: z.string().optional(),
    requestId: z.string().optional(),
    data: z.any().optional(),
  }),
  execute: async ({ context }) => {
    const service = IS_OFFLINE ? FalServiceMock : FalServiceLive;

    const program = generateRunnable(context.model, context.prompt, context.input).pipe(
      Effect.tap((output) =>
        Effect.log(
          `fal.ai generation: { model: "${context.model}", prompt: "${context.prompt}", output: ${safeStringify(output)} }`,
        ),
      ),
      Effect.provideService(FalService, service),
    );

    return await Effect.runPromise(program);
  },
});

const generateRunnable = (
  model: string,
  prompt: string,
  extra?: Record<string, unknown>,
) =>
  Effect.gen(function* () {
    const service = yield* FalService;
    const response = yield* service
      .generate(model, prompt, extra)
      .pipe(
        Effect.catchAll((err) => Effect.succeed({ error: err.message })),
      );
    const isError = "error" in (response as any);
    if (isError) {
      return response as { error: string };
    }
    return response;
  });

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return "<non-serializable>";
  }
};



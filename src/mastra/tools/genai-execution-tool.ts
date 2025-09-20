import { createTool } from "@mastra/core/tools";
import { Effect } from "effect";
import { z } from "zod";
import { GenAiService, GenAiServiceLive, resolveFalEndpoint } from "../../effects/genai-service";
import { FalService, FalServiceLive, FalServiceMock } from "../../effects/fal-service";
import { IS_OFFLINE } from "../../utils/offline";

export const genaiExecutionTool = createTool({
  id: "genai-execute",
  description: "Generate images or videos using a generic model name",
  inputSchema: z.object({
    model: z.string().describe("Generic model name, e.g. 'nano banana' or 'flux dev'"),
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
    resolvedModel: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const falServiceImpl = IS_OFFLINE ? FalServiceMock : FalServiceLive;
    const program = generateRunnable(context.model, context.prompt, context.input)
      .pipe(
        Effect.tap((output) =>
          Effect.log(
            `genai execution: { model: "${context.model}", resolved: "${resolveFalEndpoint(context.model)}", prompt: "${context.prompt}", output: ${safeStringify(output)} }`,
          ),
        ),
        Effect.provideService(FalService, falServiceImpl),
        Effect.provideService(GenAiService, GenAiServiceLive),
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
    const service = yield* GenAiService;
    const resolvedModel = resolveFalEndpoint(model);
    const response = yield* service
      .generate(model, prompt, extra)
      .pipe(Effect.catchAll((err) => Effect.succeed({ error: err.message, resolvedModel })));
    const isError = "error" in (response as any);
    if (isError) {
      return response as { error: string; resolvedModel: string };
    }
    return { ...response, resolvedModel };
  });

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return "<non-serializable>";
  }
};



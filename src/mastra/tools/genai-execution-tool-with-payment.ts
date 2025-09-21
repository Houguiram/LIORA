import { createTool } from "@mastra/core/tools";
import { Effect } from "effect";
import { z } from "zod";
import { GenAiService, GenAiServiceLive, resolveFalEndpoint } from "../../effects/genai-service";
import { FalService, FalServiceLive, FalServiceMock } from "../../effects/fal-service";
import { IS_OFFLINE } from "../../utils/offline";
import { PaymentService, PaymentServiceLive } from "../../effects/payment-service";

export const genaiExecutionToolWithPayment = createTool({
  id: "genai-execute",
  description: "Generate images or videos using a generic model name",
  inputSchema: z.object({
    model: z.string().describe("Generic model name, e.g. 'nano banana' or 'flux dev'"),
    prompt: z.string().describe("User prompt for generation"),
    outputType: z.enum(["image", "video"]).describe("Expected type of output: 'image' or 'video'"),
    imageUrl: z.string().optional().describe("Optional image URL for image-to-video or image-to-image generation"),
  }),
  outputSchema: z.object({
    error: z.string().optional(),
    requestId: z.string().optional(),
    data: z.any().optional(),
    resolvedModel: z.string().optional(),
  }),
  execute: async ({ context }) => {
    console.log("genai execution tool", context);
    const falServiceImpl = IS_OFFLINE ? FalServiceMock : FalServiceLive;
    const program = generateRunnable(context.model, context.prompt, context.outputType, context.imageUrl)
      .pipe(
        Effect.tap((output) =>
          Effect.log(
            `genai execution: { model: "${context.model}", resolved: "${resolveFalEndpoint(context.model, context.outputType, Boolean(context.imageUrl))}", prompt: "${context.prompt}", outputType: "${context.outputType}", imageUrl: "${context.imageUrl || 'none'}", output: ${safeStringify(output)} }`,
          ),
        ),
        Effect.provideService(FalService, falServiceImpl),
        Effect.provideService(GenAiService, GenAiServiceLive),
        Effect.provideService(PaymentService, PaymentServiceLive),
      );
    return await Effect.runPromise(program);
  },
});

const generateRunnable = (
  model: string,
  prompt: string,
  outputType: "image" | "video",
  imageUrl?: string,
) =>
  Effect.gen(function* () {
    const service = yield* GenAiService;
    const resolvedModel = resolveFalEndpoint(model, outputType, Boolean(imageUrl));
    const response = yield* service
      .generate(model, prompt, outputType, imageUrl)
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



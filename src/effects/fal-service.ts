import { Effect, Context } from "effect";
import { fal } from "@fal-ai/client";
import { IS_OFFLINE } from "../utils/offline";

export interface FalGenerationResult {
  requestId: string;
  data: unknown;
}

export interface FalServiceShape {
  readonly generate: (
    model: string,
    prompt: string,
    extraInput?: Record<string, unknown>,
  ) => Effect.Effect<FalGenerationResult, Error>;
}

export class FalService extends Context.Tag("FalService")<
  FalService,
  FalServiceShape
>() {}

const assumeNeverEffect = <A>(_value: never): Effect.Effect<A, Error> => {
  const errorMessage = "Unknown error";
  return Effect.logError(errorMessage).pipe(
    Effect.andThen(() => Effect.fail(new Error(errorMessage)))
  );
};

export const FalServiceMock: FalServiceShape = {
  generate: (model, prompt, extraInput) =>
    Effect.succeed({
      requestId: "mock-request-id",
      data: {
        model,
        input: { prompt, ...(extraInput ?? {}) },
        mockedAssets: [
          { kind: "image", url: "https://placekitten.com/1024/768" },
          {
            kind: "video",
            url:
              "https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4",
          },
        ],
      },
    }),
};

export const FalServiceLive: FalServiceShape = {
  generate: (model, prompt, extraInput) =>
    Effect.gen(function* () {
      // Config check similar to repository layer but inline here
      const FAL_KEY = process.env.FAL_KEY ?? "TODO_FAL_KEY";
      if (!FAL_KEY || FAL_KEY.includes("TODO")) {
        const msg = "[ConfigurationError] Missing config: FAL_KEY";
        return yield* Effect.logError(msg).pipe(
          Effect.andThen(() => Effect.fail(new Error(msg))),
        );
      }

      const result = yield* Effect.tryPromise({
        try: async () => {
          const res = await fal.subscribe(model, {
            input: { prompt, ...(extraInput ?? {}) },
            logs: true,
          });
          return { requestId: res.requestId, data: res.data } as FalGenerationResult;
        },
        catch: (error) => new Error(`[FalRequestError] ${getErrorMessage(error)}`),
      });
      return result;
    }),
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);



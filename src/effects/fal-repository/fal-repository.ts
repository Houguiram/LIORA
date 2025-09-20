import { Effect, Context } from "effect";
import { TaggedError } from "effect/Data";
import { fal } from "@fal-ai/client";

export interface FalGenerationResult {
  requestId: string;
  data: unknown;
}

class ConfigurationError extends TaggedError("ConfigurationError")<{
  missing: string[];
}> {}

class FalRequestError extends TaggedError("FalRequestError")<{
  message: string;
}> {}

export type FalRepositoryError = ConfigurationError | FalRequestError;

export interface FalRepositoryShape {
  readonly run: (
    model: string,
    input: Record<string, unknown>,
  ) => Effect.Effect<FalGenerationResult, FalRepositoryError>;
}

export class FalRepository extends Context.Tag(
  "FalRepository",
)<FalRepository, FalRepositoryShape>() {}

const FAL_KEY = process.env.FAL_KEY ?? "TODO_FAL_KEY";

const ensureConfiguration: Effect.Effect<void, ConfigurationError> = Effect.gen(
  function* () {
    const missing: string[] = [];
    if (!FAL_KEY || FAL_KEY.includes("TODO")) missing.push("FAL_KEY");
    if (missing.length > 0) {
      return yield* Effect.fail(new ConfigurationError({ missing }));
    }
  },
).pipe(Effect.tap(() => Effect.log("Ensured valid fal.ai configuration")));

export const FalRepositoryLive: FalRepositoryShape = {
  run: (model, input) =>
    Effect.gen(function* () {
      yield* ensureConfiguration;
      const result = yield* Effect.tryPromise({
        try: async () => {
          const res = await fal.subscribe(model, {
            input,
            logs: true,
          });
          return { requestId: res.requestId, data: res.data } satisfies FalGenerationResult;
        },
        catch: (error) =>
          new FalRequestError({ message: getErrorMessage(error) }),
      });
      return result;
    }),
};

export const FalRepositoryMock: FalRepositoryShape = {
  run: (model, input) =>
    Effect.succeed({
      requestId: "mock-request-id",
      data: {
        model,
        input,
        mockedAssets: [
          {
            kind: "image",
            url: "https://placekitten.com/1024/768",
          },
          {
            kind: "video",
            url: "https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4",
          },
        ],
      },
    }),
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);



import { Effect, Context } from "effect";
import {
  FalRepository,
  FalRepositoryLive,
  FalRepositoryMock,
  type FalGenerationResult,
} from "./fal-repository/fal-repository";
import { IS_OFFLINE } from "../utils/offline";

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
    Effect.provideService(FalRepository, FalRepositoryMock)(
      FalRepositoryMock.run(model, { prompt, ...(extraInput ?? {}) })
    ),
};

export const FalServiceLive: FalServiceShape = {
  generate: (model, prompt, extraInput) =>
    Effect.gen(function* () {
      const repository = yield* FalRepository;
      const result = yield* repository
        .run(model, { prompt, ...(extraInput ?? {}) })
        .pipe(
          Effect.catchAll((err) => {
            switch ((err as { _tag?: string })._tag) {
              case "ConfigurationError": {
                const msg = "[ConfigurationError] Missing config for fal.ai";
                return Effect.logError(msg).pipe(
                  Effect.andThen(() => Effect.fail(new Error(msg)))
                );
              }
              case "FalRequestError": {
                const msg = "[FalRequestError] " + (err as any).message;
                return Effect.logError(msg).pipe(
                  Effect.andThen(() => Effect.fail(new Error(msg)))
                );
              }
              default:
                return assumeNeverEffect<FalGenerationResult>(err as never);
            }
          }),
        );
      return result;
    }).pipe(
      Effect.provideService(
        FalRepository,
        IS_OFFLINE ? FalRepositoryMock : FalRepositoryLive,
      ),
    ),
};



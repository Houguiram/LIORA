import { Effect, Context } from "effect";
import {
  BestPracticeRepository,
  BestPracticeRepositoryLive,
} from "./best-practice-repository";
export interface BestPractice {
  insight: string;
  relevantModels: string[];
}
interface BestPracticeServiceShape {
  readonly getRelevantForPrompt: (
    prompt: string
  ) => Effect.Effect<BestPractice[], Error>;
}
export class BestPracticeService extends Context.Tag("BestPracticeService")<
  BestPracticeService,
  BestPracticeServiceShape
>() {}

// Type-safe "assume never" for exhaustive checks returning an Effect
const assumeNeverEffect = <A>(_value: never): Effect.Effect<A, Error> => {
  const errorMessage = "Unknown error";
  return Effect.logError(errorMessage).pipe(
    Effect.andThen(() => Effect.fail(new Error(errorMessage)))
  );
};

export const BestPracticeServiceMock: BestPracticeServiceShape = {
  getRelevantForPrompt: (_prompt: string) =>
    Effect.succeed([
      {
        insight:
          "Midjourney v7 is the best at all types of images at the moment.",
        relevantModels: ["midjourney-v7"],
      },
      {
        insight:
          'Midjourney v7 gives the best results when prompted in a JSON format like { "subject": "tea pot", "lighting": "bright outdoor", ... }',
        relevantModels: ["midjourney-v7"],
      },
    ]),
};

export const BestPracticeServiceLive: BestPracticeServiceShape = {
  getRelevantForPrompt: (_prompt: string) =>
    Effect.gen(function* () {
      const repository = yield* BestPracticeRepository;
      const output = yield* repository.getAll(); //TODO: add smarter logic
      return output;
    }).pipe(
      Effect.provideService(BestPracticeRepository, BestPracticeRepositoryLive),
      Effect.catchAll((err) => {
        switch (err._tag) {
          case "ConfigurationError": {
            const errorMessage =
              "[ConfigurationError] Missing config: " + err.missing.join(", ");
            return Effect.logError(errorMessage).pipe(
              Effect.andThen(() => Effect.fail(new Error(errorMessage)))
            );
          }
          case "NotionQueryError": {
            const errorMessage = "[NotionQueryError] " + err.message;
            return Effect.logError(errorMessage).pipe(
              Effect.andThen(() => Effect.fail(new Error(errorMessage)))
            );
          }
          default:
            return assumeNeverEffect<BestPractice[]>(err);
        }
      })
    ),
};

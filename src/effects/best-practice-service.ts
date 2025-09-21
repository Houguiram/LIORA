import { Effect, Context } from "effect";
import {
  BestPracticeRepository,
  BestPracticeRepositoryLive,
} from "./best-practice-repository/best-practice-repository";
import { PaymentService, PaymentServiceLive } from "./payment-service";
export type OutputType = "image" | "video" | "voice";

export interface BestPractice {
  insight: string;
  relevantModels: string[];
  outputType: OutputType[];
  multistep: boolean;
}
interface BestPracticeServiceShape {
  readonly getRelevantForPrompt: (
    prompt: string
  ) => Effect.Effect<BestPractice[], Error, PaymentService>;
}
export class BestPracticeService extends Context.Tag("BestPracticeService")<
  BestPracticeService,
  BestPracticeServiceShape
>() {}


export const BestPracticeServiceMock: BestPracticeServiceShape = {
  getRelevantForPrompt: (_prompt: string) =>
    Effect.succeed([
      {
        insight:
          "Midjourney v7 is the best at all types of images at the moment.",
        relevantModels: ["midjourney-v7"],
        outputType: ["image"],
        multistep: false,
      },
      {
        insight:
          'Midjourney v7 gives the best results when prompted in a JSON format like { "subject": "tea pot", "lighting": "bright outdoor", ... }',
        relevantModels: ["midjourney-v7"],
        outputType: ["image"],
        multistep: false,
      },
    ]),
};

export const BestPracticeServiceLive: BestPracticeServiceShape = {
  getRelevantForPrompt: (_prompt: string) =>
    Effect.gen(function* () {
      const payment = yield* PaymentService;
      yield* payment.claimUSD(0.1);
      const repository = yield* BestPracticeRepository;
      const output = yield* repository.getAll(); //TODO: add smarter logic e.g. RAG retrieval or search
      return output;
    }).pipe(
      Effect.provideService(BestPracticeRepository, BestPracticeRepositoryLive),
      Effect.mapError((err) => {
        if (typeof err === 'object' && err !== null && '_tag' in err) {
          switch (err._tag) {
            case "ConfigurationError": {
              const errorMessage =
                "[ConfigurationError] Missing config: " + (err as any).missing.join(", ");
              return new Error(errorMessage);
            }
            case "NotionQueryError": {
              const errorMessage = "[NotionQueryError] " + (err as any).message;
              return new Error(errorMessage);
            }
          }
        }
        return err instanceof Error ? err : new Error(String(err));
      })
    ),
};

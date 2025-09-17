import { Effect, Context, pipe } from "effect";
export interface BestPractice {
  insight: string;
  relevantModels: string[];
}
interface BestPracticeServiceShape {
  readonly getRelevantForPrompt: (
    prompt: string,
  ) => Effect.Effect<BestPractice[]>;
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
      },
      {
        insight:
          'Midjourney v7 gives the best results when prompted in a JSON format like { "subject": "tea pot", "lighting": "bright outdoor", ... }',
        relevantModels: ["midjourney-v7"],
      },
    ]),
};

export const BestPracticeServiceLive: BestPracticeServiceShape = {
  //@ts-ignore -- To be implemented
  getRelevantForPrompt: (_prompt: string) => Effect.fail("Not implemented"),
};

// export const BestPracticeServiceLive: BestPracticeServiceShape = {
//   // TODO
//   // 1. Identify prompt characteristics
//   // 2. Find relevant best practices
//   getRelevantForPrompt: (prompt: string) =>
//     Effect.gen(function* () {
//       const promptCharacteristics = yield* identifyCharacteristics(prompt);
//       const relevantBestPractices = yield* matchBestPractices({
//         prompt,
//         characteristics: promptCharacteristics,
//       });
//       return relevantBestPractices;
//     }),
// };

const identifyCharacteristics = (prompt: string) =>
  Effect.fail("Not implemented"); //TODO: call LLM to extract characteristics

const matchBestPractices = (args: {
  prompt: string;
  characteristics: string[];
}) => Effect.fail("Not implemented"); //TODO: RAG

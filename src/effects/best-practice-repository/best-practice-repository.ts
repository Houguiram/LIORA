import { Effect, Context } from "effect";
import { TaggedError } from "effect/Data";
import { NotionBestPracticeRepository } from "./notion-repository";

export type OutputType = "image" | "video" | "voice";

export interface BestPractice {
  insight: string;
  relevantModels: string[];
  outputType: OutputType[];
  multistep: boolean;
}
class ConfigurationError extends TaggedError("ConfigurationError")<{
  missing: string[];
}> {}

class NotionQueryError extends TaggedError("NotionQueryError")<{
  message: string;
}> {}

type BestPracticeRepositoryError = ConfigurationError | NotionQueryError;

export interface BestPracticeRepositoryShape {
  readonly getAll: () => Effect.Effect<BestPractice[], BestPracticeRepositoryError>;
  readonly search: (query: string) => Effect.Effect<BestPractice[], BestPracticeRepositoryError>;
}
export class BestPracticeRepository extends Context.Tag(
  "BestPracticeRepository",
)<BestPracticeRepository, BestPracticeRepositoryShape>() {}

export const BestPracticeRepositoryMock: BestPracticeRepositoryShape = {
  getAll: () => Effect.succeed(mockValues),
  search: (_query) => Effect.succeed(mockValues),
};
const mockValues: BestPractice[] = [
  {
    insight: "Midjourney v7 is the best at all types of images at the moment.",
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
];

export const BestPracticeRepositoryLive: BestPracticeRepositoryShape = NotionBestPracticeRepository;


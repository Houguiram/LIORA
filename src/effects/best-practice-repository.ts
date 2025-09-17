import { Effect, Context, pipe } from "effect";
export interface BestPractice {
  insight: string;
  relevantModels: string[];
}
interface BestPracticeRepositoryShape {
  readonly getAll: () => Effect.Effect<BestPractice[]>;
  readonly search: (query: string) => Effect.Effect<BestPractice[]>;
}
export class BestPracticeRepository extends Context.Tag(
  "BestPracticeRepository",
)<BestPracticeRepository, BestPracticeRepositoryShape>() {}

export const BestPracticeRepositoryMock: BestPracticeRepositoryShape = {
  getAll: () => Effect.succeed(mockValues),
  search: (_query) => Effect.succeed(mockValues),
};

//TODO: Implement with external source that's easily editable. Notion DB? Google Sheets? Custom Convex backend with custom UI?
export const BestPracticeRepositoryLive: BestPracticeRepositoryShape = {
  getAll: () => Effect.succeed(mockValues),
  search: (_query) => Effect.succeed(mockValues),
};

const mockValues: BestPractice[] = [
  {
    insight: "Midjourney v7 is the best at all types of images at the moment.",
    relevantModels: ["midjourney-v7"],
  },
  {
    insight:
      'Midjourney v7 gives the best results when prompted in a JSON format like { "subject": "tea pot", "lighting": "bright outdoor", ... }',
    relevantModels: ["midjourney-v7"],
  },
];

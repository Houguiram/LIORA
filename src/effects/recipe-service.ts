import { Effect, Context, pipe } from "effect";
import { BestPractice } from "./best-practice-service";

export interface Recipe {
  steps: Array<{
    index: number;
    dependencies: number[];
    model: string;
    optimisedPrompt: string;
  }>;
}

interface RecipeServiceShape {
  readonly generate: (args: {
    prompt: string;
    bestPractices: BestPractice[];
  }) => Effect.Effect<Recipe>;
}
export class RecipeService extends Context.Tag("RecipeService")<
  RecipeService,
  RecipeServiceShape
>() {}

export const RecipeServiceMock: RecipeServiceShape = {
  generate: (_args) =>
    Effect.succeed({
      steps: [
        {
          index: 0,
          dependencies: [],
          model: "FAKE_MODEL",
          optimisedPrompt: "FAKE PROMPT",
        },
      ],
    }),
};

export const RecipeServiceLive: RecipeServiceShape = {
  // TODO
  // 3. Generate a recipe
  // 4. Generate prompts for each step
  //@ts-ignore -- To be implemented
  generate: (_args) => Effect.fail("Not implemented"), //TODO
};

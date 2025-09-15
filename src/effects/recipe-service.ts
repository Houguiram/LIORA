import { Effect, Context, pipe } from "effect";
import { BestPractice } from "./best-practice-service";

export interface Recipe {
  prompt: string; //TODO: Set proper shape for recipe
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
  generate: (_args) => Effect.succeed({ prompt: "FAKE" }),
};

export const RecipeServiceLive: RecipeServiceShape = {
  // TODO
  // 3. Generate a recipe
  // 4. Generate prompts for each step
  generate: (_args) => Effect.succeed({ prompt: "FAKE" }), //TODO
};

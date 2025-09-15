import { Effect, Context, pipe } from "effect";

// Workflow strategy 1
// 1. Identify prompt characteristics
// 2. Find relevant best practices
// 3. Create multiple relevant recipes
// 4. Pick best recipe
// 5. Generate prompts for each step
//
// Workflow strategy 2 (simpler, one shot LLM)
// 1. Identify prompt characteristics
// 2. Find relevant best practices
// 3. Generate a recipe
// 4. Generate prompts for each step
//
// Structure / services
// 1. Find best practices relevant for prompt (BestPracticeService.getRelevantForPrompt(prompt))
// 2. Generate a recipe with steps and optimised prompts (RecipeService.generate(prompt, bestPractices))

export interface BestPractice {
  insight: string;
  relevantModels: string[];
}
export interface Recipe {
  prompt: string; //TODO
}

export interface BestPracticeServiceShape {
  readonly getRelevantForPrompt: (
    prompt: string,
  ) => Effect.Effect<BestPractice[]>;
}
export class BestPracticeService extends Context.Tag("BestPracticeService")<
  BestPracticeService,
  BestPracticeServiceShape
>() {}

export interface RecipeServiceShape {
  readonly generate: (args: {
    prompt: string;
    bestPractices: BestPractice[];
  }) => Effect.Effect<Recipe>;
}
export class RecipeService extends Context.Tag("RecipeService")<
  RecipeService,
  RecipeServiceShape
>() {}

export const recipeAgentWorkflow = async (userPrompt: string) => {
  const program = Effect.gen(function* () {
    const bestPracticeService = yield* BestPracticeService;
    const recipeService = yield* RecipeService;

    const relevantBestPractices =
      yield* bestPracticeService.getRelevantForPrompt(userPrompt);
    const recipe = yield* recipeService.generate({
      prompt: userPrompt,
      bestPractices: relevantBestPractices,
    });
    return recipe;
  });
  const runnable = pipe(
    program,
    Effect.provideService(BestPracticeService, {
      getRelevantForPrompt: (_prompt: string) => Effect.succeed([]), //TODO
    }),
    Effect.provideService(RecipeService, {
      generate: (_args) => Effect.succeed({ prompt: "FAKE" }), //TODO
    }),
  );
  const recipe = await Effect.runPromise(runnable);
};

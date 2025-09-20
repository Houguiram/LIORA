import { Effect, Context } from "effect";
import { FalService } from "./fal-service";

export interface GenAiServiceShape {
  readonly generate: (
    modelName: string,
    prompt: string,
  ) => Effect.Effect<{
    requestId: string;
    data: unknown;
  }, Error, FalService>;
}

export class GenAiService extends Context.Tag("GenAiService")<
  GenAiService,
  GenAiServiceShape
>() {}

export const DEFAULT_FAL_ENDPOINT = "fal-ai/flux/dev";

// Curated list of valid fal.ai generation endpoints.
const VALID_FAL_ENDPOINTS = [
  "fal-ai/nano-banana",
  "fal-ai/veo3",
  "fal-ai/bytedance/seedream/v4/text-to-image",
  "fal-ai/kling-video/v2/master/text-to-video",
  "fal-ai/ideogram/v3",
] as const;

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/fal-ai\//g, " ")
    .replace(/[\/_]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");

const levenshtein = (a: string, b: string): number => {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[a.length][b.length];
};

const tokenOverlap = (a: string, b: string): number => {
  const ta = new Set(a.split("-"));
  const tb = new Set(b.split("-"));
  let overlap = 0;
  ta.forEach((t) => {
    if (tb.has(t)) overlap++;
  });
  return overlap;
};

export const resolveFalEndpoint = (modelName: string): string => {
  const input = normalize(modelName);
  let best = DEFAULT_FAL_ENDPOINT;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const endpoint of VALID_FAL_ENDPOINTS) {
    const candidate = normalize(endpoint);
    const distance = levenshtein(input, candidate);
    const overlap = tokenOverlap(input, candidate);
    const score = overlap * 10 - distance; // favor token matches strongly
    if (score > bestScore) {
      bestScore = score;
      best = endpoint;
    }
  }

  return best;
};

export const GenAiServiceLive: GenAiServiceShape = {
  generate: (modelName, prompt) =>
    Effect.gen(function* () {
      const fal = yield* FalService;
      const endpoint = resolveFalEndpoint(modelName);
      const result = yield* fal.generate(endpoint, prompt);
      return result;
    }),
};



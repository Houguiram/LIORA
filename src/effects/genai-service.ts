import { Effect, Context } from "effect";
import { FalService } from "./fal-service";
import { PaymentService } from "./payment-service";

export interface GenAiServiceShape {
  readonly generate: (
    modelName: string,
    prompt: string,
    outputType: "image" | "video",
    imageUrl?: string,
  ) => Effect.Effect<{
    requestId: string;
    data: unknown;
  }, Error, FalService | PaymentService>;
}

export class GenAiService extends Context.Tag("GenAiService")<
  GenAiService,
  GenAiServiceShape
>() {}

export const DEFAULT_FAL_ENDPOINT = "fal-ai/flux/dev";

// Curated list of valid fal.ai generation endpoints for text-to-image/video.
const VALID_TEXT_TO_ENDPOINTS = [
  "fal-ai/nano-banana",
  "fal-ai/veo3",
  "fal-ai/bytedance/seedream/v4/text-to-image",
  "fal-ai/kling-video/v2/master/text-to-video",
  "fal-ai/ideogram/v3",
  // "fal-ai/flux/dev",
] as const;

// Curated list of valid fal.ai endpoints for image-to-image generation.
const VALID_IMAGE_TO_IMAGE_ENDPOINTS = [
  "fal-ai/nano-banana/edit",
  "fal-ai/bytedance/seedream/v4/edit",
  "fal-ai/ideogram/v3/edit"
] as const;

// Curated list of valid fal.ai endpoints for image-to-video generation.
const VALID_IMAGE_TO_VIDEO_ENDPOINTS = [
  "fal-ai/kling-video/v2/master/image-to-video",
  "fal-ai/veo3/fast/image-to-video",
  "fal-ai/bytedance/seedance/v1/lite/reference-to-video",
  // "fal-ai/runway-gen3/turbo/image-to-video",
  // "fal-ai/luma-dream-machine/image-to-video",
  // "fal-ai/stable-video-diffusion",
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

export const resolveFalEndpoint = (
  modelName: string,
  outputType: "image" | "video",
  hasImageInput: boolean = false
): string => {
  const inputNormalized = normalize(modelName);
  if (inputNormalized.length === 0) return DEFAULT_FAL_ENDPOINT;

  const inputTokens = new Set(inputNormalized.split("-").filter(Boolean));

  // Select appropriate endpoint list based on input type and desired output
  const getEndpointList = () => {
    if (hasImageInput) {
      return outputType === "video" ? VALID_IMAGE_TO_VIDEO_ENDPOINTS : VALID_IMAGE_TO_IMAGE_ENDPOINTS;
    }
    return VALID_TEXT_TO_ENDPOINTS;
  };

  const validEndpoints = getEndpointList();

  // 1) Prefer endpoints that contain ALL input tokens (subset match)
  type Candidate = { endpoint: string; normalized: string; tokens: Set<string> };
  const candidates: Candidate[] = validEndpoints.map((endpoint) => {
    const normalized = normalize(endpoint);
    const tokens = new Set(normalized.split("-").filter(Boolean));
    return { endpoint, normalized, tokens };
  });

  const fullMatches = candidates.filter(({ tokens }) => {
    for (const token of inputTokens) {
      if (!tokens.has(token)) return false;
    }
    return true;
  });

  if (fullMatches.length > 0) {
    // Break ties by choosing the candidate with the fewest tokens,
    // then by smallest edit distance to keep results intuitive.
    fullMatches.sort((a, b) => {
      const tokenDiff = a.tokens.size - b.tokens.size;
      if (tokenDiff !== 0) return tokenDiff;
      return (
        levenshtein(inputNormalized, a.normalized) -
        levenshtein(inputNormalized, b.normalized)
      );
    });
    return fullMatches[0].endpoint;
  }

  // 2) Fallback: fuzzy match using overlap-weighted Levenshtein
  let best: string = validEndpoints.length > 0 ? validEndpoints[0] : DEFAULT_FAL_ENDPOINT;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const { endpoint, normalized } of candidates) {
    const distance = levenshtein(inputNormalized, normalized);
    const overlap = tokenOverlap(inputNormalized, normalized);
    const score = overlap * 25 - distance; // heavier weight on token overlap
    if (score > bestScore) {
      bestScore = score;
      best = endpoint;
    }
  }

  return best;
};

export const GenAiServiceLive: GenAiServiceShape = {
  generate: (modelName, prompt, outputType, imageUrl) =>
    Effect.gen(function* () {
      const payment = yield* PaymentService;
      yield* payment.claimUSD(0.3);
      const fal = yield* FalService;
      const hasImageInput = Boolean(imageUrl);
      const endpoint = resolveFalEndpoint(modelName, outputType, hasImageInput);
      const extraInput = imageUrl ? { image_url: imageUrl } : undefined;
      const result = yield* fal.generate(endpoint, prompt, extraInput);
      return result;
    }),
};



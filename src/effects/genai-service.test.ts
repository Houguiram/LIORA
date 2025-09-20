import { describe, it, expect } from "vitest";
import { resolveFalEndpoint } from "./genai-service";

describe("resolveFalEndpoint", () => {
  it("resolves 'Kling' to the kling video endpoint", () => {
    const endpoint = resolveFalEndpoint("Kling");
    expect(endpoint).toBe("fal-ai/kling-video/v2/master/text-to-video");
  });

  it("resolves 'nano banana' to the nano-banana endpoint", () => {
    const endpoint = resolveFalEndpoint("nano banana");
    expect(endpoint).toBe("fal-ai/nano-banana");
  });

  it("resolves 'veo3' to the veo3 endpoint", () => {
    const endpoint = resolveFalEndpoint("veo3");
    expect(endpoint).toBe("fal-ai/veo3");
  });

  it("resolves 'ideogram' to the ideogram v3 endpoint", () => {
    const endpoint = resolveFalEndpoint("ideogram");
    expect(endpoint).toBe("fal-ai/ideogram/v3");
  });
});



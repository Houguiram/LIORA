import { describe, it, expect } from "vitest";
import { resolveFalEndpoint } from "./genai-service";

describe("resolveFalEndpoint", () => {
  it("resolves 'Kling' to the kling video endpoint for text-to-video", () => {
    const endpoint = resolveFalEndpoint("Kling", "video", false);
    expect(endpoint).toBe("fal-ai/kling-video/v2/master/text-to-video");
  });

  it("resolves 'nano banana' to the nano-banana endpoint for text-to-image", () => {
    const endpoint = resolveFalEndpoint("nano banana", "image", false);
    expect(endpoint).toBe("fal-ai/nano-banana");
  });

  it("resolves 'veo3' to the veo3 endpoint for text-to-video", () => {
    const endpoint = resolveFalEndpoint("veo3", "video", false);
    expect(endpoint).toBe("fal-ai/veo3");
  });

  it("resolves 'ideogram' to the ideogram v3 endpoint for text-to-image", () => {
    const endpoint = resolveFalEndpoint("ideogram", "image", false);
    expect(endpoint).toBe("fal-ai/ideogram/v3");
  });

  it("resolves to image-to-image endpoint when image input is provided", () => {
    const endpoint = resolveFalEndpoint("flux", "image", true);
    expect(endpoint).toBe("fal-ai/flux/dev/image-to-image");
  });

  it("resolves to image-to-video endpoint when image input and video output are requested", () => {
    const endpoint = resolveFalEndpoint("kling", "video", true);
    expect(endpoint).toBe("fal-ai/kling-video/v2/master/image-to-video");
  });
});



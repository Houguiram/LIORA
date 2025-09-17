import { createTool } from "@mastra/core/tools";
import { Effect } from "effect";
import { z } from "zod";
import {
  Weather,
  WeatherSchema,
  weatherServiceLive,
  weatherServiceMock,
} from "../../effects/weather-service";
import { IS_OFFLINE } from "../../utils/offline";

export const weatherTool = createTool({
  id: "get-weather",
  description: "Get current weather for a location",
  inputSchema: z.object({
    location: z.string().describe("City name"),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    feelsLike: z.number(),
    humidity: z.number(),
    windSpeed: z.number(),
    windGust: z.number(),
    conditions: z.string(),
    location: z.string(),
  }),
  execute: async ({ context }) => {
    const location = (context as any).location as string; // tool runtime provides validated input on context
    const service = IS_OFFLINE ? weatherServiceMock : weatherServiceLive;

    const program = getWeatherRunnable(location).pipe(
      Effect.provideService(Weather, service),
    );

    return await Effect.runPromise(program);
  },
});

const getWeatherRunnable = (location: string) =>
  Effect.gen(function* () {
    const weatherService = yield* Weather;
    const weatherResponse = yield* weatherService.getWeather(location);
    return weatherResponse;
  });

// helper moved to effects; not needed here

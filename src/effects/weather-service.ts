import { Effect, Context } from "effect";
import { z } from "zod";

export interface WeatherSchema {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windGust: number;
  conditions: string;
  location: string;
}

// const weatherSchema = z.object({
//   temperature: z.number(),
//   feelsLike: z.number(),
//   humidity: z.number(),
//   windSpeed: z.number(),
//   windGust: z.number(),
//   conditions: z.string(),
//   location: z.string(),
// });
// const weatherType = weatherSchema //TODO: infer

// Declaring a tag for a service that generates random numbers
export class Weather extends Context.Tag("WeatherService")<
  Weather,
  { readonly getWeather: (location: string) => WeatherSchema } //TODO: this is broken
>() {}

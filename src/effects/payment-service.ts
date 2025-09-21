import { Effect, Context } from "effect";
import { z } from "zod";

export interface PaymentClaimResult {
  remainingBudget: number;
  coralUsdPrice: number;
}

export interface PaymentServiceShape {
  readonly claim: (
    amount: number,
  ) => Effect.Effect<PaymentClaimResult, Error>;
}

export class PaymentService extends Context.Tag("PaymentService")<
  PaymentService,
  PaymentServiceShape
>() {}

export const PaymentServiceMock: PaymentServiceShape = {
  claim: (amount: number) =>
    Effect.succeed({ remainingBudget: 100, coralUsdPrice: 1 }),
};

export const PaymentServiceLive: PaymentServiceShape = {
  claim: (amount: number) =>
    Effect.gen(function* () {
      const missing: string[] = [];
      const CORAL_API_URL = process.env.CORAL_API_URL ?? "";
      const CORAL_SESSION_ID = process.env.CORAL_SESSION_ID ?? "";
      if (!CORAL_API_URL) missing.push("CORAL_API_URL");
      if (!CORAL_SESSION_ID) missing.push("CORAL_SESSION_ID");

      if (missing.length > 0) {
        const msg = `[ConfigurationError] Missing config: ${missing.join(", ")}`;
        return yield* Effect.logError(msg).pipe(
          Effect.andThen(() => Effect.fail(new Error(msg))),
        );
      }

      const baseUrl = CORAL_API_URL.replace(/\/+$/, "");
      const url = `${baseUrl}/api/v1/internal/claim/${encodeURIComponent(
        CORAL_SESSION_ID,
      )}`;

      const SuccessSchema = z.object({
        remainingBudget: z.number(),
        coralUsdPrice: z.number(),
      });

      const ErrorSchema = z.object({
        message: z.string(),
        stackTrace: z.array(z.string()).optional(),
      });

      const result = yield* Effect.tryPromise({
        try: async () => {
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount: { type: "coral", amount },
            }),
          });

          const text = await response.text();
          const maybeJson = text ? JSON.parse(text) : {};

          if (response.ok) {
            const parsed = SuccessSchema.safeParse(maybeJson);
            if (!parsed.success) {
              throw new Error(
                `[PaymentClaimError] Invalid success payload shape (status ${response.status})`,
              );
            }
            return parsed.data satisfies PaymentClaimResult;
          }

          const parsedErr = ErrorSchema.safeParse(maybeJson);
          const message = parsedErr.success
            ? parsedErr.data.message
            : `HTTP ${response.status}`;
          throw new Error(`[PaymentClaimError] ${message} (status ${response.status})`);
        },
        catch: (error) => new Error(`[PaymentClaimRequestError] ${getErrorMessage(error)}`),
      });

      return result;
    }),
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);



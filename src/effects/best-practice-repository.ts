import { Client } from "@notionhq/client";
import type {
  PageObjectResponse,
  PartialPageObjectResponse,
  QueryDatabaseParameters,
  QueryDatabaseResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { Effect, Context } from "effect";
import { TaggedError } from "effect/Data";
export interface BestPractice {
  insight: string;
  relevantModels: string[];
}
class ConfigurationError extends TaggedError("ConfigurationError")<{
  missing: string[];
}> {}

class NotionQueryError extends TaggedError("NotionQueryError")<{
  message: string;
}> {}

type BestPracticeRepositoryError = ConfigurationError | NotionQueryError;

interface BestPracticeRepositoryShape {
  readonly getAll: () => Effect.Effect<BestPractice[], BestPracticeRepositoryError>;
  readonly search: (query: string) => Effect.Effect<BestPractice[], BestPracticeRepositoryError>;
}
export class BestPracticeRepository extends Context.Tag(
  "BestPracticeRepository",
)<BestPracticeRepository, BestPracticeRepositoryShape>() {}

export const BestPracticeRepositoryMock: BestPracticeRepositoryShape = {
  getAll: () => Effect.succeed(mockValues),
  search: (_query) => Effect.succeed(mockValues),
};

const NOTION_API_TOKEN =
  process.env.NOTION_API_TOKEN ?? "TODO_NOTION_API_TOKEN"; // TODO: set NOTION_API_TOKEN env var with your Notion integration token
const BEST_PRACTICES_DATABASE_ID =
  process.env.NOTION_BEST_PRACTICES_DB_ID ?? "TODO_DATABASE_ID"; // TODO: set NOTION_BEST_PRACTICES_DB_ID env var with your Notion database ID

const INSIGHT_PROPERTY_NAME = "Insight"; // TODO: adjust if your Notion property name differs
const RELEVANT_MODELS_PROPERTY_NAME = "Relevant Models"; // TODO: adjust if your Notion property name differs

const notionClient = new Client({
  auth: NOTION_API_TOKEN,
  notionVersion: "2025-09-03",
});

const ensureConfiguration: Effect.Effect<void, ConfigurationError> = Effect.gen(
  function* () {
    const missingConfigurations: string[] = [];
    if (!NOTION_API_TOKEN || NOTION_API_TOKEN.includes("TODO")) {
      missingConfigurations.push("NOTION_API_TOKEN");
    }
    if (
      !BEST_PRACTICES_DATABASE_ID ||
      BEST_PRACTICES_DATABASE_ID.includes("TODO")
    ) {
      missingConfigurations.push("NOTION_BEST_PRACTICES_DB_ID");
    }
    if (missingConfigurations.length > 0) {
      return yield* Effect.fail(
        new ConfigurationError({ missing: missingConfigurations })
      );
    }
  },
);

const queryDatabase = (
  filter?: QueryDatabaseParameters["filter"],
) =>
  Effect.gen(function* () {
    let cursor: string | undefined;
    const pages: Array<PageObjectResponse | PartialPageObjectResponse> = [];

    do {
      const response: QueryDatabaseResponse = yield* Effect.tryPromise({
        try: () =>
          notionClient.databases.query({
            database_id: BEST_PRACTICES_DATABASE_ID,
            start_cursor: cursor,
            filter,
          }),
        catch: (error) =>
          new NotionQueryError({
            message: `Failed to query Notion database: ${getErrorMessage(error)}`
          }),
      });

      const isPageResult = (
        item: unknown,
      ): item is PageObjectResponse | PartialPageObjectResponse =>
        !!item && (item as any).object === "page";

      pages.push(...response.results.filter(isPageResult));
      cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (cursor);

    return pages;
  });

const mapToBestPractice = (
  page: PageObjectResponse | PartialPageObjectResponse,
): BestPractice | null => {
  if (!isFullPage(page)) {
    return null;
  }

  const insightProperty = page.properties[INSIGHT_PROPERTY_NAME];
  if (!insightProperty || insightProperty.type !== "rich_text") {
    return null;
  }

  const relevantModelsProperty =
    page.properties[RELEVANT_MODELS_PROPERTY_NAME];

  const insight = insightProperty.rich_text
    .map((item: { plain_text: string }) => item.plain_text)
    .join(" ")
    .trim();

  if (!insight) {
    return null;
  }

  const relevantModels =
    relevantModelsProperty && relevantModelsProperty.type === "multi_select"
      ? relevantModelsProperty.multi_select.map((option: { name: string }) => option.name)
      : [];

  return {
    insight,
    relevantModels,
  };
};

const isFullPage = (
  page: PageObjectResponse | PartialPageObjectResponse,
): page is PageObjectResponse => "properties" in page;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const buildSearchFilter = (query: string): QueryDatabaseParameters["filter"] => ({
  or: [
    {
      property: INSIGHT_PROPERTY_NAME,
      rich_text: { contains: query },
    },
    {
      property: RELEVANT_MODELS_PROPERTY_NAME,
      multi_select: { contains: query },
    },
  ],
});

export const BestPracticeRepositoryLive: BestPracticeRepositoryShape = {
  getAll: () =>
    Effect.gen(function* () {
      yield* ensureConfiguration;
      const pages = yield* queryDatabase();
      return pages
        .map(mapToBestPractice)
        .filter((value): value is BestPractice => value !== null);
    }),
  search: (query) =>
    Effect.gen(function* () {
      yield* ensureConfiguration;
      const trimmedQuery = query.trim();
      if (!trimmedQuery) {
        return yield* BestPracticeRepositoryLive.getAll();
      }

      const pages = yield* queryDatabase(buildSearchFilter(trimmedQuery));
      return pages
        .map(mapToBestPractice)
        .filter((value): value is BestPractice => value !== null);
    }),
};

const mockValues: BestPractice[] = [
  {
    insight: "Midjourney v7 is the best at all types of images at the moment.",
    relevantModels: ["midjourney-v7"],
  },
  {
    insight:
      'Midjourney v7 gives the best results when prompted in a JSON format like { "subject": "tea pot", "lighting": "bright outdoor", ... }',
    relevantModels: ["midjourney-v7"],
  },
];

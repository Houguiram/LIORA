import { Client } from "@notionhq/client";
import type {
  PageObjectResponse,
  PartialPageObjectResponse,
  QueryDatabaseParameters,
  QueryDatabaseResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { Effect } from "effect";
import { TaggedError } from "effect/Data";
import { BestPractice, BestPracticeRepositoryShape } from "./best-practice-repository";
import type { OutputType } from "./best-practice-repository";

class ConfigurationError extends TaggedError("ConfigurationError")<{
  missing: string[];
}> {}

class NotionQueryError extends TaggedError("NotionQueryError")<{
  message: string;
}> {}

const NOTION_API_TOKEN =
  process.env.NOTION_API_TOKEN ?? "TODO_NOTION_API_TOKEN"; 
const BEST_PRACTICES_DATABASE_ID =
  process.env.NOTION_BEST_PRACTICES_DB_ID ?? "TODO_DATABASE_ID";

const INSIGHT_PROPERTY_NAME = "Insight 1";
const RELEVANT_MODELS_PROPERTY_NAME = "Model";
const OUTPUT_TYPE_PROPERTY_NAME = "Output type";

const notionClient = new Client({
  auth: NOTION_API_TOKEN,
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
).pipe(
  Effect.tap(() => Effect.log("Ensured valid Notion configuration")),
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
  }).pipe(
    Effect.tap((pages) => Effect.log(`Queried Notion database and got ${pages.length} pages`).pipe(
      Effect.andThen(() => Effect.log(`Page example: ${JSON.stringify(pages[0], null, 2)}`)),
    )),
  );

const mapToBestPractice = (
  page: PageObjectResponse | PartialPageObjectResponse,
): BestPractice | null => {
  if (!isFullPage(page)) {
    console.error("Page is not full");
    return null;
  }

  const insightProperty = page.properties[INSIGHT_PROPERTY_NAME];
  if (!insightProperty) {
    console.error("Insight property is not found");
    return null;
  }
  // Support both Notion property types: "title" and "rich_text"
  let insightTextItems: Array<{ plain_text: string }> | undefined;
  if (insightProperty.type === "rich_text") {
    insightTextItems = insightProperty.rich_text as Array<{ plain_text: string }>;
  } else if (insightProperty.type === "title") {
    insightTextItems = insightProperty.title as Array<{ plain_text: string }>;
  } else {
    console.error(
      `Insight property must be of type "title" or "rich_text" (got ${insightProperty.type})`,
    );
    return null;
  }

  const relevantModelsProperty =
    page.properties[RELEVANT_MODELS_PROPERTY_NAME];
  const outputTypeProperty = page.properties[OUTPUT_TYPE_PROPERTY_NAME];

  const insight = (insightTextItems ?? [])
    .map((item: { plain_text: string }) => item.plain_text)
    .join(" ")
    .trim();

  if (!insight) {
    console.error("Insight is empty");
    return null;
  }

  let relevantModels: string[] = [];
  if (relevantModelsProperty) {
    if (relevantModelsProperty.type === "multi_select") {
      relevantModels = relevantModelsProperty.multi_select.map((option: { name: string }) => option.name);
    } else if (relevantModelsProperty.type === "rich_text") {
      const concatenated = (relevantModelsProperty.rich_text as Array<{ plain_text: string }> | undefined)
        ?.map((item) => item.plain_text)
        .join(" ")
        .trim();
      if (concatenated) {
        relevantModels = concatenated
          .split(/[;,\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
  }

  let outputType: OutputType[] = [];
  if (outputTypeProperty) {
    if (outputTypeProperty.type === "multi_select") {
      const values = outputTypeProperty.multi_select
        .map((option: { name: string }) => option.name.toLowerCase().trim());
      outputType = values.filter((v): v is OutputType => v === "image" || v === "video" || v === "voice");
    } else if (outputTypeProperty.type === "rich_text") {
      const concatenated = (outputTypeProperty.rich_text as Array<{ plain_text: string }> | undefined)
        ?.map((item) => item.plain_text)
        .join(" ")
        .trim();
      if (concatenated) {
        const values = concatenated
          .split(/[;,\n]+/)
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        outputType = values.filter((v): v is OutputType => v === "image" || v === "video" || v === "voice");
      }
    }
  }

  return {
    insight,
    relevantModels,
    outputType,
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
      title: { contains: query },
    },
    {
      property: RELEVANT_MODELS_PROPERTY_NAME,
      rich_text: { contains: query },
    },
    {
      property: OUTPUT_TYPE_PROPERTY_NAME,
      multi_select: { contains: query },
    },
  ],
});

export const NotionBestPracticeRepository: BestPracticeRepositoryShape = {
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
        return yield* NotionBestPracticeRepository.getAll();
      }

      const pages = yield* queryDatabase(buildSearchFilter(trimmedQuery));
      return pages
        .map(mapToBestPractice)
        .filter((value): value is BestPractice => value !== null);
    }),
};


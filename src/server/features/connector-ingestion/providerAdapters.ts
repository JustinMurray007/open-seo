import { Ga4ConnectionRepository } from "@/server/features/ga4/repositories/Ga4ConnectionRepository";
import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import { createGa4DataClient } from "@/server/lib/ga4Client";
import { createGscClient } from "@/server/lib/gscClient";
import type {
  ConnectorProvider,
  ConnectorProviderAdapter,
  Ga4DailyLandingPageFactInput,
  GscDailyFactInput,
} from "./types";
import { ConnectorImportValidationError } from "./types";

export const GSC_IMPORT_PAGE_SIZE = 25_000;
export const GA4_IMPORT_PAGE_SIZE = 10_000;
const GA4_CHANNEL = "organic_search";

function requiredFiniteNumber(
  value: string | number | undefined,
  metric: string,
): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  throw new ConnectorImportValidationError(
    `Provider row is missing a finite ${metric} value.`,
  );
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function requiredGscDate(value: string | undefined): string {
  if (value && validIsoDate(value)) return value;
  throw new ConnectorImportValidationError(
    "Search Console returned a row with an invalid date.",
  );
}

function requiredDimensions(
  values: Array<{ value: string }> | undefined,
  count: number,
  provider: string,
  kind: "dimension" | "metric" = "dimension",
): string[] {
  if (
    !values ||
    values.length !== count ||
    values.some((value) => typeof value.value !== "string")
  ) {
    throw new ConnectorImportValidationError(
      `${provider} returned an invalid ${kind} shape.`,
    );
  }
  return values.map((value) => value.value);
}

function requiredGscKeys(keys: string[] | undefined): string[] {
  if (
    !keys ||
    keys.length !== 5 ||
    keys.some((value) => typeof value !== "string")
  ) {
    throw new ConnectorImportValidationError(
      "Search Console returned an invalid dimension shape.",
    );
  }
  return keys;
}

function requiredGa4Date(value: string | undefined): string {
  if (!value || !/^\d{8}$/.test(value)) {
    throw new ConnectorImportValidationError(
      "Google Analytics returned a row with an invalid date.",
    );
  }
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  if (validIsoDate(iso)) return iso;
  throw new ConnectorImportValidationError(
    "Google Analytics returned a row with an invalid date.",
  );
}

export const gscIngestionAdapter: ConnectorProviderAdapter = {
  provider: "gsc",
  async getConnection(projectId) {
    const connection = await GscConnectionRepository.getByProjectId(projectId);
    return connection
      ? {
          connectedByUserId: connection.connectedByUserId,
          accountId: connection.gscAccountId,
          resourceId: connection.siteUrl,
        }
      : null;
  },
  async fetchPage(input) {
    const client = createGscClient({
      userId: input.connection.connectedByUserId,
      gscAccountId: input.connection.accountId ?? undefined,
    });
    const response = await client.querySearchAnalytics(
      input.connection.resourceId,
      {
        startDate: input.startDate,
        endDate: input.endDate,
        dimensions: ["date", "query", "page", "country", "device"],
        rowLimit: GSC_IMPORT_PAGE_SIZE,
        startRow: input.offset,
        type: "web",
        dataState: "final",
      },
    );
    const rows: GscDailyFactInput[] = response.map((row) => {
      const keys = requiredGscKeys(row.keys);
      return {
        date: requiredGscDate(keys[0]),
        query: keys[1],
        page: keys[2],
        country: keys[3],
        device: keys[4],
        searchType: "web",
        clicks: requiredFiniteNumber(row.clicks, "clicks"),
        impressions: requiredFiniteNumber(row.impressions, "impressions"),
        ctr: requiredFiniteNumber(row.ctr, "ctr"),
        position: requiredFiniteNumber(row.position, "position"),
      };
    });
    return {
      rows,
      hasMore: response.length === GSC_IMPORT_PAGE_SIZE,
      nextOffset: input.offset + response.length,
    };
  },
};

export const ga4IngestionAdapter: ConnectorProviderAdapter = {
  provider: "ga4",
  async getConnection(projectId) {
    const connection = await Ga4ConnectionRepository.getByProjectId(projectId);
    return connection
      ? {
          propertyTimeZone: connection.propertyTimeZone,
          connectedByUserId: connection.connectedByUserId,
          accountId: connection.ga4AccountId,
          resourceId: connection.propertyId,
        }
      : null;
  },
  async fetchPage(input) {
    if (!input.connection.accountId) {
      throw new Error("Google Analytics connector account is missing.");
    }
    const client = createGa4DataClient({
      userId: input.connection.connectedByUserId,
      ga4AccountId: input.connection.accountId,
      propertyId: input.connection.resourceId,
    });
    const response = await client.runReport({
      dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
      dimensions: [
        { name: "date" },
        { name: "hostName" },
        { name: "landingPage" },
      ],
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "engagedSessions" },
        { name: "engagementRate" },
        { name: "keyEvents" },
        { name: "transactions" },
        { name: "purchaseRevenue" },
      ],
      dimensionFilter: {
        filter: {
          fieldName: "sessionDefaultChannelGroup",
          stringFilter: { matchType: "EXACT", value: "Organic Search" },
        },
      },
      offset: String(input.offset),
      limit: String(GA4_IMPORT_PAGE_SIZE),
      orderBys: [
        { dimension: { dimensionName: "date" } },
        { dimension: { dimensionName: "hostName" } },
        { dimension: { dimensionName: "landingPage" } },
      ],
      keepEmptyRows: false,
      returnPropertyQuota: true,
    });
    const rows: Ga4DailyLandingPageFactInput[] = (response.rows ?? []).map(
      (row) => {
        const dimensions = requiredDimensions(
          row.dimensionValues,
          3,
          "Google Analytics",
        );
        const metrics = requiredDimensions(
          row.metricValues,
          7,
          "Google Analytics",
          "metric",
        );
        return {
          date: requiredGa4Date(dimensions[0]),
          hostName: dimensions[1],
          landingPage: dimensions[2],
          channel: GA4_CHANNEL,
          sessions: requiredFiniteNumber(metrics[0], "sessions"),
          activeUsers: requiredFiniteNumber(metrics[1], "activeUsers"),
          engagedSessions: requiredFiniteNumber(metrics[2], "engagedSessions"),
          engagementRate: requiredFiniteNumber(metrics[3], "engagementRate"),
          keyEvents: requiredFiniteNumber(metrics[4], "keyEvents"),
          transactions: requiredFiniteNumber(metrics[5], "transactions"),
          purchaseRevenue: requiredFiniteNumber(metrics[6], "purchaseRevenue"),
        };
      },
    );
    const nextOffset = input.offset + rows.length;
    return {
      rows,
      hasMore: nextOffset < (response.rowCount ?? rows.length),
      nextOffset,
    };
  },
};

export function getConnectorAdapter(
  provider: ConnectorProvider,
): ConnectorProviderAdapter {
  return provider === "gsc" ? gscIngestionAdapter : ga4IngestionAdapter;
}

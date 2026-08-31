import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GA4_IMPORT_PAGE_SIZE,
  ga4IngestionAdapter,
  GSC_IMPORT_PAGE_SIZE,
  gscIngestionAdapter,
} from "./providerAdapters";

const mocks = vi.hoisted(() => ({
  getGscConnection: vi.fn(),
  getGa4Connection: vi.fn(),
  querySearchAnalytics: vi.fn(),
  runReport: vi.fn(),
}));

vi.mock("@/server/features/gsc/repositories/GscConnectionRepository", () => ({
  GscConnectionRepository: { getByProjectId: mocks.getGscConnection },
}));
vi.mock("@/server/features/ga4/repositories/Ga4ConnectionRepository", () => ({
  Ga4ConnectionRepository: { getByProjectId: mocks.getGa4Connection },
}));
vi.mock("@/server/lib/gscClient", () => ({
  createGscClient: () => ({
    querySearchAnalytics: mocks.querySearchAnalytics,
  }),
}));
vi.mock("@/server/lib/ga4Client", () => ({
  createGa4DataClient: () => ({ runReport: mocks.runReport }),
}));

describe("connector provider ingestion adapters", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getGscConnection.mockResolvedValue({
      siteUrl: "sc-domain:example.com",
      connectedByUserId: "user-1",
      gscAccountId: "account-1",
    });
    mocks.getGa4Connection.mockResolvedValue({
      connectedByUserId: "user-1",
      ga4AccountId: "account-1",
      propertyId: "properties/123",
      propertyTimeZone: "America/Los_Angeles",
    });
  });

  it("requests final web GSC data with five dimensions and 25,000-row pages", async () => {
    mocks.querySearchAnalytics.mockResolvedValue([
      {
        keys: [
          "2026-08-27",
          "seo tool",
          "https://example.com/",
          "usa",
          "mobile",
        ],
        clicks: 2,
        impressions: 10,
        ctr: 0.2,
        position: 3,
      },
    ]);

    const page = await gscIngestionAdapter.fetchPage({
      projectId: "project-1",
      connection: {
        connectedByUserId: "user-1",
        accountId: "account-1",
        resourceId: "sc-domain:example.com",
      },
      startDate: "2026-08-01",
      endDate: "2026-08-27",
      offset: 25_000,
    });

    expect(mocks.querySearchAnalytics).toHaveBeenCalledWith(
      "sc-domain:example.com",
      expect.objectContaining({
        dimensions: ["date", "query", "page", "country", "device"],
        rowLimit: GSC_IMPORT_PAGE_SIZE,
        startRow: 25_000,
        type: "web",
        dataState: "final",
      }),
    );
    expect(page.rows[0]).toMatchObject({
      date: "2026-08-27",
      query: "seo tool",
      device: "mobile",
      searchType: "web",
    });
  });

  it("rejects malformed GSC dates and non-finite metrics", async () => {
    const validRow = {
      keys: ["2026-08-27", "", "", "", ""],
      clicks: 1,
      impressions: 2,
      ctr: 0.5,
      position: 3,
    };
    mocks.querySearchAnalytics.mockResolvedValue([
      { ...validRow, keys: validRow.keys.slice(0, 4) },
    ]);
    const input = {
      projectId: "project-1",
      connection: {
        connectedByUserId: "user-1",
        accountId: "account-1",
        resourceId: "sc-domain:example.com",
      },
      startDate: "2026-08-01",
      endDate: "2026-08-27",
      offset: 0,
    };
    await expect(gscIngestionAdapter.fetchPage(input)).rejects.toThrow(
      "invalid dimension shape",
    );

    mocks.querySearchAnalytics.mockResolvedValue([
      { ...validRow, keys: ["2026-02-30", "", "", "", ""] },
    ]);
    await expect(gscIngestionAdapter.fetchPage(input)).rejects.toThrow(
      "invalid date",
    );

    mocks.querySearchAnalytics.mockResolvedValue([
      { ...validRow, impressions: Number.NaN },
    ]);
    await expect(gscIngestionAdapter.fetchPage(input)).rejects.toThrow(
      "finite impressions",
    );
  });

  it("requests paged organic GA4 landing-page data with property-date semantics", async () => {
    mocks.runReport.mockResolvedValue({
      rowCount: 12_000,
      rows: [
        {
          dimensionValues: [
            { value: "20260829" },
            { value: "example.com" },
            { value: "/" },
          ],
          metricValues: [
            { value: "8" },
            { value: "7" },
            { value: "6" },
            { value: "0.75" },
            { value: "2" },
            { value: "1" },
            { value: "49.95" },
          ],
        },
      ],
    });

    const page = await ga4IngestionAdapter.fetchPage({
      projectId: "project-1",
      connection: {
        propertyTimeZone: "America/Los_Angeles",
        connectedByUserId: "user-1",
        accountId: "account-1",
        resourceId: "properties/123",
      },
      startDate: "2026-08-01",
      endDate: "2026-08-29",
      offset: 10_000,
    });

    expect(mocks.runReport).toHaveBeenCalledWith(
      expect.objectContaining({
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
        offset: "10000",
        limit: String(GA4_IMPORT_PAGE_SIZE),
        dimensionFilter: {
          filter: {
            fieldName: "sessionDefaultChannelGroup",
            stringFilter: { matchType: "EXACT", value: "Organic Search" },
          },
        },
      }),
    );
    expect(page).toMatchObject({
      hasMore: true,
      nextOffset: 10_001,
    });
    expect(page.rows[0]).toMatchObject({
      date: "2026-08-29",
      channel: "organic_search",
      sessions: 8,
      purchaseRevenue: 49.95,
    });
  });

  it("rejects missing GA4 dates and required numeric metrics", async () => {
    const validDimensions = [
      { value: "20260829" },
      { value: "example.com" },
      { value: "/" },
    ];
    const validMetrics = [
      { value: "8" },
      { value: "7" },
      { value: "6" },
      { value: "0.75" },
      { value: "2" },
      { value: "1" },
      { value: "49.95" },
    ];
    mocks.runReport.mockResolvedValue({
      rowCount: 1,
      rows: [{ dimensionValues: [], metricValues: validMetrics }],
    });
    const input = {
      projectId: "project-1",
      connection: {
        propertyTimeZone: "America/Los_Angeles",
        connectedByUserId: "user-1",
        accountId: "account-1",
        resourceId: "properties/123",
      },
      startDate: "2026-08-01",
      endDate: "2026-08-29",
      offset: 0,
    };
    await expect(ga4IngestionAdapter.fetchPage(input)).rejects.toThrow(
      "invalid dimension shape",
    );

    mocks.runReport.mockResolvedValue({
      rowCount: 1,
      rows: [
        {
          dimensionValues: validDimensions,
          metricValues: validMetrics.slice(0, 6),
        },
      ],
    });
    await expect(ga4IngestionAdapter.fetchPage(input)).rejects.toThrow(
      "invalid metric shape",
    );
  });
});

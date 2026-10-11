/* oxlint-disable typescript/no-unsafe-type-assertion -- focused test doubles */
import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  getKnownPages: vi.fn(),
  getPageAuditData: vi.fn(),
  getPageGscData: vi.fn(),
  getPageGa4Data: vi.fn(),
}));

const gscConnRepo = vi.hoisted(() => ({
  getByProjectId: vi.fn(),
}));

const ga4ConnRepo = vi.hoisted(() => ({
  getByProjectId: vi.fn(),
}));

const backlinksService = vi.hoisted(() => ({
  profileOverview: vi.fn(),
}));

vi.mock("@/server/features/page-360/repositories/Page360Repository", () => ({
  Page360Repository: repository,
}));

vi.mock("@/server/features/gsc/repositories/GscConnectionRepository", () => ({
  GscConnectionRepository: gscConnRepo,
}));

vi.mock("@/server/features/ga4/repositories/Ga4ConnectionRepository", () => ({
  Ga4ConnectionRepository: ga4ConnRepo,
}));

vi.mock("@/server/features/backlinks/services/BacklinksService", () => ({
  BacklinksService: backlinksService,
}));

import { Page360Service } from "./Page360Service";

describe("Page360Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes relative URLs using project domain", () => {
    expect(Page360Service.normalizePageUrl("/about", "example.com")).toBe(
      "https://example.com/about",
    );
    expect(Page360Service.normalizePageUrl("contact", "example.com")).toBe(
      "https://example.com/contact",
    );
    expect(
      Page360Service.normalizePageUrl("https://other.com/page", "example.com"),
    ).toBe("https://other.com/page");
  });

  it("assembles complete Page 360 report across all data sources", async () => {
    repository.getPageAuditData.mockResolvedValue({
      latestAuditId: "audit-1",
      page: {
        id: "p-1",
        url: "https://example.com/test",
        statusCode: 200,
        title: "Test Page",
        metaDescription: "A description",
        canonicalUrl: "https://example.com/test",
        robotsMeta: null,
        isIndexable: true,
        wordCount: 300,
        internalLinkCount: 4,
        externalLinkCount: 2,
        crawlDepth: 1,
        inSitemap: true,
        crawledAt: "2026-09-01T00:00:00Z",
      },
      issues: [],
      lighthouse: null,
      actions: [],
    });

    repository.getPageGscData.mockResolvedValue({
      totals: { clicks: 120, impressions: 1500, ctr: 0.08, position: 4.5 },
      topQueries: [
        {
          query: "test keyword",
          clicks: 50,
          impressions: 500,
          ctr: 0.1,
          position: 2.1,
        },
      ],
    });

    repository.getPageGa4Data.mockResolvedValue({
      totals: {
        sessions: 250,
        activeUsers: 200,
        engagedSessions: 180,
        engagementRate: 0.72,
        keyEvents: 15,
        conversions: 5,
        purchaseRevenue: 120.0,
      },
    });

    gscConnRepo.getByProjectId.mockResolvedValue({ id: "conn-1" });
    ga4ConnRepo.getByProjectId.mockResolvedValue({ id: "conn-2" });

    backlinksService.profileOverview.mockResolvedValue({
      overview: {
        summary: {
          backlinks: 45,
          referringDomains: 12,
          rank: 35,
        },
      },
    });

    const report = await Page360Service.getPage360Report({
      projectId: "project-1",
      url: "https://example.com/test",
      projectDomain: "example.com",
      billingCustomer: {} as never,
    });

    expect(report.url).toBe("https://example.com/test");
    expect(report.domain).toBe("example.com");
    expect(report.pathname).toBe("/test");
    expect(report.audit.page?.title).toBe("Test Page");
    expect(report.gsc.connected).toBe(true);
    expect(report.gsc.totals?.clicks).toBe(120);
    expect(report.ga4.connected).toBe(true);
    expect(report.ga4.totals?.sessions).toBe(250);
    expect(report.backlinks.available).toBe(true);
    expect(report.backlinks.backlinks).toBe(45);
  });

  it("handles backlinks fetch failure gracefully without breaking report", async () => {
    repository.getPageAuditData.mockResolvedValue({
      latestAuditId: null,
      page: null,
      issues: [],
      lighthouse: null,
      actions: [],
    });
    repository.getPageGscData.mockResolvedValue({
      totals: null,
      topQueries: [],
    });
    repository.getPageGa4Data.mockResolvedValue({ totals: null });
    gscConnRepo.getByProjectId.mockResolvedValue(null);
    ga4ConnRepo.getByProjectId.mockResolvedValue(null);
    backlinksService.profileOverview.mockRejectedValue(
      new Error("API rate limit"),
    );

    const report = await Page360Service.getPage360Report({
      projectId: "project-1",
      url: "https://example.com/error-page",
      projectDomain: "example.com",
      billingCustomer: {} as never,
    });

    expect(report.url).toBe("https://example.com/error-page");
    expect(report.backlinks.available).toBe(false);
    expect(report.backlinks.backlinks).toBeNull();
  });
});

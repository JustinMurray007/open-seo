import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  actionEvidence,
  actions,
  auditIssues,
  auditLighthouseResults,
  auditPages,
  audits,
  ga4DailyLandingPageFacts,
  gscDailyFacts,
} from "@/db/schema";
import { getIssueDescriptor } from "@/shared/audit-issues";
import type {
  AuditIssueItem,
  AuditPageSummary,
  Ga4PageTotals,
  GscPageTotals,
  GscQueryItem,
  LighthouseScores,
  PageActionItem,
  Page360KnownPageItem,
} from "@/types/schemas/page-360";

function getUrlVariations(url: string): string[] {
  const set = new Set<string>([url]);
  if (url.endsWith("/")) {
    set.add(url.slice(0, -1));
  } else {
    set.add(`${url}/`);
  }
  return Array.from(set);
}

function getPathname(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.pathname || "/";
  } catch {
    return rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
  }
}

async function getLatestCompletedAudit(projectId: string) {
  const rows = await db
    .select({
      id: audits.id,
      completedAt: audits.completedAt,
      startedAt: audits.startedAt,
    })
    .from(audits)
    .where(and(eq(audits.projectId, projectId), eq(audits.status, "completed")))
    .orderBy(desc(audits.completedAt), desc(audits.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

async function getKnownPages(
  projectId: string,
): Promise<Page360KnownPageItem[]> {
  const pagesMap = new Map<string, Page360KnownPageItem>();

  const latestAudit = await getLatestCompletedAudit(projectId);
  if (latestAudit) {
    const auditPageRows = await db
      .select({
        url: auditPages.url,
        title: auditPages.title,
        statusCode: auditPages.statusCode,
      })
      .from(auditPages)
      .where(eq(auditPages.auditId, latestAudit.id))
      .limit(60);

    for (const row of auditPageRows) {
      if (!pagesMap.has(row.url)) {
        pagesMap.set(row.url, {
          url: row.url,
          title: row.title ?? null,
          statusCode: row.statusCode ?? null,
          source: "audit",
        });
      }
    }
  }

  // Also pull top pages from GSC daily facts
  const gscRows = await db
    .select({ page: gscDailyFacts.page })
    .from(gscDailyFacts)
    .where(eq(gscDailyFacts.projectId, projectId))
    .limit(40);

  for (const row of gscRows) {
    if (row.page && !pagesMap.has(row.page)) {
      pagesMap.set(row.page, {
        url: row.page,
        title: null,
        statusCode: null,
        source: "gsc",
      });
    }
  }

  return Array.from(pagesMap.values()).slice(0, 50);
}

async function getPageAuditData(projectId: string, url: string) {
  const latestAudit = await getLatestCompletedAudit(projectId);
  if (!latestAudit) {
    return {
      latestAuditId: null,
      page: null,
      issues: [],
      lighthouse: null,
      actions: await getPageActions(projectId, url),
    };
  }

  const variations = getUrlVariations(url);
  const pageRows = await db
    .select({
      id: auditPages.id,
      url: auditPages.url,
      statusCode: auditPages.statusCode,
      title: auditPages.title,
      metaDescription: auditPages.metaDescription,
      canonicalUrl: auditPages.canonicalUrl,
      robotsMeta: auditPages.robotsMeta,
      isIndexable: auditPages.isIndexable,
      wordCount: auditPages.wordCount,
      internalLinkCount: auditPages.internalLinkCount,
      externalLinkCount: auditPages.externalLinkCount,
      crawlDepth: auditPages.crawlDepth,
      inSitemap: auditPages.inSitemap,
    })
    .from(auditPages)
    .where(
      and(
        eq(auditPages.auditId, latestAudit.id),
        inArray(auditPages.url, variations),
      ),
    )
    .limit(1);

  const page = pageRows[0] ?? null;

  let pageSummary: AuditPageSummary | null = null;
  let issues: AuditIssueItem[] = [];
  let lighthouse: {
    mobile: LighthouseScores | null;
    desktop: LighthouseScores | null;
  } | null = null;

  if (page) {
    pageSummary = {
      id: page.id,
      url: page.url,
      statusCode: page.statusCode ?? null,
      title: page.title ?? null,
      metaDescription: page.metaDescription ?? null,
      canonicalUrl: page.canonicalUrl ?? null,
      robotsMeta: page.robotsMeta ?? null,
      isIndexable: Boolean(page.isIndexable),
      wordCount: page.wordCount ?? 0,
      internalLinkCount: page.internalLinkCount ?? 0,
      externalLinkCount: page.externalLinkCount ?? 0,
      crawlDepth: page.crawlDepth ?? null,
      inSitemap: Boolean(page.inSitemap),
      crawledAt: latestAudit.completedAt ?? latestAudit.startedAt ?? null,
    };

    const issueRows = await db
      .select()
      .from(auditIssues)
      .where(
        and(
          eq(auditIssues.auditId, latestAudit.id),
          eq(auditIssues.pageId, page.id),
        ),
      );

    issues = issueRows.map((row) => ({
      id: row.id,
      issueType: row.issueType,
      severity: row.severity,
      title: getIssueDescriptor(row.issueType)?.title ?? row.issueType,
      detailsJson: row.detailsJson ?? null,
    }));

    const lhRows = await db
      .select()
      .from(auditLighthouseResults)
      .where(
        and(
          eq(auditLighthouseResults.auditId, latestAudit.id),
          eq(auditLighthouseResults.pageId, page.id),
        ),
      );

    const mobileLh = lhRows.find((r) => r.strategy === "mobile") ?? null;
    const desktopLh = lhRows.find((r) => r.strategy === "desktop") ?? null;

    if (mobileLh || desktopLh) {
      lighthouse = {
        mobile: mobileLh
          ? {
              performanceScore: mobileLh.performanceScore ?? null,
              accessibilityScore: mobileLh.accessibilityScore ?? null,
              bestPracticesScore: mobileLh.bestPracticesScore ?? null,
              seoScore: mobileLh.seoScore ?? null,
              lcpMs: mobileLh.lcpMs ?? null,
              cls: mobileLh.cls ?? null,
              inpMs: mobileLh.inpMs ?? null,
            }
          : null,
        desktop: desktopLh
          ? {
              performanceScore: desktopLh.performanceScore ?? null,
              accessibilityScore: desktopLh.accessibilityScore ?? null,
              bestPracticesScore: desktopLh.bestPracticesScore ?? null,
              seoScore: desktopLh.seoScore ?? null,
              lcpMs: desktopLh.lcpMs ?? null,
              cls: desktopLh.cls ?? null,
              inpMs: desktopLh.inpMs ?? null,
            }
          : null,
      };
    }
  }

  const pageActions = await getPageActions(projectId, url);

  return {
    latestAuditId: latestAudit.id,
    page: pageSummary,
    issues,
    lighthouse,
    actions: pageActions,
  };
}

async function getPageActions(
  projectId: string,
  url: string,
): Promise<PageActionItem[]> {
  const variations = getUrlVariations(url);
  const evidenceRows = await db
    .select({
      actionId: actionEvidence.actionId,
      url: actionEvidence.url,
    })
    .from(actionEvidence)
    .where(inArray(actionEvidence.url, variations));

  if (evidenceRows.length === 0) return [];

  const actionIds = Array.from(new Set(evidenceRows.map((e) => e.actionId)));
  const actionRows = await db
    .select({
      id: actions.id,
      title: actions.title,
      severity: actions.severity,
      status: actions.status,
      issueType: actions.issueType,
    })
    .from(actions)
    .where(
      and(eq(actions.projectId, projectId), inArray(actions.id, actionIds)),
    );

  return actionRows.map((a) => ({
    id: a.id,
    title: a.title,
    severity: a.severity,
    status: a.status,
    issueType: a.issueType,
  }));
}

async function getPageGscData(
  projectId: string,
  url: string,
): Promise<{
  totals: GscPageTotals | null;
  topQueries: GscQueryItem[];
}> {
  const variations = getUrlVariations(url);
  const pathname = getPathname(url);
  variations.push(...getUrlVariations(pathname));

  const factRows = await db
    .select({
      query: gscDailyFacts.query,
      clicks: gscDailyFacts.clicks,
      impressions: gscDailyFacts.impressions,
      ctr: gscDailyFacts.ctr,
      position: gscDailyFacts.position,
    })
    .from(gscDailyFacts)
    .where(
      and(
        eq(gscDailyFacts.projectId, projectId),
        inArray(gscDailyFacts.page, variations),
      ),
    );

  if (factRows.length === 0) {
    return { totals: null, topQueries: [] };
  }

  const queryAgg = new Map<
    string,
    { clicks: number; impressions: number; weightedPosSum: number }
  >();

  let totalClicks = 0;
  let totalImpressions = 0;
  let totalPosSum = 0;

  for (const row of factRows) {
    const q = row.query.trim();
    if (!q) continue;

    totalClicks += row.clicks;
    totalImpressions += row.impressions;
    totalPosSum += row.position * row.impressions;

    const current = queryAgg.get(q) ?? {
      clicks: 0,
      impressions: 0,
      weightedPosSum: 0,
    };
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    current.weightedPosSum += row.position * row.impressions;
    queryAgg.set(q, current);
  }

  const overallCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const overallPosition =
    totalImpressions > 0 ? totalPosSum / totalImpressions : 0;

  const topQueries: GscQueryItem[] = Array.from(queryAgg.entries())
    .map(([query, stats]) => ({
      query,
      clicks: stats.clicks,
      impressions: stats.impressions,
      ctr: stats.impressions > 0 ? stats.clicks / stats.impressions : 0,
      position:
        stats.impressions > 0 ? stats.weightedPosSum / stats.impressions : 0,
    }))
    .toSorted((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 15);

  return {
    totals: {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: overallCtr,
      position: overallPosition,
    },
    topQueries,
  };
}

async function getPageGa4Data(
  projectId: string,
  url: string,
): Promise<{ totals: Ga4PageTotals | null }> {
  const pathname = getPathname(url);
  const variations = getUrlVariations(pathname);

  const factRows = await db
    .select({
      sessions: ga4DailyLandingPageFacts.sessions,
      activeUsers: ga4DailyLandingPageFacts.activeUsers,
      engagedSessions: ga4DailyLandingPageFacts.engagedSessions,
      keyEvents: ga4DailyLandingPageFacts.keyEvents,
      transactions: ga4DailyLandingPageFacts.transactions,
      purchaseRevenue: ga4DailyLandingPageFacts.purchaseRevenue,
    })
    .from(ga4DailyLandingPageFacts)
    .where(
      and(
        eq(ga4DailyLandingPageFacts.projectId, projectId),
        inArray(ga4DailyLandingPageFacts.landingPage, variations),
      ),
    );

  if (factRows.length === 0) {
    return { totals: null };
  }

  let totalSessions = 0;
  let totalActiveUsers = 0;
  let totalEngagedSessions = 0;
  let totalKeyEvents = 0;
  let totalTransactions = 0;
  let totalPurchaseRevenue = 0;

  for (const row of factRows) {
    totalSessions += row.sessions;
    totalActiveUsers += row.activeUsers;
    totalEngagedSessions += row.engagedSessions;
    totalKeyEvents += row.keyEvents;
    totalTransactions += row.transactions;
    totalPurchaseRevenue += row.purchaseRevenue;
  }

  const engagementRate =
    totalSessions > 0 ? totalEngagedSessions / totalSessions : 0;

  return {
    totals: {
      sessions: totalSessions,
      activeUsers: totalActiveUsers,
      engagedSessions: totalEngagedSessions,
      engagementRate,
      keyEvents: totalKeyEvents,
      conversions: totalTransactions,
      purchaseRevenue: totalPurchaseRevenue,
    },
  };
}

export const Page360Repository = {
  getLatestCompletedAudit,
  getKnownPages,
  getPageAuditData,
  getPageGscData,
  getPageGa4Data,
} as const;

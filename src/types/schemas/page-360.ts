import { z } from "zod";
import { actionSeveritySchema, actionStatusSchema } from "./action-center";

export const page360ReportInputSchema = z.object({
  projectId: z.string().min(1),
  url: z.string().min(1),
});

export const page360KnownPagesInputSchema = z.object({
  projectId: z.string().min(1),
});

export const auditPageSummarySchema = z.object({
  id: z.string(),
  url: z.string(),
  statusCode: z.number().nullable(),
  title: z.string().nullable(),
  metaDescription: z.string().nullable(),
  canonicalUrl: z.string().nullable(),
  robotsMeta: z.string().nullable(),
  isIndexable: z.boolean(),
  wordCount: z.number(),
  internalLinkCount: z.number(),
  externalLinkCount: z.number(),
  crawlDepth: z.number().nullable(),
  inSitemap: z.boolean(),
  crawledAt: z.string().nullable(),
});

export const auditIssueItemSchema = z.object({
  id: z.string(),
  issueType: z.string(),
  severity: actionSeveritySchema,
  title: z.string(),
  detailsJson: z.string().nullable(),
});

export const lighthouseScoresSchema = z.object({
  performanceScore: z.number().nullable(),
  accessibilityScore: z.number().nullable(),
  bestPracticesScore: z.number().nullable(),
  seoScore: z.number().nullable(),
  lcpMs: z.number().nullable(),
  cls: z.number().nullable(),
  inpMs: z.number().nullable(),
});

export const pageActionItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: actionSeveritySchema,
  status: actionStatusSchema,
  issueType: z.string(),
});

export const gscQueryItemSchema = z.object({
  query: z.string(),
  clicks: z.number(),
  impressions: z.number(),
  ctr: z.number(),
  position: z.number(),
});

export const gscPageTotalsSchema = z.object({
  clicks: z.number(),
  impressions: z.number(),
  ctr: z.number(),
  position: z.number(),
});

export const ga4PageTotalsSchema = z.object({
  sessions: z.number(),
  activeUsers: z.number(),
  engagedSessions: z.number(),
  engagementRate: z.number(),
  keyEvents: z.number(),
  conversions: z.number(),
  purchaseRevenue: z.number(),
});

export const pageBacklinksSummarySchema = z.object({
  backlinks: z.number().nullable(),
  referringDomains: z.number().nullable(),
  rank: z.number().nullable(),
  available: z.boolean(),
});

export const page360ReportSchema = z.object({
  url: z.string(),
  domain: stringOrNullToEmpty(z.string().nullable()),
  pathname: z.string(),
  audit: z.object({
    latestAuditId: z.string().nullable(),
    page: auditPageSummarySchema.nullable(),
    issues: z.array(auditIssueItemSchema),
    lighthouse: z
      .object({
        mobile: lighthouseScoresSchema.nullable(),
        desktop: lighthouseScoresSchema.nullable(),
      })
      .nullable(),
    actions: z.array(pageActionItemSchema),
  }),
  gsc: z.object({
    connected: z.boolean(),
    totals: gscPageTotalsSchema.nullable(),
    topQueries: z.array(gscQueryItemSchema),
  }),
  ga4: z.object({
    connected: z.boolean(),
    totals: ga4PageTotalsSchema.nullable(),
  }),
  backlinks: pageBacklinksSummarySchema,
});

function stringOrNullToEmpty(schema: z.ZodNullable<z.ZodString>) {
  return schema.transform((val) => val ?? "");
}

export const page360KnownPageItemSchema = z.object({
  url: z.string(),
  title: z.string().nullable(),
  statusCode: z.number().nullable(),
  source: z.enum(["audit", "gsc", "ga4"]),
});

export type AuditPageSummary = z.infer<typeof auditPageSummarySchema>;
export type AuditIssueItem = z.infer<typeof auditIssueItemSchema>;
export type LighthouseScores = z.infer<typeof lighthouseScoresSchema>;
export type PageActionItem = z.infer<typeof pageActionItemSchema>;
export type GscQueryItem = z.infer<typeof gscQueryItemSchema>;
export type GscPageTotals = z.infer<typeof gscPageTotalsSchema>;
export type Ga4PageTotals = z.infer<typeof ga4PageTotalsSchema>;
export type PageBacklinksSummary = z.infer<typeof pageBacklinksSummarySchema>;
export type Page360Report = z.infer<typeof page360ReportSchema>;
export type Page360KnownPageItem = z.infer<typeof page360KnownPageItemSchema>;

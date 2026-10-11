import { Page360Repository } from "@/server/features/page-360/repositories/Page360Repository";
import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import { Ga4ConnectionRepository } from "@/server/features/ga4/repositories/Ga4ConnectionRepository";
import { BacklinksService } from "@/server/features/backlinks/services/BacklinksService";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type {
  Page360KnownPageItem,
  Page360Report,
  PageBacklinksSummary,
} from "@/types/schemas/page-360";

function normalizePageUrl(
  rawUrl: string,
  projectDomain: string | null,
): string {
  let trimmed = rawUrl.trim();
  if (!trimmed) return "";

  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    if (projectDomain) {
      const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
      trimmed = `https://${projectDomain}${cleanPath}`;
    } else {
      trimmed = `https://${trimmed}`;
    }
  }

  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

async function listKnownPages(
  projectId: string,
): Promise<Page360KnownPageItem[]> {
  return Page360Repository.getKnownPages(projectId);
}

async function getPage360Report(input: {
  projectId: string;
  url: string;
  projectDomain: string | null;
  billingCustomer: BillingCustomerContext;
}): Promise<Page360Report> {
  const { projectId, projectDomain, billingCustomer } = input;
  const normalizedUrl = normalizePageUrl(input.url, projectDomain);

  let domain = "";
  let pathname = "/";
  try {
    const parsed = new URL(normalizedUrl);
    domain = parsed.hostname;
    pathname = parsed.pathname || "/";
  } catch {
    domain = projectDomain ?? "";
    pathname = input.url.startsWith("/") ? input.url : `/${input.url}`;
  }

  const [auditData, gscData, ga4Data, gscConn, ga4Conn] = await Promise.all([
    Page360Repository.getPageAuditData(projectId, normalizedUrl),
    Page360Repository.getPageGscData(projectId, normalizedUrl),
    Page360Repository.getPageGa4Data(projectId, normalizedUrl),
    GscConnectionRepository.getByProjectId(projectId).catch(() => null),
    Ga4ConnectionRepository.getByProjectId(projectId).catch(() => null),
  ]);

  let backlinksSummary: PageBacklinksSummary = {
    backlinks: null,
    referringDomains: null,
    rank: null,
    available: false,
  };

  try {
    const profile = await BacklinksService.profileOverview(
      {
        target: normalizedUrl,
        scope: "exact_url",
      },
      billingCustomer,
    );

    if (profile?.overview?.summary) {
      backlinksSummary = {
        backlinks: profile.overview.summary.backlinks ?? null,
        referringDomains: profile.overview.summary.referringDomains ?? null,
        rank: profile.overview.summary.rank ?? null,
        available: true,
      };
    }
  } catch {
    // Backlinks API might not be configured or funded in all environments;
    // gracefully report unavailable rather than failing the Page 360 report.
    backlinksSummary = {
      backlinks: null,
      referringDomains: null,
      rank: null,
      available: false,
    };
  }

  return {
    url: normalizedUrl,
    domain,
    pathname,
    audit: auditData,
    gsc: {
      connected: Boolean(gscConn),
      totals: gscData.totals,
      topQueries: gscData.topQueries,
    },
    ga4: {
      connected: Boolean(ga4Conn),
      totals: ga4Data.totals,
    },
    backlinks: backlinksSummary,
  };
}

export const Page360Service = {
  listKnownPages,
  getPage360Report,
  normalizePageUrl,
} as const;

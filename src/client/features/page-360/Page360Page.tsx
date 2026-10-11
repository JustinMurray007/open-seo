import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Compass, ExternalLink, Search } from "lucide-react";
import {
  getPage360Report,
  listPage360KnownPages,
} from "@/serverFunctions/page360";
import {
  cleanDisplayUrl,
  formatStatusCode,
  getStatusCodeBadgeClass,
} from "./page360Utils";
import { Page360AuditCard } from "./Page360AuditCard";
import { Page360GscCard } from "./Page360GscCard";
import { Page360Ga4Card } from "./Page360Ga4Card";
import { Page360BacklinksCard } from "./Page360BacklinksCard";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export function Page360Page({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false });
  const initialUrl = searchParams.url ?? "";

  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [activeUrl, setActiveUrl] = useState(initialUrl);

  const knownPagesQuery = useQuery({
    queryKey: ["page360KnownPages", projectId],
    queryFn: () => listPage360KnownPages({ data: { projectId } }),
  });

  // Automatically select the first known page if none was provided
  useEffect(() => {
    if (!activeUrl && knownPagesQuery.data && knownPagesQuery.data.length > 0) {
      const first = knownPagesQuery.data[0]?.url;
      if (first) {
        setActiveUrl(first);
        setInputUrl(first);
      }
    }
  }, [activeUrl, knownPagesQuery.data]);

  const reportQuery = useQuery({
    queryKey: ["page360Report", projectId, activeUrl],
    queryFn: () => getPage360Report({ data: { projectId, url: activeUrl } }),
    enabled: Boolean(activeUrl),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputUrl.trim();
    if (trimmed) {
      setActiveUrl(trimmed);
      void navigate({
        to: "/p/$projectId/page-360",
        params: { projectId },
        search: { url: trimmed },
        replace: true,
      });
    }
  };

  const handleSelectKnownPage = (url: string) => {
    setInputUrl(url);
    setActiveUrl(url);
    void navigate({
      to: "/p/$projectId/page-360",
      params: { projectId },
      search: { url },
      replace: true,
    });
  };

  const report = reportQuery.data;
  const audit = report?.audit;
  const page = audit?.page;

  return (
    <div className="space-y-6 px-4 py-6 md:px-8">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="size-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Page 360</h1>
          </div>
          <p className="text-sm text-base-content/60">
            Unified single-URL technical health, search rankings, user
            analytics, and backlinks.
          </p>
        </div>
      </div>

      {/* URL search bar & quick-pick chips */}
      <div className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm space-y-3">
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-base-content/40" />
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Enter any page URL or path (e.g. /about or https://example.com/blog)..."
              className="input input-bordered w-full pl-9 text-sm"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-sm sm:btn-md"
            disabled={!inputUrl.trim() || reportQuery.isPending}
          >
            {reportQuery.isPending ? "Analyzing…" : "Analyze Page"}
          </button>
        </form>

        {/* Known pages quick-picker */}
        {knownPagesQuery.data && knownPagesQuery.data.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs font-medium text-base-content/50 mr-1">
              Quick Pick:
            </span>
            {knownPagesQuery.data.slice(0, 6).map((kp) => (
              <button
                key={kp.url}
                type="button"
                onClick={() => handleSelectKnownPage(kp.url)}
                className={`btn btn-xs rounded-full ${
                  activeUrl === kp.url
                    ? "btn-neutral"
                    : "btn-ghost border border-base-300 bg-base-200/50"
                }`}
              >
                {kp.title ? (
                  <span className="max-w-[140px] truncate">{kp.title}</span>
                ) : (
                  <span className="max-w-[140px] truncate">
                    {cleanDisplayUrl(kp.url)}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Loading state */}
      {reportQuery.isPending && (
        <div className="space-y-4" aria-busy>
          <div className="skeleton h-28 w-full rounded-xl" />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="skeleton h-80 rounded-xl" />
            <div className="skeleton h-80 rounded-xl" />
            <div className="skeleton h-80 rounded-xl" />
            <div className="skeleton h-80 rounded-xl" />
          </div>
        </div>
      )}

      {/* Error state */}
      {reportQuery.isError && (
        <div className="alert alert-error">
          <AlertTriangle className="size-5" />
          <span>{getStandardErrorMessage(reportQuery.error)}</span>
        </div>
      )}

      {/* Active Page 360 View */}
      {report && !reportQuery.isPending && (
        <div className="space-y-6">
          {/* Overview Banner */}
          <div className="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`badge badge-sm font-medium ${getStatusCodeBadgeClass(
                      page?.statusCode ?? null,
                    )}`}
                  >
                    {formatStatusCode(page?.statusCode ?? null)}
                  </span>
                  {page?.isIndexable !== undefined && (
                    <span
                      className={`badge badge-sm ${
                        page.isIndexable
                          ? "badge-success badge-outline"
                          : "badge-error badge-outline"
                      }`}
                    >
                      {page.isIndexable ? "Indexable" : "Noindex"}
                    </span>
                  )}
                  {page?.inSitemap && (
                    <span className="badge badge-sm badge-ghost">
                      In Sitemap
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-semibold leading-tight pt-1">
                  {page?.title || cleanDisplayUrl(report.url)}
                </h2>
                <div className="flex items-center gap-1.5 text-xs text-base-content/60">
                  <a
                    href={report.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 hover:underline text-primary"
                  >
                    {report.url}
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>

              {page?.crawledAt && (
                <div className="text-right text-xs text-base-content/50">
                  <span>Last crawled: </span>
                  <span className="font-medium text-base-content/70">
                    {new Intl.DateTimeFormat(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }).format(new Date(page.crawledAt))}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 4 Quadrants */}
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
            <Page360AuditCard projectId={projectId} audit={report.audit} />
            <Page360GscCard projectId={projectId} gsc={report.gsc} />
            <Page360Ga4Card ga4={report.ga4} />
            {report.backlinks && (
              <Page360BacklinksCard
                projectId={projectId}
                url={report.url}
                backlinks={report.backlinks}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

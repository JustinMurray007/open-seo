import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import type { Page360Report } from "@/types/schemas/page-360";
import { formatNumber, formatScore, getScoreColorClass } from "./page360Utils";

export function Page360AuditCard({
  projectId,
  audit,
}: {
  projectId: string;
  audit: Page360Report["audit"];
}) {
  const page = audit.page;

  return (
    <div className="rounded-xl border border-base-300 bg-base-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-base-300 px-5 py-4">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-primary" />
          <h3 className="font-semibold text-base">Technical & Audit Health</h3>
        </div>
        <Link
          to="/p/$projectId/audit"
          params={{ projectId }}
          className="btn btn-ghost btn-xs"
        >
          Full audit
        </Link>
      </div>

      <div className="p-5 space-y-4">
        {page ? (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-base-200/50 p-2.5">
                <span className="text-xs text-base-content/60 block">
                  Words
                </span>
                <span className="font-semibold tabular-nums">
                  {formatNumber(page.wordCount)}
                </span>
              </div>
              <div className="rounded-lg bg-base-200/50 p-2.5">
                <span className="text-xs text-base-content/60 block">
                  Crawl Depth
                </span>
                <span className="font-semibold tabular-nums">
                  {page.crawlDepth ?? 0} clicks
                </span>
              </div>
              <div className="rounded-lg bg-base-200/50 p-2.5">
                <span className="text-xs text-base-content/60 block">
                  Internal Links
                </span>
                <span className="font-semibold tabular-nums">
                  {page.internalLinkCount}
                </span>
              </div>
              <div className="rounded-lg bg-base-200/50 p-2.5">
                <span className="text-xs text-base-content/60 block">
                  External Links
                </span>
                <span className="font-semibold tabular-nums">
                  {page.externalLinkCount}
                </span>
              </div>
            </div>

            {page.metaDescription && (
              <div className="rounded-lg bg-base-200/30 p-3 text-xs space-y-1">
                <span className="font-medium text-base-content/60">
                  Meta Description:
                </span>
                <p className="text-base-content/80 italic">
                  {page.metaDescription}
                </p>
              </div>
            )}

            {page.canonicalUrl && (
              <div className="text-xs text-base-content/60 truncate">
                <span className="font-medium">Canonical:</span>{" "}
                {page.canonicalUrl}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-base-content/60">
            This page was not found in the latest completed site audit. Run a
            crawl to audit this URL.
          </p>
        )}

        {/* Open Actions for this page */}
        {audit.actions && audit.actions.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-base-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-base-content/60">
                Related Action Center Items ({audit.actions.length})
              </span>
              <Link
                to="/p/$projectId/actions"
                params={{ projectId }}
                className="text-xs text-primary hover:underline"
              >
                Action Center
              </Link>
            </div>
            <ul className="space-y-1.5">
              {audit.actions.map((act) => (
                <li
                  key={act.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-base-200/40 p-2 text-xs"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <span
                      className={`size-2 rounded-full shrink-0 ${
                        act.severity === "critical"
                          ? "bg-error"
                          : act.severity === "warning"
                            ? "bg-warning"
                            : "bg-base-content/30"
                      }`}
                    />
                    <span className="font-medium truncate">{act.title}</span>
                  </span>
                  <span className="badge badge-ghost badge-xs shrink-0 capitalize">
                    {act.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Lighthouse metrics */}
        {audit.lighthouse?.mobile && (
          <div className="space-y-2 pt-2 border-t border-base-200">
            <span className="text-xs font-semibold uppercase tracking-wider text-base-content/60">
              Lighthouse Scores (Mobile)
            </span>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-lg bg-base-200/40 p-2">
                <span
                  className={`text-lg font-bold block ${getScoreColorClass(
                    audit.lighthouse.mobile.performanceScore,
                  )}`}
                >
                  {formatScore(audit.lighthouse.mobile.performanceScore)}
                </span>
                <span className="text-[10px] text-base-content/60">Perf</span>
              </div>
              <div className="rounded-lg bg-base-200/40 p-2">
                <span
                  className={`text-lg font-bold block ${getScoreColorClass(
                    audit.lighthouse.mobile.accessibilityScore,
                  )}`}
                >
                  {formatScore(audit.lighthouse.mobile.accessibilityScore)}
                </span>
                <span className="text-[10px] text-base-content/60">A11y</span>
              </div>
              <div className="rounded-lg bg-base-200/40 p-2">
                <span
                  className={`text-lg font-bold block ${getScoreColorClass(
                    audit.lighthouse.mobile.bestPracticesScore,
                  )}`}
                >
                  {formatScore(audit.lighthouse.mobile.bestPracticesScore)}
                </span>
                <span className="text-[10px] text-base-content/60">
                  Practices
                </span>
              </div>
              <div className="rounded-lg bg-base-200/40 p-2">
                <span
                  className={`text-lg font-bold block ${getScoreColorClass(
                    audit.lighthouse.mobile.seoScore,
                  )}`}
                >
                  {formatScore(audit.lighthouse.mobile.seoScore)}
                </span>
                <span className="text-[10px] text-base-content/60">SEO</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

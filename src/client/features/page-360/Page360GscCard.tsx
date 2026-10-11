import { Link } from "@tanstack/react-router";
import { Globe } from "lucide-react";
import type { Page360Report } from "@/types/schemas/page-360";
import { formatCtr, formatNumber, formatPosition } from "./page360Utils";

export function Page360GscCard({
  projectId,
  gsc,
}: {
  projectId: string;
  gsc: Page360Report["gsc"];
}) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-base-300 px-5 py-4">
        <div className="flex items-center gap-2">
          <Globe className="size-4 text-primary" />
          <h3 className="font-semibold text-base">Search Performance (GSC)</h3>
        </div>
        <Link
          to="/p/$projectId/search-performance"
          params={{ projectId }}
          className="btn btn-ghost btn-xs"
        >
          GSC Insights
        </Link>
      </div>

      <div className="p-5 space-y-4">
        {gsc?.totals ? (
          <>
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-lg bg-base-200/50 p-2.5">
                <span className="text-xs text-base-content/60 block">
                  Clicks
                </span>
                <span className="text-lg font-bold tabular-nums">
                  {formatNumber(gsc.totals.clicks)}
                </span>
              </div>
              <div className="rounded-lg bg-base-200/50 p-2.5">
                <span className="text-xs text-base-content/60 block">
                  Impressions
                </span>
                <span className="text-lg font-bold tabular-nums">
                  {formatNumber(gsc.totals.impressions)}
                </span>
              </div>
              <div className="rounded-lg bg-base-200/50 p-2.5">
                <span className="text-xs text-base-content/60 block">CTR</span>
                <span className="text-lg font-bold tabular-nums">
                  {formatCtr(gsc.totals.ctr)}
                </span>
              </div>
              <div className="rounded-lg bg-base-200/50 p-2.5">
                <span className="text-xs text-base-content/60 block">
                  Avg Position
                </span>
                <span className="text-lg font-bold tabular-nums">
                  {formatPosition(gsc.totals.position)}
                </span>
              </div>
            </div>

            {/* Top Queries Table */}
            {gsc.topQueries.length > 0 && (
              <div className="space-y-2 pt-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-base-content/60">
                  Top Search Queries
                </span>
                <div className="overflow-x-auto rounded-lg border border-base-200">
                  <table className="table table-xs">
                    <thead>
                      <tr className="bg-base-200/50">
                        <th>Query</th>
                        <th className="text-right">Clicks</th>
                        <th className="text-right">Impr.</th>
                        <th className="text-right">Pos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gsc.topQueries.map((q) => (
                        <tr key={q.query} className="hover">
                          <td className="font-medium max-w-[180px] truncate">
                            {q.query}
                          </td>
                          <td className="text-right tabular-nums">
                            {formatNumber(q.clicks)}
                          </td>
                          <td className="text-right tabular-nums">
                            {formatNumber(q.impressions)}
                          </td>
                          <td className="text-right tabular-nums">
                            {formatPosition(q.position)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-base-content/60">
            {gsc?.connected
              ? "No Search Console impressions or clicks recorded for this URL in the ingested period."
              : "Search Console is not connected for this project. Connect GSC in settings to view search queries."}
          </p>
        )}
      </div>
    </div>
  );
}

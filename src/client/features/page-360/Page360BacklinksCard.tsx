import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Link2 } from "lucide-react";
import type { Page360Report } from "@/types/schemas/page-360";
import { formatNumber } from "./page360Utils";

export function Page360BacklinksCard({
  projectId,
  url,
  backlinks,
}: {
  projectId: string;
  url: string;
  backlinks: Page360Report["backlinks"];
}) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-base-300 px-5 py-4">
        <div className="flex items-center gap-2">
          <Link2 className="size-4 text-primary" />
          <h3 className="font-semibold text-base">Inbound Backlinks</h3>
        </div>
        <Link
          to="/p/$projectId/backlinks"
          params={{ projectId }}
          search={{ target: url, scope: "exact_url" }}
          className="btn btn-ghost btn-xs"
        >
          Backlinks explorer
        </Link>
      </div>

      <div className="p-5 space-y-4">
        {backlinks.available ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-base-200/50 p-2.5">
              <span className="text-xs text-base-content/60 block">
                Backlinks
              </span>
              <span className="text-lg font-bold tabular-nums">
                {formatNumber(backlinks.backlinks)}
              </span>
            </div>
            <div className="rounded-lg bg-base-200/50 p-2.5">
              <span className="text-xs text-base-content/60 block">
                Ref. Domains
              </span>
              <span className="text-lg font-bold tabular-nums">
                {formatNumber(backlinks.referringDomains)}
              </span>
            </div>
            <div className="rounded-lg bg-base-200/50 p-2.5">
              <span className="text-xs text-base-content/60 block">
                Page Rank
              </span>
              <span className="text-lg font-bold tabular-nums">
                {formatNumber(backlinks.rank)}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-base-content/60">
              Backlinks overview is ready to query for this specific page URL.
            </p>
            <Link
              to="/p/$projectId/backlinks"
              params={{ projectId }}
              search={{ target: url, scope: "exact_url" }}
              className="btn btn-outline btn-sm"
            >
              <ArrowUpRight className="size-3.5" />
              Lookup Backlinks for this Page
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

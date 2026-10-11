import { Sparkles } from "lucide-react";
import type { Page360Report } from "@/types/schemas/page-360";
import { formatCtr, formatNumber } from "./page360Utils";

export function Page360Ga4Card({ ga4 }: { ga4: Page360Report["ga4"] }) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-base-300 px-5 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h3 className="font-semibold text-base">
            Traffic & Engagement (GA4)
          </h3>
        </div>
        <span className="text-xs text-base-content/50">Landing page facts</span>
      </div>

      <div className="p-5 space-y-4">
        {ga4?.totals ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-base-200/50 p-2.5">
              <span className="text-xs text-base-content/60 block">
                Sessions
              </span>
              <span className="text-lg font-bold tabular-nums">
                {formatNumber(ga4.totals.sessions)}
              </span>
            </div>
            <div className="rounded-lg bg-base-200/50 p-2.5">
              <span className="text-xs text-base-content/60 block">
                Active Users
              </span>
              <span className="text-lg font-bold tabular-nums">
                {formatNumber(ga4.totals.activeUsers)}
              </span>
            </div>
            <div className="rounded-lg bg-base-200/50 p-2.5">
              <span className="text-xs text-base-content/60 block">
                Engage Rate
              </span>
              <span className="text-lg font-bold tabular-nums">
                {formatCtr(ga4.totals.engagementRate)}
              </span>
            </div>
            <div className="rounded-lg bg-base-200/50 p-2.5">
              <span className="text-xs text-base-content/60 block">
                Key Events
              </span>
              <span className="text-lg font-bold tabular-nums">
                {formatNumber(ga4.totals.keyEvents)}
              </span>
            </div>
            <div className="rounded-lg bg-base-200/50 p-2.5">
              <span className="text-xs text-base-content/60 block">
                Conversions
              </span>
              <span className="text-lg font-bold tabular-nums">
                {formatNumber(ga4.totals.conversions)}
              </span>
            </div>
            <div className="rounded-lg bg-base-200/50 p-2.5">
              <span className="text-xs text-base-content/60 block">
                Revenue
              </span>
              <span className="text-lg font-bold tabular-nums">
                ${ga4.totals.purchaseRevenue.toFixed(2)}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-base-content/60">
            {ga4?.connected
              ? "No GA4 landing page traffic recorded for this URL in the ingested period."
              : "Google Analytics 4 is not connected. Connect GA4 in settings to view landing page traffic."}
          </p>
        )}
      </div>
    </div>
  );
}

import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  CardShell,
  EmptyCardBody,
  formatDay,
  moreDetailsClass,
  Stat,
} from "@/client/features/dashboard/cardParts";
import { getActionSummary, updateAction } from "@/serverFunctions/actions";
import type { ActionSummary } from "@/types/schemas/action-center";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { computeActionProgress } from "@/client/features/dashboard/actionCenterProgress";


export function ActionCenterCard({
  projectId,
  initialSummary,
}: {
  projectId: string;
  initialSummary?: ActionSummary | null;
}) {
  const queryClient = useQueryClient();
  const summaryQuery = useQuery({
    queryKey: ["actionSummary", projectId],
    queryFn: () => getActionSummary({ data: { projectId } }),
    initialData: initialSummary ?? undefined,
  });

  const completeMutation = useMutation({
    mutationFn: (actionId: string) =>
      updateAction({
        data: {
          projectId,
          actionId,
          status: "done",
        },
      }),
    onSuccess: async () => {
      toast.success("Action marked as resolved");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["actionSummary", projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["actions", projectId],
        }),
      ]);
    },
    onError: (err) => {
      toast.error(getStandardErrorMessage(err, "Failed to resolve action"));
    },
  });

  if (summaryQuery.isPending) {
    return (
      <CardShell title="Action Center">
        <div className="space-y-3" aria-busy>
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="skeleton h-16" />
            ))}
          </div>
          <div className="skeleton h-16 w-full" />
        </div>
      </CardShell>
    );
  }

  const summary = summaryQuery.data;

  if (!summary || summary.total === 0) {
    return (
      <CardShell title="Action Center">
        <EmptyCardBody
          message="Turn technical audit findings into prioritized, trackable SEO actions."
          cta={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/p/$projectId/actions"
                params={{ projectId }}
                className="btn btn-primary btn-sm"
              >
                Open Action Center
              </Link>
              <Link
                to="/p/$projectId/audit"
                params={{ projectId }}
                className="btn btn-ghost btn-sm"
              >
                Run an audit
              </Link>
            </div>
          }
        />
      </CardShell>
    );
  }

  const { actionable, percentage } = computeActionProgress(summary);
  const stamp = summary.latestActionAt
    ? `Actions · updated ${formatDay(summary.latestActionAt)}`
    : `Actions · ${summary.openCount} open · ${summary.doneCount} resolved`;

  return (
    <CardShell
      title="Action Center"
      stamp={stamp}
      action={
        <Link
          to="/p/$projectId/actions"
          params={{ projectId }}
          className={moreDetailsClass}
        >
          More details
        </Link>
      }
    >
      <div className="space-y-4">
        {/* Metric counts */}
        <div className="grid grid-cols-3 gap-3">
          <Stat
            label="Open"
            value={summary.openCount.toLocaleString()}
            sub={
              summary.criticalCount > 0 ? (
                <span className="text-xs font-medium text-error">
                  {summary.criticalCount} critical
                </span>
              ) : summary.warningCount > 0 ? (
                <span className="text-xs font-medium text-warning">
                  {summary.warningCount} warning
                </span>
              ) : null
            }
          />
          <Stat
            label="In progress"
            value={summary.inProgressCount.toLocaleString()}
          />
          <Stat
            label="Resolved"
            value={summary.doneCount.toLocaleString()}
            tone={summary.doneCount > 0 ? "success" : undefined}
          />
        </div>

        {/* Progress bar */}
        {actionable > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-base-content/70">
              <span>Resolution progress</span>
              <span className="font-medium tabular-nums">
                {summary.doneCount} of {actionable} ({percentage}%)
              </span>
            </div>
            <progress
              className="progress progress-success h-2 w-full"
              value={percentage}
              max={100}
              aria-label="Resolution progress"
            />
          </div>
        ) : null}

        {/* Top open actions list */}
        {summary.topActions.length > 0 ? (
          <div className="space-y-2 pt-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-base-content/60">
              Top Priority Actions
            </p>
            <ul className="space-y-2">
              {summary.topActions.map((action) => (
                <li
                  key={action.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-base-200 bg-base-200/40 p-2.5 text-sm transition hover:bg-base-200/70"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`size-2 shrink-0 rounded-full ${
                        action.severity === "critical"
                          ? "bg-error"
                          : action.severity === "warning"
                            ? "bg-warning"
                            : "bg-base-content/30"
                      }`}
                      title={`${action.severity} severity`}
                    />
                    <div className="min-w-0 truncate">
                      <Link
                        to="/p/$projectId/actions"
                        params={{ projectId }}
                        className="truncate font-medium hover:underline"
                      >
                        {action.title}
                      </Link>
                      <p className="text-[11px] text-base-content/50">
                        {action.affectedPageCount}{" "}
                        {action.affectedPageCount === 1 ? "page" : "pages"}{" "}
                        affected
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      title="Mark as resolved"
                      aria-label={`Mark ${action.title} as resolved`}
                      disabled={completeMutation.isPending}
                      onClick={() => completeMutation.mutate(action.id)}
                      className="btn btn-circle btn-ghost btn-xs text-base-content/50 hover:bg-success/15 hover:text-success"
                    >
                      <Check className="size-3.5" />
                    </button>
                    <Link
                      to="/p/$projectId/actions"
                      params={{ projectId }}
                      className="btn btn-circle btn-ghost btn-xs text-base-content/40 hover:text-base-content"
                      aria-label="View action details"
                    >
                      <ChevronRight className="size-3.5" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : summary.openCount === 0 && summary.total > 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm text-success">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>All open actions resolved! Great job.</span>
          </div>
        ) : null}
      </div>
    </CardShell>
  );
}

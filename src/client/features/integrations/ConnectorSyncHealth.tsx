import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  getConnectorHealth,
  listConnectorSyncRuns,
  syncConnectorNow,
} from "@/serverFunctions/connector-ingestion";
import type {
  ConnectorHealthState,
  ConnectorProvider,
} from "@/server/features/connector-ingestion/types";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  connectorHealthPollInterval,
  formatConnectorDate,
  formatConnectorTimestamp,
} from "./connectorSyncFormatting";
import { ConnectorSyncHealthError } from "./ConnectorSyncHealthError";

const STATUS_LABELS: Record<ConnectorHealthState, string> = {
  disconnected: "Disconnected",
  never_synced: "Never synced",
  syncing: "Syncing",
  healthy: "Up to date",
  stale: "Behind",
  error: "Needs attention",
};

function stateClasses(state: ConnectorHealthState): string {
  if (state === "healthy")
    return "border-success/30 bg-success/10 text-success";
  if (state === "error") return "border-error/30 bg-error/10 text-error";
  if (state === "stale") return "border-warning/30 bg-warning/10 text-warning";
  return "border-base-300 bg-base-200 text-base-content/60";
}

export function ConnectorSyncHealth({
  projectId,
  provider,
}: {
  projectId: string;
  provider: ConnectorProvider;
}) {
  const queryClient = useQueryClient();
  const healthKey = useMemo(() => ["connectorHealth", projectId], [projectId]);
  const runsKey = useMemo(
    () => ["connectorSyncRuns", projectId, provider],
    [projectId, provider],
  );
  const healthQuery = useQuery({
    queryKey: healthKey,
    queryFn: () => getConnectorHealth({ data: { projectId } }),
    refetchInterval: (query) =>
      connectorHealthPollInterval(query.state.data?.[provider]?.state),
  });
  const health = healthQuery.data?.[provider];
  const previousState = useRef<ConnectorHealthState | undefined>(undefined);
  const runsQuery = useQuery({
    queryKey: runsKey,
    queryFn: () =>
      listConnectorSyncRuns({ data: { projectId, provider, limit: 5 } }),
    enabled: Boolean(health),
  });
  const syncMutation = useMutation({
    mutationFn: () => syncConnectorNow({ data: { projectId, provider } }),
    onSuccess: (run) => {
      if (run.status === "succeeded") {
        toast.success(
          `${provider === "gsc" ? "Search Console" : "Analytics"} sync complete`,
        );
      } else {
        toast.error(run.errorMessage ?? "Connector sync failed");
      }
      void queryClient.invalidateQueries({ queryKey: healthKey });
      void queryClient.invalidateQueries({ queryKey: runsKey });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  useEffect(() => {
    if (
      previousState.current === "syncing" &&
      health?.state &&
      health.state !== "syncing"
    ) {
      void queryClient.invalidateQueries({ queryKey: runsKey });
    }
    previousState.current = health?.state;
  }, [health?.state, queryClient, runsKey]);

  if (healthQuery.isError) {
    return (
      <ConnectorSyncHealthError
        provider={provider}
        retry={() => void healthQuery.refetch()}
        retrying={healthQuery.isFetching}
      />
    );
  }

  if (healthQuery.isLoading || !health) {
    return (
      <div
        className="h-20 animate-pulse rounded-lg bg-base-200"
        data-testid={`connector-sync-health-loading-${provider}`}
      />
    );
  }

  const syncing = health.state === "syncing" || syncMutation.isPending;
  return (
    <div
      className="rounded-lg border border-base-300 bg-base-200/30 p-3.5"
      data-testid={`connector-sync-health-${provider}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${stateClasses(health.state)}`}
              data-testid={`connector-sync-status-${provider}`}
            >
              {STATUS_LABELS[health.state]}
            </span>
            <span className="text-xs text-base-content/55">
              Data through{" "}
              <strong
                className="font-medium text-base-content/75"
                data-testid={`connector-data-through-${provider}`}
              >
                {formatConnectorDate(health.cursor?.lastCompleteDate ?? null)}
              </strong>
            </span>
          </div>
          <p
            className="mt-1.5 text-xs text-base-content/55"
            data-testid={`connector-last-sync-${provider}`}
          >
            Last successful sync:{" "}
            {formatConnectorTimestamp(health.cursor?.lastSuccessAt ?? null)}
          </p>
          {health.cursor?.lastErrorMessage ? (
            <p
              className="mt-1 text-xs text-error"
              role="status"
              data-testid={`connector-last-error-${provider}`}
            >
              {health.cursor.lastErrorMessage}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm min-h-9 border-base-300"
          disabled={syncing}
          onClick={() => syncMutation.mutate()}
          data-testid={`button-sync-now-${provider}`}
        >
          <RefreshCw
            className={`size-3.5 ${syncing ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

      <details
        className="mt-2 text-xs"
        data-testid={`recent-sync-runs-${provider}`}
      >
        <summary
          className="cursor-pointer select-none text-base-content/60 hover:text-base-content"
          data-testid={`button-recent-sync-runs-${provider}`}
        >
          Recent syncs
        </summary>
        <div className="mt-2 overflow-x-auto">
          {runsQuery.isLoading ? (
            <p className="py-2 text-base-content/50">Loading history…</p>
          ) : runsQuery.data?.length ? (
            <ul className="divide-y divide-base-300" role="list">
              {runsQuery.data.map((run) => (
                <li
                  key={run.id}
                  className="flex min-w-80 items-center justify-between gap-4 py-2"
                  data-testid={`connector-sync-run-${run.id}`}
                >
                  <span className="capitalize text-base-content/70">
                    {run.status} · {run.trigger}
                  </span>
                  <span className="text-right text-base-content/50">
                    {run.effectiveStartDate}–{run.effectiveEndDate} ·{" "}
                    {run.rowsWritten.toLocaleString()} rows
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-base-content/50">No sync runs yet.</p>
          )}
        </div>
      </details>
    </div>
  );
}

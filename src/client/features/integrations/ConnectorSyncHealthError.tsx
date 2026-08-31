import { RefreshCw } from "lucide-react";
import type { ConnectorProvider } from "@/server/features/connector-ingestion/types";

export function ConnectorSyncHealthError({
  provider,
  retry,
  retrying = false,
}: {
  provider: ConnectorProvider;
  retry: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-error/25 bg-error/5 p-3.5"
      role="alert"
      data-testid={`connector-sync-health-error-${provider}`}
    >
      <div>
        <p className="text-sm font-medium text-base-content">
          Sync health unavailable
        </p>
        <p className="mt-0.5 text-xs text-base-content/60">
          We couldn&apos;t load this connector&apos;s sync status.
        </p>
      </div>
      <button
        type="button"
        className="btn btn-outline btn-sm min-h-9 border-base-300"
        onClick={retry}
        disabled={retrying}
        data-testid={`button-retry-sync-health-${provider}`}
      >
        <RefreshCw
          className={`size-3.5 ${retrying ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

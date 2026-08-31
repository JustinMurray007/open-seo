import { ConnectorIngestionRepository } from "../repositories/ConnectorIngestionRepository";
import { ConnectorIngestionService } from "./ConnectorIngestionService";
import type { ConnectorProvider } from "../types";

export type ConnectorSchedulerSummary = {
  candidates: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: number;
};

export async function runScheduledConnectorSyncs(
  options: {
    now?: Date;
    providers?: ConnectorProvider[];
    listProjects?: (
      provider: ConnectorProvider,
      nowIso: string,
    ) => Promise<string[]>;
    syncProject?: (
      projectId: string,
      provider: ConnectorProvider,
    ) => Promise<{ status: string }>;
  } = {},
): Promise<ConnectorSchedulerSummary> {
  const now = options.now ?? new Date();
  const providers = options.providers ?? ["gsc", "ga4"];
  const listProjects =
    options.listProjects ??
    ((provider, nowIso) =>
      ConnectorIngestionRepository.listRetryableConnectedProjectIds(
        provider,
        nowIso,
      ));
  const syncProject =
    options.syncProject ??
    ((projectId, provider) =>
      ConnectorIngestionService.sync({
        projectId,
        provider,
        trigger: "scheduled",
      }));
  const summary: ConnectorSchedulerSummary = {
    candidates: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: 0,
  };

  for (const provider of providers) {
    const projectIds = await listProjects(provider, now.toISOString());
    summary.candidates += projectIds.length;
    for (const projectId of projectIds) {
      try {
        const run = await syncProject(projectId, provider);
        if (run.status === "succeeded") summary.succeeded += 1;
        else summary.failed += 1;
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === "ConnectorSyncAlreadyRunningError" ||
            error.name === "ConnectorNotConnectedError")
        ) {
          summary.skipped += 1;
        } else {
          summary.errors += 1;
          console.error("[connector-sync] project failed", {
            provider,
            projectId,
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
        }
      }
    }
  }
  const log = summary.failed || summary.errors ? console.error : console.log;
  log({ event: "connector_sync_scheduler_summary", ...summary });
  return summary;
}

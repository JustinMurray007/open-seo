/* eslint-disable max-lines -- page and its tightly coupled responsive row/modal states stay colocated */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  RefreshCw,
  X,
} from "lucide-react";
import {
  listActions,
  syncLatestAuditActions,
  updateAction,
} from "@/serverFunctions/actions";
import type {
  ActionSeverity,
  ActionStatus,
} from "@/types/schemas/action-center";
import {
  actionSeveritySchema,
  actionStatusSchema,
} from "@/types/schemas/action-center";
import { actionsToCsv, actionsToMarkdown } from "./export";
import { downloadFile } from "@/client/lib/download";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";

type ActionRow = Awaited<ReturnType<typeof listActions>>[number];
type FilterValue<T extends string> = T | "all";

const STATUS_LABELS: Record<ActionStatus, string> = {
  open: "Open",
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  dismissed: "Dismissed",
};

const SEVERITY_CLASS: Record<ActionSeverity, string> = {
  critical: "badge-error",
  warning: "badge-warning",
  info: "badge-ghost",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function ActionCenterPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<FilterValue<ActionStatus>>("all");
  const [severity, setSeverity] = useState<FilterValue<ActionSeverity>>("all");
  const [selected, setSelected] = useState<ActionRow | null>(null);
  const queryKey = ["actions", projectId, status, severity] as const;
  const actionsQuery = useQuery({
    queryKey,
    queryFn: () =>
      listActions({
        data: {
          projectId,
          statuses: status === "all" ? undefined : [status],
          severities: severity === "all" ? undefined : [severity],
        },
      }),
  });
  const syncMutation = useMutation({
    mutationFn: () => syncLatestAuditActions({ data: { projectId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["actions", projectId] });
    },
  });
  const actions = actionsQuery.data ?? [];
  const counts = (() => {
    const result = { active: 0, critical: 0, done: 0 };
    for (const action of actions) {
      if (!["done", "dismissed"].includes(action.status)) result.active++;
      if (action.severity === "critical") result.critical++;
      if (action.status === "done") result.done++;
    }
    return result;
  })();

  const exportFile = (format: "csv" | "md") => {
    const content =
      format === "csv" ? actionsToCsv(actions) : actionsToMarkdown(actions);
    downloadFile(
      content,
      `seo-actions.${format}`,
      format === "csv" ? "text/csv" : "text/markdown",
    );
  };

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 md:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Action Center</h1>
          <p className="mt-1 text-sm text-base-content/60">
            Turn the latest completed technical audit into prioritized work.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-primary btn-sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync-latest-audit"
          >
            <RefreshCw
              className={`size-4 ${syncMutation.isPending ? "animate-spin" : ""}`}
            />
            Sync latest audit
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => exportFile("csv")}
            disabled={actions.length === 0}
            data-testid="button-export-csv"
          >
            <Download className="size-4" /> CSV
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => exportFile("md")}
            disabled={actions.length === 0}
            data-testid="button-export-markdown"
          >
            <FileText className="size-4" /> Markdown
          </button>
        </div>
      </header>

      {syncMutation.isError && (
        <div
          className="alert alert-error text-sm"
          data-testid="status-sync-error"
        >
          <AlertCircle className="size-4" />
          <span>
            {getErrorCode(syncMutation.error) === "NOT_FOUND"
              ? "Run and complete a site audit before syncing actions."
              : getStandardErrorMessage(
                  syncMutation.error,
                  "Actions could not be synced. Please try again.",
                )}
          </span>
        </div>
      )}
      {syncMutation.isSuccess && (
        <div
          className="alert alert-success text-sm"
          data-testid="status-sync-success"
        >
          <CheckCircle2 className="size-4" />
          <span>
            Synced {syncMutation.data.syncedActionCount} actions from the latest
            completed audit.
          </span>
        </div>
      )}

      <section
        className="grid grid-cols-3 divide-x divide-base-300 rounded-lg border border-base-300 bg-base-100"
        aria-label="Action summary"
      >
        {[
          ["Active", counts.active],
          ["Critical", counts.critical],
          ["Done", counts.done],
        ].map(([label, value]) => (
          <div className="px-4 py-3" key={label}>
            <div className="text-xs font-medium uppercase tracking-wide text-base-content/50">
              {label}
            </div>
            <div
              className="mt-1 text-xl font-semibold tabular-nums"
              data-testid={`metric-${String(label).toLowerCase()}`}
            >
              {value}
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap items-end gap-3" aria-label="Filters">
        <label className="form-control w-full sm:w-44">
          <span className="label-text mb-1 text-xs font-medium">Status</span>
          <select
            className="select select-bordered select-sm"
            value={status}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "all") setStatus("all");
              else {
                const parsed = actionStatusSchema.safeParse(value);
                if (parsed.success) setStatus(parsed.data);
              }
            }}
            data-testid="select-status-filter"
          >
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-control w-full sm:w-44">
          <span className="label-text mb-1 text-xs font-medium">Severity</span>
          <select
            className="select select-bordered select-sm"
            value={severity}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "all") setSeverity("all");
              else {
                const parsed = actionSeveritySchema.safeParse(value);
                if (parsed.success) setSeverity(parsed.data);
              }
            }}
            data-testid="select-severity-filter"
          >
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </label>
      </section>

      {actionsQuery.isLoading ? (
        <div className="space-y-2" data-testid="status-actions-loading">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="skeleton h-16 w-full" />
          ))}
        </div>
      ) : actionsQuery.isError ? (
        <div className="alert alert-error" data-testid="status-actions-error">
          <AlertCircle className="size-5" />
          <span>Actions could not be loaded. Please try again.</span>
          <button className="btn btn-sm" onClick={() => actionsQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : actions.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-base-300 py-14 text-center"
          data-testid="status-actions-empty"
        >
          <ClipboardList className="mx-auto size-8 text-base-content/35" />
          <h2 className="mt-3 font-semibold">No matching actions</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-base-content/60">
            Sync a completed site audit to build your prioritized action list,
            or adjust the filters.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-base-300 md:block">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Action</th>
                  <th>Affected</th>
                  <th>Status</th>
                  <th>Last seen</th>
                  <th>
                    <span className="sr-only">Evidence</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {actions.map((action) => (
                  <ActionTableRow
                    key={action.id}
                    action={action}
                    projectId={projectId}
                    onEvidence={() => setSelected(action)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {actions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                projectId={projectId}
                onEvidence={() => setSelected(action)}
              />
            ))}
          </div>
        </>
      )}
      {selected && (
        <EvidenceModal action={selected} onClose={() => setSelected(null)} />
      )}
    </main>
  );
}

function ActionEditor({
  action,
  projectId,
}: {
  action: ActionRow;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(action.notes);
  const mutation = useMutation({
    mutationFn: (change: { status?: ActionStatus; notes?: string }) =>
      updateAction({ data: { projectId, actionId: action.id, ...change } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["actions", projectId] });
    },
  });
  return (
    <div className="space-y-2">
      <select
        className="select select-bordered select-sm w-full"
        value={action.status}
        onChange={(event) => {
          const parsed = actionStatusSchema.safeParse(event.target.value);
          if (parsed.success) mutation.mutate({ status: parsed.data });
        }}
        disabled={mutation.isPending}
        aria-label={`Status for ${action.title}`}
        data-testid={`select-action-status-${action.id}`}
      >
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <option value={value} key={value}>
            {label}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <input
          className="input input-bordered input-sm min-w-0 flex-1"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Add a note"
          aria-label={`Notes for ${action.title}`}
          data-testid={`input-action-notes-${action.id}`}
        />
        <button
          className="btn btn-sm"
          onClick={() => mutation.mutate({ notes })}
          disabled={mutation.isPending || notes === action.notes}
          data-testid={`button-save-notes-${action.id}`}
        >
          Save
        </button>
      </div>
      <div className="min-h-4 text-xs" aria-live="polite">
        {mutation.isSuccess && (
          <span
            className="text-success"
            data-testid={`status-saved-${action.id}`}
          >
            Saved
          </span>
        )}
        {mutation.isError && (
          <span
            className="text-error"
            data-testid={`status-error-${action.id}`}
          >
            Could not save
          </span>
        )}
      </div>
    </div>
  );
}

function ActionTableRow({
  action,
  projectId,
  onEvidence,
}: {
  action: ActionRow;
  projectId: string;
  onEvidence: () => void;
}) {
  return (
    <tr data-testid={`row-action-${action.id}`}>
      <td>
        <span
          className={`badge badge-sm capitalize ${SEVERITY_CLASS[action.severity]}`}
        >
          {action.severity}
        </span>
      </td>
      <td className="max-w-md">
        <div className="font-medium">{action.title}</div>
        <div className="mt-1 line-clamp-2 text-xs text-base-content/55">
          {action.reason}
        </div>
      </td>
      <td className="tabular-nums">{action.affectedPageCount}</td>
      <td className="w-72">
        <ActionEditor action={action} projectId={projectId} />
      </td>
      <td className="whitespace-nowrap text-xs">
        {formatDate(action.lastSeenAt)}
      </td>
      <td>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onEvidence}
          data-testid={`button-evidence-${action.id}`}
        >
          Evidence <ExternalLink className="size-3.5" />
        </button>
      </td>
    </tr>
  );
}

function ActionCard({
  action,
  projectId,
  onEvidence,
}: {
  action: ActionRow;
  projectId: string;
  onEvidence: () => void;
}) {
  return (
    <article
      className="rounded-lg border border-base-300 bg-base-100 p-4"
      data-testid={`card-action-${action.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span
            className={`badge badge-sm capitalize ${SEVERITY_CLASS[action.severity]}`}
          >
            {action.severity}
          </span>
          <h2 className="mt-2 font-semibold">{action.title}</h2>
        </div>
        <span className="text-xs tabular-nums text-base-content/55">
          {action.affectedPageCount} pages
        </span>
      </div>
      <p className="mt-2 text-sm text-base-content/60">{action.reason}</p>
      <div className="mt-4">
        <ActionEditor action={action} projectId={projectId} />
      </div>
      <button
        className="btn btn-ghost btn-sm mt-2"
        onClick={onEvidence}
        data-testid={`button-evidence-mobile-${action.id}`}
      >
        View evidence
      </button>
    </article>
  );
}

function EvidenceModal({
  action,
  onClose,
}: {
  action: ActionRow;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal modal-open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-title"
      tabIndex={-1}
    >
      <div className="modal-box max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="evidence-title" className="text-lg font-semibold">
              {action.title}
            </h2>
            <p className="mt-1 text-sm text-base-content/60">
              {action.evidence.length} evidence{" "}
              {action.evidence.length === 1 ? "item" : "items"} from audit{" "}
              {action.sourceAuditId}
            </p>
          </div>
          <button
            className="btn btn-ghost btn-sm btn-square"
            onClick={onClose}
            aria-label="Close evidence"
            data-testid="button-close-evidence"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-5 max-h-[60vh] space-y-2 overflow-y-auto">
          {action.evidence.map((item) => (
            <div
              key={item.id}
              className="rounded-md border border-base-300 p-3"
            >
              <a
                className="link link-hover break-all text-sm"
                href={item.url}
                target="_blank"
                rel="noreferrer"
                data-testid={`link-evidence-${item.id}`}
              >
                {item.url}
              </a>
              {item.detailsJson && (
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-base-content/55">
                  {item.detailsJson}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
      <button
        className="modal-backdrop"
        onClick={onClose}
        aria-label="Close evidence overlay"
      >
        close
      </button>
    </div>
  );
}

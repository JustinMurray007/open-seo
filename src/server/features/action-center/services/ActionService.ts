import { ActionRepository } from "@/server/features/action-center/repositories/ActionRepository";
import {
  getIssueDescriptor,
  ISSUE_SEVERITY_ORDER,
  type IssueSeverity,
} from "@/shared/audit-issues";
import { AppError } from "@/server/lib/errors";
import type {
  ActionSeverity,
  ActionStatus,
} from "@/types/schemas/action-center";

export function sortActions<
  T extends {
    severity: ActionSeverity;
    affectedPageCount: number;
    title: string;
  },
>(rows: T[]): T[] {
  return rows.toSorted(
    (a, b) =>
      ISSUE_SEVERITY_ORDER[a.severity as IssueSeverity] -
        ISSUE_SEVERITY_ORDER[b.severity as IssueSeverity] ||
      b.affectedPageCount - a.affectedPageCount ||
      a.title.localeCompare(b.title),
  );
}

async function syncLatestAudit(projectId: string, actorUserId: string) {
  const audit = await ActionRepository.getLatestCompletedAudit(projectId);
  if (!audit) {
    throw new AppError(
      "NOT_FOUND",
      "Run and complete a site audit before syncing actions.",
    );
  }
  const issues = await ActionRepository.getIssuesForAudit(audit.id);
  const grouped = new Map<string, typeof issues>();
  for (const issue of issues) {
    const group = grouped.get(issue.issueType) ?? [];
    group.push(issue);
    grouped.set(issue.issueType, group);
  }

  let syncedActionCount = 0;
  for (const [issueType, group] of grouped) {
    const descriptor = getIssueDescriptor(issueType);
    if (!descriptor) continue;
    const action = await ActionRepository.upsertFromAudit(
      {
        id: crypto.randomUUID(),
        projectId,
        fingerprint: `audit:v1:${issueType}`,
        severity: descriptor.severity,
        sourceAuditId: audit.id,
        issueType,
        title: descriptor.title,
        reason: descriptor.explanation,
        affectedPageCount: new Set(group.map((issue) => issue.pageUrl)).size,
        seenAt: audit.completedAt ?? audit.startedAt,
      },
      actorUserId,
    );
    await ActionRepository.replaceEvidence(
      action.id,
      audit.id,
      group.map((issue) => ({
        id: `${action.id}:${issue.id}`,
        url: issue.pageUrl,
        detailsJson: issue.detailsJson,
      })),
    );
    syncedActionCount++;
  }

  return {
    auditId: audit.id,
    syncedActionCount,
    actions: await listActions({ projectId }),
  };
}

async function listActions(input: {
  projectId: string;
  statuses?: ActionStatus[];
  severities?: ActionSeverity[];
}) {
  const rows = await ActionRepository.listForProject(input);
  return sortActions(rows);
}

async function updateAction(input: {
  projectId: string;
  actionId: string;
  status?: ActionStatus;
  notes?: string;
  actorUserId: string;
}) {
  let action = await ActionRepository.getForProject(
    input.actionId,
    input.projectId,
  );
  if (!action) throw new AppError("NOT_FOUND", "Action not found.");
  if (input.status !== undefined) {
    action =
      (await ActionRepository.updateStatus({
        actionId: input.actionId,
        projectId: input.projectId,
        status: input.status,
        actorUserId: input.actorUserId,
      })) ?? action;
  }
  if (input.notes !== undefined) {
    action =
      (await ActionRepository.updateNotes({
        actionId: input.actionId,
        projectId: input.projectId,
        notes: input.notes,
        actorUserId: input.actorUserId,
      })) ?? action;
  }
  return action;
}

async function getActionSummary(projectId: string) {
  return ActionRepository.getSummary(projectId);
}

export const ActionService = {
  syncLatestAudit,
  listActions,
  updateAction,
  getActionSummary,
} as const;


import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  actionEvidence,
  actionEvents,
  actions,
  auditIssues,
  audits,
} from "@/db/schema";
import type {
  ActionSeverity,
  ActionStatus,
} from "@/types/schemas/action-center";

export type AuditActionInput = {
  id: string;
  projectId: string;
  fingerprint: string;
  severity: ActionSeverity;
  sourceAuditId: string;
  issueType: string;
  title: string;
  reason: string;
  affectedPageCount: number;
  seenAt: string;
};

async function getLatestCompletedAudit(projectId: string) {
  const rows = await db
    .select()
    .from(audits)
    .where(and(eq(audits.projectId, projectId), eq(audits.status, "completed")))
    .orderBy(desc(audits.completedAt), desc(audits.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

async function getIssuesForAudit(auditId: string) {
  return db.select().from(auditIssues).where(eq(auditIssues.auditId, auditId));
}

async function upsertFromAudit(input: AuditActionInput, actorUserId: string) {
  const existingRows = await db
    .select()
    .from(actions)
    .where(
      and(
        eq(actions.projectId, input.projectId),
        eq(actions.fingerprint, input.fingerprint),
      ),
    )
    .limit(1);
  const existing = existingRows[0];
  const shouldReopen =
    existing?.status === "done" &&
    existing.sourceAuditId !== input.sourceAuditId;
  const now = new Date().toISOString();

  const rows = await db
    .insert(actions)
    .values({
      id: input.id,
      projectId: input.projectId,
      fingerprint: input.fingerprint,
      status: "open",
      severity: input.severity,
      source: "audit",
      sourceAuditId: input.sourceAuditId,
      issueType: input.issueType,
      title: input.title,
      reason: input.reason,
      affectedPageCount: input.affectedPageCount,
      firstSeenAt: input.seenAt,
      lastSeenAt: input.seenAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [actions.projectId, actions.fingerprint],
      set: {
        severity: input.severity,
        sourceAuditId: input.sourceAuditId,
        title: input.title,
        reason: input.reason,
        affectedPageCount: input.affectedPageCount,
        lastSeenAt: input.seenAt,
        updatedAt: now,
        ...(shouldReopen ? { status: "open" as const, completedAt: null } : {}),
      },
    })
    .returning();
  const action = rows[0];

  if (shouldReopen) {
    await db.insert(actionEvents).values({
      id: crypto.randomUUID(),
      actionId: action.id,
      eventType: "status_change",
      fromStatus: "done",
      toStatus: "open",
      note: "Reopened because the issue appeared in a newer completed audit.",
      actorUserId,
    });
  }
  return action;
}

async function replaceEvidence(
  actionId: string,
  sourceAuditId: string,
  evidence: Array<{ id: string; url: string; detailsJson: string | null }>,
) {
  await db.delete(actionEvidence).where(eq(actionEvidence.actionId, actionId));
  if (evidence.length === 0) return;
  await db.insert(actionEvidence).values(
    evidence.map((item) => ({
      ...item,
      actionId,
      sourceAuditId,
    })),
  );
}

async function listForProject(input: {
  projectId: string;
  statuses?: ActionStatus[];
  severities?: ActionSeverity[];
}) {
  const filters = [eq(actions.projectId, input.projectId)];
  if (input.statuses?.length)
    filters.push(inArray(actions.status, input.statuses));
  if (input.severities?.length)
    filters.push(inArray(actions.severity, input.severities));

  const actionRows = await db
    .select()
    .from(actions)
    .where(and(...filters));
  if (actionRows.length === 0) return [];

  const evidenceRows = await db
    .select()
    .from(actionEvidence)
    .where(
      inArray(
        actionEvidence.actionId,
        actionRows.map((row) => row.id),
      ),
    );
  const byAction = new Map<string, typeof evidenceRows>();
  for (const evidence of evidenceRows) {
    const group = byAction.get(evidence.actionId) ?? [];
    group.push(evidence);
    byAction.set(evidence.actionId, group);
  }
  return actionRows.map((action) => ({
    ...action,
    evidence: byAction.get(action.id) ?? [],
  }));
}

async function getForProject(actionId: string, projectId: string) {
  const rows = await db
    .select()
    .from(actions)
    .where(and(eq(actions.id, actionId), eq(actions.projectId, projectId)))
    .limit(1);
  return rows[0] ?? null;
}

async function updateStatus(input: {
  actionId: string;
  projectId: string;
  status: ActionStatus;
  actorUserId: string;
}) {
  const current = await getForProject(input.actionId, input.projectId);
  if (!current || current.status === input.status) return current;
  const now = new Date().toISOString();
  const rows = await db
    .update(actions)
    .set({
      status: input.status,
      completedAt: input.status === "done" ? now : null,
      dismissedAt: input.status === "dismissed" ? now : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(actions.id, input.actionId),
        eq(actions.projectId, input.projectId),
      ),
    )
    .returning();
  await db.insert(actionEvents).values({
    id: crypto.randomUUID(),
    actionId: input.actionId,
    eventType: "status_change",
    fromStatus: current.status,
    toStatus: input.status,
    actorUserId: input.actorUserId,
  });
  return rows[0] ?? null;
}

async function updateNotes(input: {
  actionId: string;
  projectId: string;
  notes: string;
  actorUserId: string;
}) {
  const current = await getForProject(input.actionId, input.projectId);
  if (!current || current.notes === input.notes) return current;
  const rows = await db
    .update(actions)
    .set({ notes: input.notes, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(actions.id, input.actionId),
        eq(actions.projectId, input.projectId),
      ),
    )
    .returning();
  await db.insert(actionEvents).values({
    id: crypto.randomUUID(),
    actionId: input.actionId,
    eventType: "note_change",
    note: input.notes,
    actorUserId: input.actorUserId,
  });
  return rows[0] ?? null;
}

export const ActionRepository = {
  getLatestCompletedAudit,
  getIssuesForAudit,
  upsertFromAudit,
  replaceEvidence,
  listForProject,
  getForProject,
  updateStatus,
  updateNotes,
} as const;

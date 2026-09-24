import { z } from "zod";

export const actionStatusSchema = z.enum([
  "open",
  "planned",
  "in_progress",
  "done",
  "dismissed",
]);

export const actionSeveritySchema = z.enum(["critical", "warning", "info"]);

export type ActionStatus = z.infer<typeof actionStatusSchema>;
export type ActionSeverity = z.infer<typeof actionSeveritySchema>;

export const listActionsSchema = z.object({
  projectId: z.string().min(1),
  statuses: z.array(actionStatusSchema).optional(),
  severities: z.array(actionSeveritySchema).optional(),
});

export const syncActionsSchema = z.object({
  projectId: z.string().min(1),
});

export const updateActionSchema = z
  .object({
    projectId: z.string().min(1),
    actionId: z.string().min(1),
    status: actionStatusSchema.optional(),
    notes: z.string().max(10_000).optional(),
  })
  .refine((value) => value.status !== undefined || value.notes !== undefined, {
    message: "Provide a status or notes update",
  });

export const actionSummaryItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: actionSeveritySchema,
  status: actionStatusSchema,
  issueType: z.string(),
  affectedPageCount: z.number(),
});

export const actionSummarySchema = z.object({
  total: z.number(),
  openCount: z.number(),
  inProgressCount: z.number(),
  doneCount: z.number(),
  dismissedCount: z.number(),
  criticalCount: z.number(),
  warningCount: z.number(),
  topActions: z.array(actionSummaryItemSchema),
  latestActionAt: z.string().nullable(),
});

export type ActionSummaryItem = z.infer<typeof actionSummaryItemSchema>;
export type ActionSummary = z.infer<typeof actionSummarySchema>;

export const getActionSummarySchema = z.object({
  projectId: z.string().min(1),
});


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

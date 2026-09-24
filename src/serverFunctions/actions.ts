import { createServerFn } from "@tanstack/react-start";
import { ActionService } from "@/server/features/action-center/services/ActionService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  getActionSummarySchema,
  listActionsSchema,
  syncActionsSchema,
  updateActionSchema,
} from "@/types/schemas/action-center";

export const listActions = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listActionsSchema)
  .handler(({ data, context }) =>
    ActionService.listActions({ ...data, projectId: context.projectId }),
  );

export const getActionSummary = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getActionSummarySchema)
  .handler(({ context }) => ActionService.getActionSummary(context.projectId));

export const syncLatestAuditActions = createServerFn({ method: "POST" })

  .middleware(requireProjectContext)
  .validator(syncActionsSchema)
  .handler(({ context }) =>
    ActionService.syncLatestAudit(context.projectId, context.userId),
  );

export const updateAction = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateActionSchema)
  .handler(({ data, context }) =>
    ActionService.updateAction({
      ...data,
      projectId: context.projectId,
      actorUserId: context.userId,
    }),
  );

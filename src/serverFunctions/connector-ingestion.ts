import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ConnectorDatePolicyError,
  ConnectorIngestionRepository,
  ConnectorIngestionService,
  ConnectorNotConnectedError,
  ConnectorSyncAlreadyRunningError,
} from "@/server/features/connector-ingestion";
import { AppError } from "@/server/lib/errors";
import { requireProjectContext } from "@/serverFunctions/middleware";

const providerSchema = z.enum(["gsc", "ga4"]);
const projectSchema = z.object({ projectId: z.string().min(1) });
const syncSchema = projectSchema.extend({
  provider: providerSchema,
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
const listSchema = projectSchema.extend({
  provider: providerSchema,
  limit: z.number().int().min(1).max(50).default(10),
});

export const getConnectorHealth = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectSchema)
  .handler(async ({ context }) =>
    ConnectorIngestionService.getHealth(context.projectId),
  );

export const syncConnectorNow = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(syncSchema)
  .handler(async ({ data, context }) => {
    try {
      return await ConnectorIngestionService.sync({
        projectId: context.projectId,
        provider: data.provider,
        trigger: "manual",
        actorUserId: context.userId,
        startDate: data.startDate,
        endDate: data.endDate,
      });
    } catch (error) {
      if (error instanceof ConnectorNotConnectedError) {
        throw new AppError("CONFLICT", "The connector is not connected.");
      }
      if (error instanceof ConnectorSyncAlreadyRunningError) {
        throw new AppError("CONFLICT", "A connector sync is already running.");
      }
      if (error instanceof ConnectorDatePolicyError) {
        throw new AppError("VALIDATION_ERROR", error.message);
      }
      throw error;
    }
  });

export const listConnectorSyncRuns = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listSchema)
  .handler(({ data, context }) =>
    ConnectorIngestionRepository.listRuns({
      projectId: context.projectId,
      provider: data.provider,
      limit: data.limit,
    }),
  );

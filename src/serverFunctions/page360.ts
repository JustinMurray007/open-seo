import { createServerFn } from "@tanstack/react-start";
import { Page360Service } from "@/server/features/page-360/services/Page360Service";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  page360KnownPagesInputSchema,
  page360ReportInputSchema,
} from "@/types/schemas/page-360";

export const getPage360Report = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(page360ReportInputSchema)
  .handler(({ data, context }) =>
    Page360Service.getPage360Report({
      projectId: context.projectId,
      url: data.url,
      projectDomain: context.project.domain,
      billingCustomer: context,
    }),
  );

export const listPage360KnownPages = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(page360KnownPagesInputSchema)
  .handler(({ context }) => Page360Service.listKnownPages(context.projectId));

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Page360Page } from "@/client/features/page-360/Page360Page";

const page360SearchSchema = z.object({
  url: z.string().optional(),
});

export const Route = createFileRoute("/_project/p/$projectId/page-360")({
  validateSearch: (search) => page360SearchSchema.parse(search),
  component: Page360Route,
});

function Page360Route() {
  const { projectId } = Route.useParams();
  return <Page360Page projectId={projectId} />;
}

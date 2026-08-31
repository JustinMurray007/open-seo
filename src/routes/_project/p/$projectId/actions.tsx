import { createFileRoute } from "@tanstack/react-router";
import { ActionCenterPage } from "@/client/features/action-center/ActionCenterPage";

export const Route = createFileRoute("/_project/p/$projectId/actions")({
  component: ProjectActionCenterRoute,
});

function ProjectActionCenterRoute() {
  const { projectId } = Route.useParams();
  return <ActionCenterPage projectId={projectId} />;
}

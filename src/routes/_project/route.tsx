import * as React from "react";
import { Outlet, createFileRoute, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { resetOrganizationScopedQueries } from "@/client/lib/organization-scoped-queries";

export const Route = createFileRoute("/_project")({
  component: ProjectRouteLayout,
});

/**
 * Discards the previous client's business-module data when the project
 * changes.
 *
 * The switcher does this itself once it has moved the session. This covers
 * every other way a project changes — a link from the projects list, a pasted
 * URL, the back button — where the switcher never runs.
 */
function useClearCacheOnProjectChange() {
  const { projectId } = useParams({ strict: false });
  const queryClient = useQueryClient();
  const previous = React.useRef(projectId);

  React.useEffect(() => {
    if (!projectId || previous.current === projectId) return;
    previous.current = projectId;
    void resetOrganizationScopedQueries(queryClient);
  }, [projectId, queryClient]);
}

function ProjectRouteLayout() {
  useClearCacheOnProjectChange();
  return <Outlet />;
}

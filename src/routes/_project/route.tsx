import * as React from "react";
import { Outlet, createFileRoute, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_project")({
  component: ProjectRouteLayout,
});

/**
 * Drops cached answers when the project changes.
 *
 * Each project owns its own organization, and the business-module queries key
 * on the module alone — correct while an organization could never change
 * mid-session, wrong once switching project switches organization. Without
 * this, React Query serves the previous client's products, integrations and
 * module settings under the new client's name.
 *
 * The switcher clears the cache itself after it has moved the session. This
 * covers every other way a project changes — a link from the projects list, a
 * pasted URL, the back button — where nothing else would.
 */
function useClearCacheOnProjectChange() {
  const { projectId } = useParams({ strict: false });
  const queryClient = useQueryClient();
  const previous = React.useRef(projectId);

  React.useEffect(() => {
    if (!projectId || previous.current === projectId) return;
    previous.current = projectId;
    queryClient.clear();
  }, [projectId, queryClient]);
}

function ProjectRouteLayout() {
  useClearCacheOnProjectChange();
  return <Outlet />;
}

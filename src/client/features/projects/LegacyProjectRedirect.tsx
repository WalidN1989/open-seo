import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { getProjects } from "@/serverFunctions/projects";
import {
  getTabProjectId,
  isProjectAtAddress,
  projectAddress,
} from "@/client/lib/active-project";
import { projectScopedPath } from "@/shared/project-navigation";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

/** Old bookmarks select only a project from the signed-in member's own list. */
export function LegacyProjectRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: 0,
  });
  useEffect(() => {
    if (!projects.data) return;
    const tabProject = getTabProjectId();
    const target =
      projects.data.find((p) => isProjectAtAddress(p, tabProject)) ??
      projects.data.find((p) => p.isActive) ??
      projects.data[0];
    if (!target) {
      void navigate({ to: "/projects", replace: true });
      return;
    }
    void navigate({
      href:
        projectScopedPath(projectAddress(target), location.pathname) +
        location.searchStr +
        (location.hash ? `#${location.hash}` : ""),
      replace: true,
    });
  }, [
    projects.data,
    location.pathname,
    location.searchStr,
    location.hash,
    navigate,
  ]);
  return (
    <div className="grid h-full place-items-center p-6" role="status">
      {projects.isError
        ? getStandardErrorMessage(
            projects.error,
            "Could not open this workspace.",
          )
        : "Opening workspace…"}
    </div>
  );
}

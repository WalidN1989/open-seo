import { useQuery } from "@tanstack/react-query";
import { getProjects } from "@/serverFunctions/projects";
import type { ProjectMarket } from "./types";
import { isProjectAtAddress } from "@/client/lib/active-project";

/** The project's default market, or undefined until the projects query resolves. */
export function useProjectMarket(projectId: string): ProjectMarket | undefined {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });

  // The address is a slug now and was an id before; both still resolve, so
  // both are recognised — matching the id alone returned undefined for every
  // project and let keyword research fall back to the default market silently.
  return projectsQuery.data?.find((project) =>
    isProjectAtAddress(project, projectId),
  );
}

import { useQuery } from "@tanstack/react-query";
import { getWorkspaceAccess } from "@/serverFunctions/team";

/**
 * Whether the person signed in is a client of this workspace rather than
 * agency staff, which decides how much of the app they are shown.
 *
 * Answered once per workspace and kept: it only changes when someone's
 * membership does, and the project switcher resets everything keyed on "team".
 */
export function useWorkspaceAccess() {
  return useQuery({
    queryKey: ["team", "workspace-access"],
    queryFn: () => getWorkspaceAccess(),
    staleTime: 10 * 60 * 1000,
  });
}

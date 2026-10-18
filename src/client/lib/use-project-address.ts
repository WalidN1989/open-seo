import { createContext, useContext } from "react";
import { useParams } from "@tanstack/react-router";

export const ProjectNavigationContext = createContext<string | null>(null);

export function useProjectAddress(): string {
  const { projectId } = useParams({ strict: false });
  const fallback = useContext(ProjectNavigationContext);
  return projectId ?? fallback ?? "";
}

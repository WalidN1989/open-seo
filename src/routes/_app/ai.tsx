import { createFileRoute } from "@tanstack/react-router";
import { LegacyProjectRedirect } from "@/client/features/projects/LegacyProjectRedirect";
export const Route = createFileRoute("/_app/ai")({
  component: LegacyProjectRedirect,
});

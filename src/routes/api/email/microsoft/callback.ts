import { createFileRoute } from "@tanstack/react-router";
import { handleMicrosoftEmailCallback } from "@/server/features/email/services/MicrosoftEmailService";

export const Route = createFileRoute("/api/email/microsoft/callback")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) =>
        handleMicrosoftEmailCallback(request),
    },
  },
});

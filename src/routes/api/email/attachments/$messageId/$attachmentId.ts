import { createFileRoute } from "@tanstack/react-router";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import { openMicrosoftAttachment } from "@/server/features/email/services/MicrosoftAttachmentService";
import { PROJECT_SCOPE_HEADER } from "@/shared/project-navigation";

const viewable = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
]);

export const Route = createFileRoute(
  "/api/email/attachments/$messageId/$attachmentId",
)({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        let context;
        try {
          const headers = new Headers(request.headers);
          const projectId = new URL(request.url).searchParams.get("projectId");
          if (projectId !== null) headers.set(PROJECT_SCOPE_HEADER, projectId);
          context = await resolveUserContextFromHeaders(headers);
        } catch {
          return new Response("Sign in to view this attachment.", {
            status: 401,
          });
        }
        try {
          const { response, file } = await openMicrosoftAttachment(
            context.organizationId,
            context.userId,
            params.messageId,
            params.attachmentId,
          );
          const contentType = file.contentType || "application/octet-stream";
          const disposition = viewable.has(contentType.toLowerCase())
            ? "inline"
            : "attachment";
          const safeName = file.name.replace(/[\r\n"\\]/g, "_");
          return new Response(response.body, {
            status: 200,
            headers: {
              "content-type": contentType,
              "content-disposition": `${disposition}; filename="${safeName}"`,
              "cache-control": "private, no-store",
              "x-content-type-options": "nosniff",
              "x-robots-tag": "noindex",
            },
          });
        } catch {
          return new Response("This attachment is unavailable.", {
            status: 404,
          });
        }
      },
    },
  },
});

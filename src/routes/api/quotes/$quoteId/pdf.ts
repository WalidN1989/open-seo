import { createFileRoute } from "@tanstack/react-router";
import { QuoteEmailService } from "@/server/features/quotes/services/QuoteEmailService";
import { verifyQuoteToken } from "@/server/features/quotes/quoteLink";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";

/**
 * The quote PDF, opened from the email link or the Download button. The
 * signed token is the credential and must name this quote; `download=1`
 * saves the file instead of showing it.
 */
export const Route = createFileRoute("/api/quotes/$quoteId/pdf")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("t") ?? "";
        const claims = token
          ? await verifyQuoteToken(
              token,
              await getRequiredEnvValue("BETTER_AUTH_SECRET"),
              Date.now(),
            )
          : null;
        if (!claims || claims.quoteId !== params.quoteId) {
          return new Response("This link has expired or is not valid.", {
            status: 404,
          });
        }
        const pdf = await QuoteEmailService.pdfFor(
          claims.organizationId,
          claims.quoteId,
        );
        const disposition =
          url.searchParams.get("download") === "1" ? "attachment" : "inline";
        // A fresh ArrayBuffer: Response wants a buffer, not a view over one.
        const body = new Uint8Array(pdf.bytes).buffer;
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `${disposition}; filename="${pdf.filename}"`,
            "cache-control": "private, no-store",
            "x-robots-tag": "noindex",
          },
        });
      },
    },
  },
});

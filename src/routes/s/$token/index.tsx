import { createFileRoute } from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportRepository } from "@/server/features/research-reports/repositories/ReportRepository";
import {
  sharesEnabled,
  SHARE_TOKEN_PATTERN,
} from "@/server/features/research-reports/shareAccess";
import { REPORT_IFRAME_SANDBOX, textResponse } from "@/shared/report-sandbox";
import { sharePath } from "@/shared/report-share";

export async function handleSharePage(token: string): Promise<Response> {
  if (!(await sharesEnabled()) || !SHARE_TOKEN_PATTERN.test(token))
    return textResponse("This report isn't shared.", 404);
  const report = await ReportRepository.getSharedReportByToken(token);
  if (!report || report.archived)
    return textResponse("This report isn't shared.", 404);
  const html = renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex,nofollow" />
        <title>{`${report.title} · Digital Urgency`}</title>
        <style>{`html,body{height:100%;margin:0;font:14px system-ui;background:#fafafa;color:#171717}body{display:flex;flex-direction:column}header{padding:12px 20px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;gap:16px}h1{font-size:16px;margin:0}iframe{flex:1;width:100%;border:0;min-height:0}`}</style>
      </head>
      <body>
        <header>
          <h1>{report.title}</h1>
          <span>Digital Urgency · Research report</span>
        </header>
        <iframe
          title={report.title}
          src={`${sharePath(token)}/raw`}
          sandbox={REPORT_IFRAME_SANDBOX}
          referrerPolicy="no-referrer"
        />
      </body>
    </html>,
  );
  return new Response(`<!doctype html>${html}`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export const Route = createFileRoute("/s/$token/")({
  server: { handlers: { GET: ({ params }) => handleSharePage(params.token) } },
});

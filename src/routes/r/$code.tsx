import { createFileRoute } from "@tanstack/react-router";
import { SharedReportPage } from "@/client/features/public-reports/SharedReportPage";

/** The short form of a report link: ten characters, looked up server-side. */
export const Route = createFileRoute<"/r/$code">("/r/$code")({
  component: ShortLinkPage,
});

function ShortLinkPage() {
  const { code } = Route.useParams();
  return <SharedReportPage code={code} />;
}

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SharedReportPage } from "@/client/features/public-reports/SharedReportPage";

/** The long form of a report link: the signed token rides in the query. */
export const Route = createFileRoute<"/reports/$reportId">(
  "/reports/$reportId",
)({
  validateSearch: z.object({ t: z.string().optional() }),
  component: LongLinkPage,
});

function LongLinkPage() {
  const { t } = Route.useSearch();
  return <SharedReportPage token={t} />;
}

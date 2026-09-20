import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ExternalLink, Tag } from "lucide-react";
import { listSiteServicePages } from "@/serverFunctions/optimizations";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

/**
 * The service pages the site already has.
 *
 * These are the pages a business most wants found, so they are read before
 * anything new is written: an article that repeats a service page competes
 * with it instead of helping it.
 */

function price(service: {
  priceFrom: number | null;
  priceType: string | null;
  currency: string;
}) {
  if (!service.priceFrom) return "—";
  return `${service.currency} ${service.priceFrom.toLocaleString()}${
    service.priceType === "monthly" ? "/mo" : ""
  }`;
}

export function SiteServices({ projectId }: { projectId: string }) {
  const services = useQuery({
    queryKey: ["optimizations", "site-services", projectId],
    queryFn: () => listSiteServicePages({ data: { projectId } }),
    staleTime: 5 * 60_000,
  });

  if (services.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  if (services.isError) {
    return (
      <div className="alert alert-error">
        {getStandardErrorMessage(services.error)}
      </div>
    );
  }
  if (!services.data?.connected) {
    return (
      <p className="rounded-xl border border-dashed border-base-300 p-8 text-center text-sm text-base-content/60">
        No website is connected for this project yet, so there is nothing to
        read. Connect it under Integrations → Lovable site.
      </p>
    );
  }

  const rows = services.data.services;
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-base-300 p-8 text-center text-sm text-base-content/60">
        No service pages were found on this site.
      </p>
    );
  }

  const updated = rows[0]?.updatedAt?.slice(0, 10) ?? null;

  return (
    <div className="space-y-3">
      <p className="text-sm text-base-content/60">
        {rows.length} service page{rows.length === 1 ? "" : "s"} live on the
        site. These rank for the searches that earn money, so improving one
        usually beats writing an article beside it.
        {updated ? ` The site's service data last changed on ${updated}.` : ""}
      </p>
      <div className="overflow-x-auto rounded-xl border border-base-300">
        <table className="table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Price from</th>
              <th>Written for</th>
              <th>Updated</th>
              <th className="text-right">Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((service) => (
              <tr key={service.slug}>
                <td className="max-w-md">
                  <span className="block truncate font-medium">
                    {service.title}
                  </span>
                  <span className="block truncate text-xs text-base-content/50">
                    {service.path}
                    {service.category ? (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <Tag className="size-3" /> {service.category}
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="whitespace-nowrap text-sm text-base-content/70">
                  {price(service)}
                </td>
                <td className="max-w-xs truncate text-sm text-base-content/60">
                  {service.primaryKeyword ?? "—"}
                </td>
                <td className="whitespace-nowrap text-sm text-base-content/70">
                  <span className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-base-content/40" />
                    {service.updatedAt?.slice(0, 10) ?? "—"}
                  </span>
                </td>
                <td className="text-right">
                  <a
                    href={service.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-ghost btn-xs gap-1"
                  >
                    View <ExternalLink className="size-3" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

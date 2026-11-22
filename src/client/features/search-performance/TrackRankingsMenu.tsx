import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LineChart } from "lucide-react";
import { toast } from "sonner";
import { getRankTrackingConfigs } from "@/serverFunctions/rank-tracking";
import {
  addSearchPerformanceTracking,
  estimateSearchPerformanceTracking,
} from "@/serverFunctions/searchPerformanceTracking";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { TableBulkActionButton } from "@/client/components/table/TableBulkActionBar";
import { MAX_TRACKED_KEYWORD_LENGTH } from "@/shared/rank-tracking";

export function TrackRankingsMenu({
  projectId,
  queries,
  onAdded,
}: {
  projectId: string;
  queries: string[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [configId, setConfigId] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const client = useQueryClient();
  const keywords = [
    ...new Set(
      queries.filter((query) => query.length <= MAX_TRACKED_KEYWORD_LENGTH),
    ),
  ];
  const configs = useQuery({
    queryKey: ["rankTrackingConfigs", projectId],
    queryFn: () => getRankTrackingConfigs({ data: { projectId } }),
    enabled: open,
  });
  const selectedId = configId || configs.data?.[0]?.id || "";
  const estimate = useQuery({
    queryKey: ["gscTrackingEstimate", projectId, selectedId, keywords],
    queryFn: () =>
      estimateSearchPerformanceTracking({
        data: { projectId, configId: selectedId, keywords },
      }),
    enabled: open && !!selectedId && keywords.length > 0,
  });
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  const add = useMutation({
    mutationFn: () =>
      addSearchPerformanceTracking({
        data: {
          projectId,
          configId: selectedId,
          keywords,
          maxEstimatedScheduledCheckCredits:
            estimate.data?.scheduledEstimate?.costCredits,
        },
      }),
    onSuccess: (result) => {
      if (!mounted.current) return;
      for (const key of [
        "rankTrackingResults",
        "rankTrackingCostEstimate",
        "rankTrackingConfigSummaries",
      ])
        void client.invalidateQueries({ queryKey: [key, projectId] });
      toast.success(`Added ${result.added} keywords. No check was started.`);
      setOpen(false);
      onAdded();
    },
    onError: (error) => {
      if (!mounted.current) return;
      toast.error(
        getStandardErrorMessage(error, "Could not add queries to the tracker"),
      );
    },
  });
  return (
    <>
      <TableBulkActionButton
        icon={<LineChart className="size-3.5" />}
        onClick={() => {
          setConfigId("");
          setOpen(true);
        }}
      >
        Track rankings
      </TableBulkActionButton>
      {open ? (
        <dialog
          ref={dialog}
          className="modal"
          onCancel={(event) => {
            if (add.isPending) event.preventDefault();
            else setOpen(false);
          }}
          aria-labelledby="gsc-tracking-title"
        >
          <div className="modal-box">
            <h2 id="gsc-tracking-title" className="text-lg font-semibold">
              Add queries to a rank tracker
            </h2>
            <p className="my-3 text-sm">
              Add {keywords.length} selected queries. This saves keywords
              without running a check or buying keyword metrics. Existing
              tracker schedules stay unchanged.
            </p>
            {queries.length !== keywords.length ? (
              <p className="text-sm text-warning">
                Queries longer than {MAX_TRACKED_KEYWORD_LENGTH} characters are
                skipped.
              </p>
            ) : null}
            {configs.isPending ? (
              <p>Loading trackers…</p>
            ) : configs.isError ? (
              <p role="alert">{getStandardErrorMessage(configs.error)}</p>
            ) : !configs.data?.length ? (
              <p>Set up a rank tracker in Rank Tracking first.</p>
            ) : (
              <label className="block text-sm">
                Rank tracker
                <select
                  className="select select-bordered mt-1 w-full"
                  value={selectedId}
                  onChange={(event) => setConfigId(event.target.value)}
                  disabled={add.isPending}
                >
                  {configs.data.map((config) => (
                    <option value={config.id} key={config.id}>
                      {config.domain} ·{" "}
                      {config.locationName ?? config.locationCode} ·{" "}
                      {config.languageCode}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {estimate.isError ? (
              <p className="mt-3 text-error" role="alert">
                {getStandardErrorMessage(estimate.error)}
              </p>
            ) : estimate.data ? (
              <p className="mt-3 text-sm">
                {estimate.data.scheduledEstimate
                  ? `The saved schedule may use up to a nominal ${estimate.data.scheduledEstimate.costCredits} credits per scheduled check (${estimate.data.scheduledEstimate.monthlyCostCredits} credits/month) after adding these queries. Live fallback may cost extra. Add only if you approve this recurring estimate.`
                  : "This tracker has no recurring schedule. Run checks separately when ready."}
              </p>
            ) : null}
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setOpen(false)}
                disabled={add.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  !estimate.isSuccess ||
                  estimate.isFetching ||
                  !keywords.length ||
                  add.isPending
                }
                onClick={() => add.mutate()}
              >
                {add.isPending ? "Adding…" : "Approve and add queries"}
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}

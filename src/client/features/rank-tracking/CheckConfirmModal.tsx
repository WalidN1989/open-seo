import { Loader2, Zap } from "lucide-react";
import { Modal } from "@/client/components/Modal";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import { estimateRankCheckCredits, devicesCount } from "@/shared/rank-tracking";

export function CheckConfirmModal({
  keywords,
  devices,
  serpDepth,
  isPending,
  onRunNow,
  onCancel,
}: {
  keywords: readonly string[];
  devices: RankTrackingConfig["devices"];
  serpDepth: number;
  isPending: boolean;
  onRunNow: (maxCostCredits: number) => void;
  onCancel: () => void;
}) {
  const { costUsd, costCredits } = estimateRankCheckCredits(
    keywords,
    devices,
    serpDepth,
    "live",
  );
  const keywordCount = keywords.length;
  const dc = devicesCount(devices);
  const totalChecks = keywordCount * dc;

  return (
    <Modal
      maxWidth="max-w-md"
      onClose={onCancel}
      labelledBy="rank-check-confirm-title"
    >
      <div>
        <h3 id="rank-check-confirm-title" className="text-lg font-semibold">
          Check {keywordCount} keyword
          {keywordCount !== 1 ? "s" : ""}
        </h3>
        <p className="text-sm text-base-content/60 mt-1">
          {keywordCount} keywords &times; {dc} device
          {dc !== 1 ? "s" : ""} = {totalChecks} SERP checks
        </p>
      </div>

      <button
        className="flex w-full items-center gap-4 rounded-xl border-2 border-base-300 p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
        onClick={() => onRunNow(costCredits)}
        disabled={isPending}
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Zap className="size-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-medium">Run Now</p>
          <p className="text-xs text-base-content/60">
            Google link resolution can take several minutes.
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono font-semibold">~${costUsd.toFixed(2)}</p>
          {isPending && <Loader2 className="size-3 animate-spin ml-auto" />}
        </div>
      </button>

      <button className="btn btn-ghost btn-sm self-center" onClick={onCancel}>
        Cancel
      </button>
    </Modal>
  );
}

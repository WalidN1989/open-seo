import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCommerceBranches } from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export function useBranchSelection() {
  const [selected, setSelected] = useState("");
  const query = useQuery({
    queryKey: ["commerce", "branches"],
    queryFn: () => listCommerceBranches(),
  });
  const branches = query.data ?? [];
  const branchId =
    branches.find((b) => b.id === selected)?.id ??
    (branches.length === 1 ? branches[0]?.id : undefined);
  return { query, branches, branchId, setSelected };
}

export function BranchPicker({
  selection,
  locked = false,
}: {
  selection: ReturnType<typeof useBranchSelection>;
  locked?: boolean;
}) {
  if (selection.query.isError)
    return (
      <p className="text-error">
        {getStandardErrorMessage(selection.query.error)}
      </p>
    );
  return (
    <label className="flex items-center gap-3 text-sm">
      Branch
      <select
        aria-label="Branch"
        className="select select-bordered min-w-56"
        value={selection.branchId ?? ""}
        disabled={
          selection.query.isLoading || selection.branches.length === 0 || locked
        }
        onChange={(event) => selection.setSelected(event.target.value)}
      >
        {!selection.branchId ? (
          <option value="">
            {selection.query.isLoading
              ? "Loading locations…"
              : "Choose location"}
          </option>
        ) : null}
        {selection.branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
            {branch.city ? ` — ${branch.city}` : ""}
          </option>
        ))}
      </select>
      {locked ? (
        <span className="text-xs text-base-content/60">
          Finish this stock take to change location.
        </span>
      ) : null}
    </label>
  );
}

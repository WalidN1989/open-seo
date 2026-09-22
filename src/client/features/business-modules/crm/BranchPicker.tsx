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
    branches.find((b) => b.id.startsWith("default:"))?.id ??
    branches[0]?.id;
  return { query, branches, branchId, setSelected };
}

export function BranchPicker({
  selection,
}: {
  selection: ReturnType<typeof useBranchSelection>;
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
        disabled={!selection.branchId}
        onChange={(event) => selection.setSelected(event.target.value)}
      >
        {!selection.branchId ? (
          <option value="">Loading branches…</option>
        ) : null}
        {selection.branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
            {branch.city ? ` — ${branch.city}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

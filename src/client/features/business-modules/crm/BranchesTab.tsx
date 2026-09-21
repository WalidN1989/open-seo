import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { saveCommerceBranch } from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { BranchInput } from "@/types/schemas/commerce";
import { useBranchSelection } from "./BranchPicker";

const fields = [
  { key: "address", label: "Street address" },
  { key: "city", label: "City / suburb" },
  { key: "state", label: "State / province" },
  { key: "postcode", label: "Postcode" },
  { key: "country", label: "Country" },
  { key: "phone", label: "Phone" },
  { key: "openingHours", label: "Opening hours" },
] satisfies { key: keyof BranchInput; label: string }[];

export function BranchesTab() {
  const { branches, query } = useBranchSelection();
  const [editing, setEditing] = useState<BranchInput | null>(null);
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (input: BranchInput) => saveCommerceBranch({ data: input }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["commerce"] });
      setEditing(null);
      toast.success("Branch saved");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Branches</h2>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setEditing({ name: "" })}
        >
          Add branch
        </button>
      </div>
      <p className="text-sm text-base-content/60">
        Each branch has its own stock. Existing stock starts in the default
        branch. Connected stores update the business total through that branch,
        keeping allocations elsewhere intact. Rename it to match your warehouse
        or main shop.
      </p>
      {query.isError ? (
        <p className="text-error">{getStandardErrorMessage(query.error)}</p>
      ) : null}
      {editing ? (
        <form
          className="grid gap-3 rounded-xl border border-base-300 p-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(editing);
          }}
        >
          <label className="form-control">
            Branch name
            <input
              required
              maxLength={120}
              className="input input-bordered w-full"
              value={editing.name}
              onChange={(event) =>
                setEditing({ ...editing, name: event.target.value })
              }
            />
          </label>
          {fields.map(({ key, label }) => (
            <label key={key} className="form-control">
              {label}
              <input
                className="input input-bordered w-full"
                value={editing[key] ?? ""}
                onChange={(event) =>
                  setEditing({ ...editing, [key]: event.target.value })
                }
              />
            </label>
          ))}
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={save.isPending}>
              Save branch
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {branches.map((branch) => (
          <article
            key={branch.id}
            className="rounded-xl border border-base-300 p-4"
          >
            <h3 className="font-semibold">{branch.name}</h3>
            <p className="text-sm text-base-content/70">
              {[
                branch.address,
                branch.city,
                branch.state,
                branch.postcode,
                branch.country,
              ]
                .filter(Boolean)
                .join(", ") || "Address not set"}
            </p>
            <p className="text-sm">{branch.phone}</p>
            <p className="text-sm">{branch.openingHours}</p>
            <button
              className="btn btn-ghost btn-sm mt-2"
              onClick={() => setEditing(branch)}
            >
              Edit branch
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

import { getStandardErrorMessage } from "@/client/lib/error-messages";

export function Loading() {
  return (
    <div className="flex justify-center py-16">
      <span className="loading loading-spinner" />
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div className="alert alert-error">{getStandardErrorMessage(error)}</div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "published") {
    return <span className="badge badge-success badge-sm">Published</span>;
  }
  if (status === "reverted") {
    return <span className="badge badge-ghost badge-sm">Reverted</span>;
  }
  return <span className="badge badge-outline badge-sm">Draft</span>;
}

export const INVENTORY_OVERVIEW_KEY = ["commerce", "inventory", "overview"];
export const INVENTORY_AUDITS_KEY = ["commerce", "inventory", "audits"];

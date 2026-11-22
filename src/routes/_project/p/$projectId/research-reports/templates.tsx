import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/client/components/Modal";
import { toast } from "sonner";
import { z } from "zod";
import {
  listReportTemplates,
  saveReportTemplate,
  deleteReportTemplate,
} from "@/serverFunctions/reportTemplates";
import type { ReportTemplate } from "@/types/schemas/report-templates";
const templateFieldsSchema = z.object({
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
});
export const Route = createFileRoute(
  "/_project/p/$projectId/research-reports/templates",
)({ component: Templates });
function Templates() {
  const { projectId } = Route.useParams();
  return <TemplatesWorkspace key={projectId} projectId={projectId} />;
}
function TemplatesWorkspace({ projectId }: { projectId: string }) {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const client = useQueryClient();
  const [editing, setEditing] = useState<ReportTemplate | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<ReportTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["reportTemplates", projectId],
    queryFn: () => listReportTemplates({ data: { projectId } }),
    staleTime: 0,
  });
  const invalidate = () =>
    void client.invalidateQueries({ queryKey: ["reportTemplates", projectId] });
  const save = useMutation({
    mutationFn: (fields: {
      name: string;
      description: string;
      instructions: string;
    }) =>
      saveReportTemplate({
        data: { projectId, templateId: editing?.id, ...fields },
      }),
    onSuccess: (r) => {
      if (!mounted.current) return;
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setOpen(false);
      setEditing(null);
      invalidate();
      toast.success("Template saved");
    },
    onError: () => {
      if (mounted.current)
        setError("Could not save template. Please try again.");
    },
  });
  const remove = useMutation({
    mutationFn: (templateId: string) =>
      deleteReportTemplate({ data: { projectId, templateId } }),
    onSuccess: () => {
      if (!mounted.current) return;
      setDeleting(null);
      invalidate();
    },
    onError: () => {
      if (mounted.current) toast.error("Could not delete template");
    },
  });
  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <Link
          className="link text-sm"
          to="/p/$projectId/research-reports"
          params={{ projectId }}
        >
          ← Research reports
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Report templates</h1>
          <button
            className="btn btn-primary btn-sm"
            disabled={(query.data?.templates.length ?? 0) >= 10}
            onClick={() => {
              setEditing(null);
              setError(null);
              setOpen(true);
            }}
          >
            New template
          </button>
        </div>
        <p className="text-sm text-base-content/60">
          Give your agent a reusable brief: audience, sections, evidence and
          tone. Up to ten templates per project.
        </p>
        {query.isPending ? <p role="status">Loading templates…</p> : null}
        {query.isError ? (
          <div role="alert" className="alert alert-error">
            Could not load templates.{" "}
            <button className="btn btn-sm" onClick={() => void query.refetch()}>
              Retry
            </button>
          </div>
        ) : null}
        {query.data?.templates.length === 0 ? (
          <p className="rounded border border-base-300 p-6">
            No templates yet. Create a brief or ask your agent to save one.
          </p>
        ) : null}
        {query.data?.templates.map((t) => (
          <section className="rounded-lg border border-base-300 p-4" key={t.id}>
            <div className="flex justify-between gap-4">
              <div>
                <h2 className="font-semibold">{t.name}</h2>
                <p className="text-sm text-base-content/60">{t.description}</p>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    setEditing(t);
                    setError(null);
                    setOpen(true);
                  }}
                >
                  Edit
                </button>
                <button
                  className="btn btn-sm btn-outline btn-error"
                  onClick={() => setDeleting(t)}
                >
                  Delete
                </button>
              </div>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm">Instructions</summary>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {t.instructions}
              </p>
            </details>
          </section>
        ))}
        {open ? (
          <Modal
            maxWidth="max-w-lg"
            labelledBy="research-template-title"
            onClose={() => {
              if (!save.isPending) setOpen(false);
            }}
          >
            <form
              key={editing?.id ?? "new"}
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                const fields = templateFieldsSchema.safeParse(
                  Object.fromEntries(data),
                );
                if (!fields.success) {
                  setError(
                    "Enter the template name, description and instructions.",
                  );
                  return;
                }
                save.mutate(fields.data);
              }}
            >
              <h2
                id="research-template-title"
                className="text-lg font-semibold"
              >
                {editing ? "Edit template" : "New template"}
              </h2>
              <label className="block space-y-1">
                <span>Name</span>
                <input
                  name="name"
                  className="input input-bordered w-full"
                  maxLength={80}
                  required
                  defaultValue={editing?.name}
                />
              </label>
              <label className="block space-y-1">
                <span>Description</span>
                <input
                  name="description"
                  className="input input-bordered w-full"
                  maxLength={200}
                  required
                  defaultValue={editing?.description}
                />
              </label>
              <label className="block space-y-1">
                <span>Instructions</span>
                <textarea
                  name="instructions"
                  className="textarea textarea-bordered h-48 w-full"
                  maxLength={3000}
                  required
                  defaultValue={editing?.instructions}
                />
              </label>
              {error ? (
                <p role="alert" className="text-error">
                  {error}
                </p>
              ) : null}
              <div className="modal-action">
                <button
                  type="button"
                  className="btn"
                  disabled={save.isPending}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={save.isPending}
                >
                  Save template
                </button>
              </div>
            </form>
          </Modal>
        ) : null}
        {deleting ? (
          <Modal
            maxWidth="max-w-lg"
            labelledBy="research-template-delete-title"
            onClose={() => {
              if (!remove.isPending) setDeleting(null);
            }}
          >
            <div>
              <h2 id="research-template-delete-title" className="font-semibold">
                Delete {deleting.name}?
              </h2>
              <p>Existing reports will be kept.</p>
              <div className="modal-action">
                <button
                  className="btn"
                  disabled={remove.isPending}
                  onClick={() => setDeleting(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-error"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(deleting.id)}
                >
                  Delete template
                </button>
              </div>
            </div>
          </Modal>
        ) : null}
      </div>
    </div>
  );
}

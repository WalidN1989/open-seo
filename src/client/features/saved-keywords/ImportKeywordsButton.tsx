import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/client/components/Modal";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  refreshSavedKeywordMetrics,
  saveKeywords,
} from "@/serverFunctions/keywords";
import { parseKeywordImport } from "./importKeywords";

export function ImportKeywordsButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [tag, setTag] = useState("");
  const [fetchStats, setFetchStats] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const queryClient = useQueryClient();
  const keywords = parseKeywordImport(text);
  const mutation = useMutation({
    mutationFn: async () => {
      const result = await saveKeywords({
        data: {
          projectId,
          keywords,
          tags: tag.trim() ? [tag.trim()] : undefined,
        },
      });
      if (fetchStats && result.savedKeywordIds.length && active.current) {
        try {
          await refreshSavedKeywordMetrics({
            data: { projectId, savedKeywordIds: result.savedKeywordIds },
          });
        } catch (error) {
          throw new Error(
            `Keywords were saved, but stats could not be fetched. ${getStandardErrorMessage(error)}`,
            { cause: error },
          );
        }
      }
      return result.savedKeywordIds.length;
    },
    onSuccess: (count) => {
      if (!active.current) return;
      setOpen(false);
      setText("");
      setFetchStats(false);
      toast.success(`Imported ${count} keywords`);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["savedKeywords", projectId] }),
  });
  return (
    <>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() => {
          mutation.reset();
          setOpen(true);
        }}
      >
        <Upload className="size-4" />
        Import keywords
      </button>
      {open ? (
        <Modal
          maxWidth="max-w-xl"
          labelledBy="keyword-import-title"
          onClose={mutation.isPending ? undefined : () => setOpen(false)}
        >
          <h2 id="keyword-import-title" className="text-lg font-semibold">
            Import keywords
          </h2>
          <p className="text-sm text-base-content/65">
            Paste one keyword per line or a CSV/TSV with keywords in its first
            column. Saved for this project's country and language. Up to 500
            keywords per import.
          </p>
          <label className="form-control gap-1 text-sm">
            Keywords
            <textarea
              className="textarea textarea-bordered h-48"
              value={text}
              maxLength={250000}
              disabled={mutation.isPending}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <p
            className={`text-xs ${keywords.length > 500 ? "text-error" : "text-base-content/60"}`}
          >
            {keywords.length} unique keywords
          </p>
          <label className="form-control gap-1 text-sm">
            Tag (optional)
            <input
              className="input input-bordered input-sm"
              value={tag}
              maxLength={64}
              disabled={mutation.isPending}
              onChange={(event) => setTag(event.target.value)}
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={fetchStats}
              disabled={mutation.isPending}
              onChange={(event) => setFetchStats(event.target.checked)}
            />
            <span>
              Fetch search volume, difficulty and CPC after saving. This uses
              provider credits for these imported keywords only.
            </span>
          </label>
          {mutation.isError ? (
            <p role="alert" className="text-sm text-error">
              {getStandardErrorMessage(mutation.error)}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={mutation.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={
                mutation.isPending || !keywords.length || keywords.length > 500
              }
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending
                ? "Importing…"
                : fetchStats
                  ? "Import and fetch stats (uses credits)"
                  : "Import keywords"}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

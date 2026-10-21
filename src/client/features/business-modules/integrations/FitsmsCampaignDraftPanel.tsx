import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createSmsCampaignDraft,
  listSmsCampaignDrafts,
} from "@/serverFunctions/sms-campaigns";
import { createSmsCampaignDraftSchema } from "@/types/schemas/sms-campaigns";
import type { z } from "zod";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getFieldError } from "@/client/lib/forms";

const fields = [
  { name: "name", label: "Campaign name", type: "text", max: 120 },
  { name: "senderId", label: "Approved sender ID", type: "text", max: 11 },
  {
    name: "audienceDescription",
    label: "Audience plan",
    type: "textarea",
    max: 500,
  },
  { name: "message", label: "Message draft", type: "textarea", max: 1000 },
  {
    name: "firstSendDate",
    label: "Proposed first send date",
    type: "date",
    max: undefined,
  },
  {
    name: "sendTime",
    label: "Proposed time (Sri Lanka)",
    type: "time",
    max: undefined,
  },
] as const;

export function FitsmsCampaignDraftPanel({
  connectionId,
}: {
  connectionId: string;
}) {
  const client = useQueryClient();
  const queryKey = ["fitsms", connectionId, "campaign-drafts"];
  const drafts = useQuery({
    queryKey,
    queryFn: () => listSmsCampaignDrafts({ data: { connectionId } }),
  });
  const save = useMutation({
    mutationFn: (data: z.infer<typeof createSmsCampaignDraftSchema>) =>
      createSmsCampaignDraft({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey });
      toast.success("Draft saved. No SMS sent or scheduled.");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const form = useForm({
    defaultValues: {
      connectionId,
      name: "",
      senderId: "",
      kind: "weekly",
      message: "",
      audienceDescription: "",
      firstSendDate: "",
      sendTime: "",
      timezone: "Asia/Colombo",
    } as z.infer<typeof createSmsCampaignDraftSchema>,
    validators: { onSubmit: createSmsCampaignDraftSchema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
    },
  });

  return (
    <section className="space-y-4 rounded-xl border border-base-300 p-4">
      <div>
        <h3 className="font-semibold">SMS campaign preparation</h3>
        <p className="mt-1 text-sm text-base-content/70">
          Save a weekly promotion or flash discount for review. Sending and
          schedule activation are disabled.
        </p>
      </div>
      <div className="alert alert-info text-sm">
        Draft only · No contacts are uploaded · No credits are spent
      </div>
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="kind">
          {(field) => (
            <label className="flex flex-col gap-1">
              <span className="text-sm">Campaign type</span>
              <select
                className="select select-bordered w-full"
                value={field.state.value}
                onChange={(event) =>
                  field.handleChange(
                    event.target.value === "weekly" ? "weekly" : "flash",
                  )
                }
                onBlur={field.handleBlur}
              >
                <option value="weekly">Weekly promotion</option>
                <option value="flash">Flash discount / announcement</option>
              </select>
            </label>
          )}
        </form.Field>
        {fields.map((item) => (
          <form.Field key={item.name} name={item.name}>
            {(field) => (
              <label
                className={`flex flex-col gap-1 ${item.type === "textarea" ? "md:col-span-2" : ""}`}
              >
                <span className="text-sm">{item.label}</span>
                {item.type === "textarea" ? (
                  <textarea
                    className="textarea textarea-bordered w-full"
                    required
                    rows={3}
                    maxLength={item.max}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                  />
                ) : (
                  <input
                    className="input input-bordered w-full"
                    required
                    type={item.type}
                    maxLength={item.max}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
                {getFieldError(field.state.meta.errors) ? (
                  <span className="text-xs text-error">
                    {getFieldError(field.state.meta.errors)}
                  </span>
                ) : null}
                {item.name === "audienceDescription" ? (
                  <span className="text-xs text-base-content/60">
                    Describe the intended customer group. This is a planning
                    note; no recipients are selected or synchronized.
                  </span>
                ) : null}
              </label>
            )}
          </form.Field>
        ))}
        <p className="text-xs text-base-content/60 md:col-span-2">
          Weekly drafts propose the same weekday and time each week. All timing
          uses Asia/Colombo. Actual recipients, opt-outs, message segments, cost
          and delivery approval must be reviewed before activation.
        </p>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <button
              type="submit"
              className="btn btn-primary justify-self-start"
              disabled={isSubmitting || save.isPending}
            >
              Save draft for review
            </button>
          )}
        </form.Subscribe>
      </form>
      <div className="space-y-3 border-t border-base-300 pt-4">
        <h4 className="font-medium">Saved drafts</h4>
        {drafts.isPending ? (
          <p className="text-sm">Loading drafts…</p>
        ) : drafts.isError ? (
          <p role="alert" className="text-sm text-error">
            {getStandardErrorMessage(drafts.error)}
          </p>
        ) : drafts.data.length ? (
          drafts.data.map((draft) => (
            <article
              key={draft.id}
              className="space-y-2 rounded-lg bg-base-200 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h5 className="font-medium">{draft.name}</h5>
                <span className="badge badge-outline">
                  Draft · Not scheduled
                </span>
              </div>
              <p className="text-xs text-base-content/70">
                {draft.kind === "weekly"
                  ? "Weekly promotion"
                  : "Flash discount / announcement"}{" "}
                · {draft.senderId} · Proposed {draft.firstSendDate} at{" "}
                {draft.sendTime} ({draft.timezone})
              </p>
              <p className="text-sm">
                Audience plan: {draft.audienceDescription}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">
                {draft.message}
              </p>
            </article>
          ))
        ) : (
          <p className="text-sm text-base-content/60">
            No campaign drafts yet.
          </p>
        )}
      </div>
    </section>
  );
}

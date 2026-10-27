import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createCrmProspect } from "@/serverFunctions/crm";
import { createProspectSchema } from "@/types/schemas/sources";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

const empty = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  website: "",
  profileUrl: "",
  category: "",
  country: "Australia",
  notes: "",
};
type ProspectFormValues = typeof empty;
const fields = [
  ["companyName", "Business name", "text"],
  ["category", "Category", "text"],
  ["contactName", "Contact name (if known)", "text"],
  ["phone", "Business phone", "tel"],
  ["email", "Business email", "email"],
  ["website", "Website URL (if known)", "url"],
  ["profileUrl", "Google Maps or source URL", "url"],
  ["country", "Country", "text"],
  ["notes", "Location, observations and service opportunities", "text"],
] as const;

export function ProspectForm({
  initial,
  onClose,
}: {
  initial?: ProspectFormValues;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof createCrmProspect>[0]["data"]) =>
      createCrmProspect({ data }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["crm", "sources"] });
      toast.success(
        result.inserted ? "Prospect saved" : "This prospect is already saved",
      );
      onClose();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const form = useForm({
    defaultValues: initial ?? empty,
    onSubmit: async ({ value }) => {
      const data = createProspectSchema.safeParse(
        Object.fromEntries(
          Object.entries(value).map(([key, text]) => [
            key,
            text.trim() || undefined,
          ]),
        ),
      );
      if (!data.success) {
        toast.error(
          data.error.issues[0]?.message ?? "Check the prospect details.",
        );
        return;
      }
      await mutation.mutateAsync(data.data).catch(() => {});
    },
  });
  return (
    <form
      className="rounded-xl border border-base-300 bg-base-100 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!mutation.isPending) void form.handleSubmit();
      }}
    >
      <h2 className="mb-4 text-lg font-semibold">New prospect</h2>
      <fieldset
        disabled={mutation.isPending}
        className="grid gap-4 md:grid-cols-2"
      >
        {fields.map(([name, label, type]) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <label className={name === "notes" ? "md:col-span-2" : ""}>
                <span className="mb-1 block text-sm">{label}</span>
                {name === "notes" ? (
                  <textarea
                    className="textarea textarea-bordered w-full"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    maxLength={3000}
                  />
                ) : (
                  <input
                    className="input input-bordered w-full"
                    type={type}
                    required={name === "companyName"}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    maxLength={name === "companyName" ? 200 : 500}
                  />
                )}
              </label>
            )}
          </form.Field>
        ))}
        <div className="flex gap-2 md:col-span-2">
          <button
            className="btn btn-primary btn-sm"
            disabled={mutation.isPending}
          >
            Save prospect
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}

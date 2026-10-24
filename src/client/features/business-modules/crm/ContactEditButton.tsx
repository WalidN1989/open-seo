import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/client/components/Modal";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { type getCrmWorkspace, updateCrmContact } from "@/serverFunctions/crm";
import {
  createContactSchema,
  type UpdateContactInput,
} from "@/types/schemas/crm";

type Contact = Awaited<
  ReturnType<typeof getCrmWorkspace>
>["contacts"][number]["contact"];
const fields = [
  { name: "firstName", label: "First name", type: "text", max: 100 },
  { name: "lastName", label: "Last name", type: "text", max: 100 },
  { name: "email", label: "Email address", type: "email" },
  { name: "phone", label: "Phone", type: "tel", max: 40 },
  { name: "whatsappPhone", label: "WhatsApp phone", type: "tel", max: 40 },
] as const;

export function ContactEditButton({ contact }: { contact: Contact }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label={`Edit ${contact.firstName} ${contact.lastName ?? ""}`.trim()}
        onClick={() => setEditing(true)}
      >
        <Pencil className="size-3.5" /> Edit
      </button>
      {editing ? (
        <ContactEditDialog
          contact={contact}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}

function ContactEditDialog({
  contact,
  onClose,
}: {
  contact: Contact;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: UpdateContactInput) => updateCrmContact({ data }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["crm"] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp"] }),
        queryClient.invalidateQueries({ queryKey: ["voice", "phone-calls"] }),
      ]);
      toast.success("Contact updated");
      onClose();
    },
  });
  const form = useForm({
    defaultValues: {
      firstName: contact.firstName,
      lastName: contact.lastName ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      whatsappPhone: contact.whatsappPhone ?? "",
    },
    validators: {
      onSubmit: createContactSchema.omit({ companyId: true }).required(),
    },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync({ id: contact.id, ...value });
      } catch {
        /* Keep the form open with the server error. */
      }
    },
  });
  return (
    <Modal
      maxWidth="max-w-lg"
      labelledBy="edit-contact-title"
      onClose={mutation.isPending ? undefined : onClose}
    >
      <h2 id="edit-contact-title" className="text-lg font-semibold">
        Edit contact
      </h2>
      <p className="text-sm text-base-content/60">
        Changes apply to the shared contact in CRM, WhatsApp and linked leads.
      </p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!mutation.isPending) void form.handleSubmit();
        }}
      >
        <fieldset disabled={mutation.isPending} className="space-y-3">
          {fields.map(({ name, label, type, ...options }) => (
            <form.Field key={name} name={name}>
              {(field) => (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">
                    {label}
                  </span>
                  <input
                    className="input input-bordered w-full"
                    type={type}
                    required={name === "firstName"}
                    maxLength={"max" in options ? options.max : undefined}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  {field.state.meta.errors.length ? (
                    <span className="mt-1 block text-xs text-error">
                      {field.state.meta.errors
                        .map((error) => error?.message)
                        .join(" ")}
                    </span>
                  ) : null}
                </label>
              )}
            </form.Field>
          ))}
        </fieldset>
        {mutation.isError ? (
          <div role="alert" className="text-sm text-error">
            {getStandardErrorMessage(
              mutation.error,
              "Could not update the contact",
            )}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

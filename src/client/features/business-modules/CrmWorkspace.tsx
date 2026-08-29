import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  createCrmCompany,
  createCrmContact,
  getCrmWorkspace,
} from "@/serverFunctions/crm";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export function CrmWorkspace() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"contact" | "company" | null>(null);
  const query = useQuery({
    queryKey: ["crm", "workspace"],
    queryFn: () => getCrmWorkspace(),
  });
  const contactMutation = useMutation({
    mutationFn: (data: {
      firstName: string;
      lastName?: string;
      email?: string;
      phone?: string;
    }) => createCrmContact({ data }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm", "workspace"] });
      setMode(null);
      toast.success("Contact created");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const companyMutation = useMutation({
    mutationFn: (data: { name: string; website?: string; phone?: string }) =>
      createCrmCompany({ data }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm", "workspace"] });
      setMode(null);
      toast.success("Company created");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  if (query.isLoading)
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  if (query.isError)
    return (
      <div className="alert alert-error">
        {getStandardErrorMessage(query.error)}
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">CRM</h1>
          <p className="text-sm text-base-content/60">
            One organization-wide directory for customers, prospects, and
            companies.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setMode("company")}
          >
            <Building2 className="size-4" /> Company
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setMode("contact")}
          >
            <Plus className="size-4" /> Contact
          </button>
        </div>
      </div>
      {mode === "contact" ? (
        <InlineForm
          fields={["firstName", "lastName", "email", "phone"]}
          pending={contactMutation.isPending}
          onSubmit={(data) =>
            contactMutation.mutate({
              firstName: data.firstName,
              lastName: data.lastName,
              email: data.email,
              phone: data.phone,
            })
          }
        />
      ) : null}
      {mode === "company" ? (
        <InlineForm
          fields={["name", "website", "phone"]}
          pending={companyMutation.isPending}
          onSubmit={(data) =>
            companyMutation.mutate({
              name: data.name,
              website: data.website,
              phone: data.phone,
            })
          }
        />
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-base-300">
          <div className="border-b border-base-300 p-4">
            <h2 className="font-semibold">
              Contacts{" "}
              <span className="badge badge-sm ml-1">
                {query.data!.contacts.length}
              </span>
            </h2>
          </div>
          <div className="divide-y divide-base-300">
            {query.data!.contacts.length ? (
              query.data!.contacts.map(({ contact, company }) => (
                <div key={contact.id} className="flex items-center gap-3 p-4">
                  <span className="rounded-full bg-base-200 p-2">
                    <UserRound className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {contact.firstName} {contact.lastName}
                    </p>
                    <p className="truncate text-xs text-base-content/50">
                      {company?.name ??
                        contact.email ??
                        contact.phone ??
                        "No contact details"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <Empty text="No contacts yet" />
            )}
          </div>
        </section>
        <section className="rounded-xl border border-base-300">
          <div className="border-b border-base-300 p-4">
            <h2 className="font-semibold">
              Companies{" "}
              <span className="badge badge-sm ml-1">
                {query.data!.companies.length}
              </span>
            </h2>
          </div>
          <div className="divide-y divide-base-300">
            {query.data!.companies.length ? (
              query.data!.companies.map((company) => (
                <div key={company.id} className="flex items-center gap-3 p-4">
                  <span className="rounded-lg bg-base-200 p-2">
                    <Building2 className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{company.name}</p>
                    <p className="truncate text-xs text-base-content/50">
                      {company.website ?? company.phone ?? "No company details"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <Empty text="No companies yet" />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function InlineForm({
  fields,
  pending,
  onSubmit,
}: {
  fields: string[];
  pending: boolean;
  onSubmit: (data: Record<string, string>) => void;
}) {
  return (
    <form
      className="flex flex-wrap gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSubmit(
          Object.fromEntries(
            fields.map((field) => [field, fieldValue(form, field)]),
          ),
        );
      }}
    >
      {fields.map((field, index) => (
        <input
          key={field}
          name={field}
          required={index === 0}
          className="input input-bordered input-sm min-w-40 flex-1"
          placeholder={field.replace(/([A-Z])/g, " $1")}
        />
      ))}
      <button className="btn btn-primary btn-sm" disabled={pending}>
        Save
      </button>
    </form>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="p-8 text-center text-sm text-base-content/40">{text}</p>;
}

function fieldValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

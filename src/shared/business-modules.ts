import { z } from "zod";

const businessModuleKeys = [
  "leads",
  "crm",
  "whatsapp",
  "voice",
  "email",
  "integrations",
] as const;

export const businessModuleKeySchema = z.enum(businessModuleKeys);
export type BusinessModuleKey = z.infer<typeof businessModuleKeySchema>;

export const businessModuleCatalog = [
  {
    key: "leads",
    label: "Leads",
    description: "Capture, qualify, assign, and track prospects.",
  },
  {
    key: "crm",
    label: "CRM",
    description: "Manage contacts, companies, pipelines, and activities.",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    description: "Shared inbox, templates, campaigns, and automations.",
  },
  {
    key: "voice",
    label: "Voice Agent",
    description: "Configure voice assistants and review conversations.",
  },
  {
    key: "email",
    label: "Email",
    description: "An agent-run inbox with drafts, replies, and AI assistance.",
  },
  {
    key: "integrations",
    label: "Integrations",
    description: "Connect providers, webhooks, and external applications.",
  },
] as const satisfies ReadonlyArray<{
  key: BusinessModuleKey;
  label: string;
  description: string;
}>;

export const businessModulePermissionSchema = z.enum([
  "view",
  "manage",
  "admin",
]);
export type BusinessModulePermission = z.infer<
  typeof businessModulePermissionSchema
>;

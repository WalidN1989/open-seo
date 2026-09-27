import { z } from "zod";

export const performanceFilterSchema = z.object({
  projectId: z.string().min(1).optional(),
});
export const performanceQuestionSchema = performanceFilterSchema.extend({
  question: z.string().trim().min(1).max(500),
});
export type PerformanceFilter = z.infer<typeof performanceFilterSchema>;
export type PerformanceStatus =
  | "healthy"
  | "attention"
  | "not_configured"
  | "unable_to_check"
  | "stale";
export type PerformanceRecord = {
  id: string;
  title: string;
  detail: string;
  timestamp: string | null;
  projectId: string;
  projectName: string;
  path: string;
  kind: "email" | "whatsapp" | "leads" | "quotes" | "integrations";
};
export type PerformanceConnection = PerformanceRecord & {
  status: string;
  failed: boolean;
};
export type PerformanceMetric = {
  key: string;
  label: string;
  count: number;
  organizations: number;
};
export type PerformanceProject = {
  id: string;
  name: string;
  organizationId: string;
};
export type EngineeringSignal = {
  id: string;
  system: string;
  status: PerformanceStatus;
  evidence: string;
  observedAt: string;
  eventAt: string | null;
  url: string | null;
};
export type PerformanceOverview = {
  observedAt: string;
  projects: PerformanceProject[];
  selectedProjectId: string | null;
  activeProjectCount: number;
  organizationCount: number;
  metrics: PerformanceMetric[];
  attention: PerformanceRecord[];
  activity: PerformanceRecord[];
  connections: PerformanceConnection[];
  unavailable: string[];
  latestEmail: PerformanceRecord | null;
  engineering: EngineeringSignal[] | null;
  jev: { status: "configured" | "not_configured"; detail: string };
};
export const performanceIntents = {
  projects: "Count active projects in the selected scope",
  whatsapp: "List projects with recorded connected WhatsApp accounts",
  latest_email: "Show the most recent received email",
  attention: "Show recorded business items requiring attention",
  engineering: "Show failed checks, deployments or production health",
  unsupported: "Any other question, request to act, or ambiguous question",
};
export type PerformanceAnswer = {
  text: string;
  observedAt: string;
  sources: PerformanceRecord[];
  signals: EngineeringSignal[];
  jevStatus: "healthy" | "unable_to_check" | "uncertain" | "not_configured";
};

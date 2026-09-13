import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { updateCrmLead } from "@/serverFunctions/crm";
import {
  createReminder,
  getLeadDetail,
  logLeadActivity,
} from "@/serverFunctions/crmLeadDetail";

export type LeadDetail = Awaited<ReturnType<typeof getLeadDetail>>;
export type LogActivityInput = Parameters<typeof logLeadActivity>[0]["data"];
type LeadChanges = Omit<Parameters<typeof updateCrmLead>[0]["data"], "id">;

const leadDetailKey = (leadId: string) =>
  ["crm", "lead-detail", leadId] as const;

export function useLeadDetail(leadId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: leadDetailKey(leadId),
    queryFn: () => getLeadDetail({ data: { leadId } }),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: leadDetailKey(leadId) }),
      queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }),
      queryClient.invalidateQueries({ queryKey: ["crm", "reminders"] }),
    ]);
  };

  const update = useMutation({
    mutationFn: (changes: LeadChanges) =>
      updateCrmLead({ data: { id: leadId, ...changes } }),
    onSuccess: refresh,
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not update the lead")),
  });

  const log = useMutation({
    mutationFn: (input: Omit<LogActivityInput, "leadId">) =>
      logLeadActivity({ data: { leadId, ...input } }),
    onSuccess: async (result) => {
      await refresh();
      toast.success(
        result.reminder ? "Activity logged · reminder set" : "Activity logged",
      );
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not log the activity")),
  });

  const remind = useMutation({
    mutationFn: (input: { title: string; remindAt: string; note?: string }) =>
      createReminder({ data: { leadId, ...input } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Reminder set");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not set the reminder")),
  });

  return { query, update, log, remind };
}

/** A calendar date and optional time, as the moment it means locally. */
export function localMoment(date: string, time: string) {
  return new Date(`${date}T${time || "09:00"}`).toISOString();
}

export function isoDate(offsetDays: number) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

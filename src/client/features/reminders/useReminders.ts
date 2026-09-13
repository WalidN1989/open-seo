import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  completeReminder,
  deleteReminder,
  listReminders,
  snoozeReminder,
} from "@/serverFunctions/crmLeadDetail";

export type Reminder = Awaited<ReturnType<typeof listReminders>>[number];

export const REMINDERS_KEY = ["crm", "reminders"] as const;

/**
 * One poll shared by the bell and the popup. Thirty seconds is close enough
 * for a follow-up reminder and cheap enough to leave running on every page.
 */
export function useReminders() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: REMINDERS_KEY,
    queryFn: () => listReminders(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: REMINDERS_KEY }),
      queryClient.invalidateQueries({ queryKey: ["crm", "lead-detail"] }),
    ]);
  const onError = (error: unknown) =>
    toast.error(
      getStandardErrorMessage(error, "Could not update the reminder"),
    );

  const snooze = useMutation({
    mutationFn: (input: { id: string; minutes: number }) =>
      snoozeReminder({ data: input }),
    onSuccess: refresh,
    onError,
  });
  const done = useMutation({
    mutationFn: (id: string) => completeReminder({ data: { id } }),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteReminder({ data: { id } }),
    onSuccess: refresh,
    onError,
  });

  return { reminders: query.data ?? [], snooze, done, remove };
}

/** A clock that ticks every 15 seconds, so "due" changes without a refetch. */
export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function isDue(reminder: Reminder, now: number) {
  return (
    reminder.status === "pending" &&
    new Date(reminder.remindAt).getTime() <= now
  );
}

/** "5m ago", "in 2h", "in 3d". */
export function relative(iso: string, now: number) {
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
  const abs = Math.abs(minutes);
  const text =
    abs < 1
      ? "now"
      : abs < 60
        ? `${abs}m`
        : abs < 60 * 24
          ? `${Math.round(abs / 60)}h`
          : `${Math.round(abs / (60 * 24))}d`;
  if (text === "now") return text;
  return minutes < 0 ? `${text} ago` : `in ${text}`;
}

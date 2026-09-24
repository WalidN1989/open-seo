import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getSmsThread, getSmsWorkspace, sendSms } from "@/serverFunctions/sms";

export function useSmsWorkspace() {
  return useQuery({
    queryKey: ["sms", "workspace"],
    queryFn: () => getSmsWorkspace(),
    // A text lands by webhook; keep the inbox current while it is on screen.
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}

export function useSmsThread(conversationId: string | null) {
  return useQuery({
    queryKey: ["sms", "thread", conversationId],
    queryFn: () =>
      getSmsThread({ data: { conversationId: conversationId ?? "" } }),
    enabled: Boolean(conversationId),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}

export function useSendSms() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      conversationId?: string | null;
      to?: string | null;
      body: string;
    }) => sendSms({ data: input }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["sms"] });
      toast.success("Text sent");
    },
    onError: (error: unknown) => toast.error(getStandardErrorMessage(error)),
  });
}

export function smsTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

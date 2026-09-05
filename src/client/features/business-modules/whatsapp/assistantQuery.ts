import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getWhatsappAssistantConfig } from "@/serverFunctions/whatsappAssistant";

export const ASSISTANT_QUERY_KEY = ["whatsapp", "assistant"] as const;

export function useAssistantConfig() {
  return useQuery({
    queryKey: ASSISTANT_QUERY_KEY,
    queryFn: () => getWhatsappAssistantConfig(),
  });
}

export type AssistantConfig = NonNullable<
  ReturnType<typeof useAssistantConfig>["data"]
>;

/** A mutation that refreshes the assistant config and reports the outcome. */
export function useAssistantMutation<TInput>(
  run: (input: TInput) => Promise<unknown>,
  successMessage: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ASSISTANT_QUERY_KEY });
      toast.success(successMessage);
    },
    onError: (error: unknown) => toast.error(getStandardErrorMessage(error)),
  });
}

export function formatWhen(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

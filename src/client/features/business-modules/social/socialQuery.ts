import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getSocialThread, getSocialWorkspace } from "@/serverFunctions/social";

export function useSocialWorkspace() {
  return useQuery({
    queryKey: ["social", "workspace"],
    queryFn: () => getSocialWorkspace(),
    // A DM lands by webhook; keep the inbox current while it is on screen.
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}

export function useSocialThread(conversationId: string | null) {
  return useQuery({
    queryKey: ["social", "thread", conversationId],
    queryFn: () =>
      getSocialThread({ data: { conversationId: conversationId ?? "" } }),
    enabled: Boolean(conversationId),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}

export type SocialWorkspaceData = NonNullable<
  ReturnType<typeof useSocialWorkspace>["data"]
>;

export function useSocialMutation<TInput>(
  run: (input: TInput) => Promise<unknown>,
  successMessage: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["social"] });
      toast.success(successMessage);
    },
    onError: (error: unknown) => toast.error(getStandardErrorMessage(error)),
  });
}

export function formatSocialTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  messenger: "Messenger",
};

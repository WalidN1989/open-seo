import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getEmailThread, getEmailWorkspace } from "@/serverFunctions/email";

const WORKSPACE_KEY = ["email", "workspace"] as const;

export function useEmailWorkspace() {
  return useQuery({
    queryKey: WORKSPACE_KEY,
    queryFn: () => getEmailWorkspace(),
    // A webhook lands whenever a customer writes; keep the inbox current
    // while it is on screen without anyone pressing refresh.
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}

export function useEmailThread(threadId: string | null) {
  return useQuery({
    queryKey: ["email", "thread", threadId],
    queryFn: () => getEmailThread({ data: { threadId: threadId ?? "" } }),
    enabled: Boolean(threadId),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}

export type EmailWorkspace = NonNullable<
  ReturnType<typeof useEmailWorkspace>["data"]
>;

export function useEmailMutation<TInput>(
  run: (input: TInput) => Promise<unknown>,
  successMessage: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["email"] });
      toast.success(successMessage);
    },
    onError: (error: unknown) => toast.error(getStandardErrorMessage(error)),
  });
}

export function formatEmailTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** "Jane Doe <jane@x.com>" → "Jane Doe"; a bare address stays as is. */
export function displayName(value: string) {
  const match = value.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  return match ? match[1] : value;
}

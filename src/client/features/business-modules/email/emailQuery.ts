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

/**
 * Split a message into what was written now and the quoted history a mail
 * client appends underneath: everything from the first "On … wrote:" line
 * or the first line starting with ">" to the end.
 */
export function splitQuoted(text: string | null | undefined): {
  fresh: string;
  quoted: string | null;
} {
  const body = (text ?? "").replace(/\r\n/g, "\n");
  const lines = body.split("\n");
  const cut = lines.findIndex(
    (line, index) =>
      line.startsWith(">") ||
      (/^On .+wrote:\s*$/.test(line) && index > 0) ||
      /^-{2,}\s*Original Message\s*-{2,}$/i.test(line),
  );
  if (cut <= 0) return { fresh: body.trim(), quoted: null };
  // A "wrote:" header often wraps onto two lines; take the previous line too
  // when it starts the same sentence.
  const start =
    /^On .+$/.test(lines[cut - 1] ?? "") &&
    !/wrote:\s*$/.test(lines[cut - 1] ?? "")
      ? cut - 1
      : cut;
  return {
    fresh: lines.slice(0, start).join("\n").trim(),
    quoted: lines.slice(start).join("\n").trim() || null,
  };
}

export function initialOf(value: string) {
  const name = displayName(value).trim();
  return (name[0] ?? "?").toUpperCase();
}

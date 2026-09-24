import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  forgetVoiceLesson,
  listVoiceLessons,
} from "@/serverFunctions/communications";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

const LESSONS_KEY = ["voice-lessons"] as const;

const KIND_LABEL: Record<string, string> = {
  fact: "Fact",
  vocabulary: "Name",
  preference: "Preference",
  recurring_question: "Asked often",
  correction: "Correction",
};

/**
 * What the voice agent has picked up from past conversations. Anything wrong
 * can be removed here, and the next reply no longer knows it.
 */
export function VoiceLessons() {
  const queryClient = useQueryClient();
  const lessons = useQuery({
    queryKey: LESSONS_KEY,
    queryFn: () => listVoiceLessons(),
    retry: false,
  });
  const forget = useMutation({
    mutationFn: (lessonId: string) => forgetVoiceLesson({ data: { lessonId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LESSONS_KEY }),
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  if (!lessons.data) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm">What it has learned</p>
      {lessons.data.length === 0 ? (
        <p className="text-sm text-base-content/60">
          Nothing yet. It learns when a conversation ends, and straight away
          when you say &ldquo;remember that…&rdquo;.
        </p>
      ) : (
        <ul className="divide-y divide-base-300 rounded-lg border border-base-300">
          {lessons.data.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-3 py-2">
              <span className="badge badge-ghost badge-sm mt-0.5 shrink-0">
                {KIND_LABEL[item.kind] ?? item.kind}
              </span>
              <p className="min-w-0 flex-1 text-sm">{item.lesson}</p>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                aria-label="Forget this"
                disabled={forget.isPending}
                onClick={() => forget.mutate(item.id)}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

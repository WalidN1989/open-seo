import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getVoiceName, setVoiceName } from "@/serverFunctions/communications";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

const VOICE_NAME_KEY = ["voice-name"] as const;

/**
 * The name the voice agent greets you by in this business. The business keeps
 * its own name everywhere else; this is only the person the agent talks to.
 * Hidden where the Voice Agent module is not available.
 */
export function VoiceNameSettings() {
  const queryClient = useQueryClient();
  const saved = useQuery({
    queryKey: VOICE_NAME_KEY,
    queryFn: () => getVoiceName(),
    retry: false,
  });
  const [name, setName] = useState("");

  // The saved value arrives after the first render.
  useEffect(() => {
    if (saved.data) setName(saved.data.voiceName);
  }, [saved.data]);

  const save = useMutation({
    mutationFn: () => setVoiceName({ data: { voiceName: name } }),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: VOICE_NAME_KEY }),
        queryClient.invalidateQueries({ queryKey: ["voice-greeting"] }),
      ]);
      toast.success(
        result.voiceName
          ? `The voice agent will call you ${result.voiceName}`
          : "The voice agent will greet you without a name",
      );
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  if (!saved.data) return null;
  const changed = name.trim() !== saved.data.voiceName;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-base-content/50">Voice agent</h2>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-md">
          <p className="text-sm">What should the voice agent call you?</p>
          <p className="mt-1 text-sm text-base-content/60">
            Used when it greets you in this business. Each business keeps its
            own name.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input input-bordered input-sm w-44"
            value={name}
            maxLength={60}
            placeholder="Your first name"
            onChange={(event) => setName(event.target.value)}
            aria-label="Name for the voice agent"
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={!changed || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Save
          </button>
        </div>
      </div>
    </section>
  );
}

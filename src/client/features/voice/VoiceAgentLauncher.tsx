/* oxlint-disable max-lines-per-function */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, LoaderCircle, Mic, PhoneOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  createVoiceAgent,
  endVoiceConversation,
  getVoiceWorkspace,
  startVoiceConversation,
  transcribeVoiceAudio,
} from "@/serverFunctions/communications";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  startVoiceActivity,
  stepVoiceActivity,
  voiceDisplayLevel,
} from "./voiceActivity";

/**
 * The workspace returns newest first, which put every answer above the question
 * that prompted it. Sorting ascending also fixes the slice, which was keeping
 * the oldest forty rather than the most recent.
 */
function byTime(a: { createdAt: string }, b: { createdAt: string }) {
  return a.createdAt.localeCompare(b.createdAt);
}

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function VoiceAgentLauncher() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [status, setStatus] = useState("Ready to talk");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const continuousRef = useRef(false);
  const conversationRef = useRef<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const workspace = useQuery({
    queryKey: ["voice", "workspace"],
    queryFn: () => getVoiceWorkspace(),
    enabled: open,
  });

  const releaseMicrophone = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setListening(false);
    setLevel(0);
  };

  const stopListening = (submit = true) => {
    continuousRef.current = false;
    const recorder = recorderRef.current;
    if (!submit && recorder) recorder.onstop = null;
    if (recorder?.state === "recording") recorder.stop();
    recorderRef.current = null;
    releaseMicrophone();
  };

  const transcribe = useMutation({
    mutationFn: (data: {
      conversationId: string;
      audioBase64: string;
      mimeType: string;
    }) => transcribeVoiceAudio({ data: { ...data, language: "multi" } }),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["voice"] });
      // A pause is not a failure. Keep the microphone open and say so plainly
      // rather than ending the conversation on an error the person did not
      // cause.
      if ("heardNothing" in result && result.heardNothing) {
        setStatus("Listening…");
        if (continuousRef.current) void beginListening();
        return;
      }
      if ("replyError" in result && result.replyError) {
        setStatus(result.replyError);
        return;
      }
      setStatus("Speaking…");
      if ("audioBase64" in result && result.audioBase64) {
        const audio = new Audio(
          `data:${result.mimeType};base64,${result.audioBase64}`,
        );
        setSpeaking(true);
        audio.addEventListener("ended", () => {
          setSpeaking(false);
          if (continuousRef.current) void beginListening();
        });
        await audio.play().catch(() => {
          setSpeaking(false);
          setStatus("Reply ready — tap the microphone to continue");
          continuousRef.current = false;
        });
      } else if (continuousRef.current) {
        void beginListening();
      }
    },
    onError: (error) => {
      continuousRef.current = false;
      setStatus(getStandardErrorMessage(error));
    },
  });

  const beginListening = async () => {
    const activeConversationId = conversationRef.current;
    if (!activeConversationId || recorderRef.current?.state === "recording")
      return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorderRef.current = recorder;
      streamRef.current = stream;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        releaseMicrophone();
        recorderRef.current = null;
        if (!chunks.length) return;
        setStatus("Thinking…");
        const blob = new Blob(chunks, { type: recorder.mimeType });
        transcribe.mutate({
          conversationId: activeConversationId,
          audioBase64: await blobToBase64(blob),
          mimeType: blob.type || "audio/webm",
        });
      };

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = audioContext;
      const samples = new Uint8Array(analyser.frequencyBinCount);
      let activity = startVoiceActivity(performance.now());
      const monitor = () => {
        if (recorder.state !== "recording") return;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const deviation = (sample - 128) / 128;
          sum += deviation * deviation;
        }
        const loudness = Math.sqrt(sum / samples.length);
        setLevel(voiceDisplayLevel(loudness));
        const next = stepVoiceActivity(activity, loudness, performance.now());
        activity = next.state;
        if (next.action === "submit") {
          recorder.stop();
          return;
        }
        if (next.action === "discard") {
          recorder.onstop = null;
          recorder.stop();
          recorderRef.current = null;
          releaseMicrophone();
          continuousRef.current = false;
          setStatus("Conversation paused — tap the microphone when ready");
          return;
        }
        animationFrameRef.current = requestAnimationFrame(monitor);
      };
      recorder.start();
      monitor();
      setListening(true);
      setStatus("Listening…");
    } catch (error) {
      continuousRef.current = false;
      setStatus(getStandardErrorMessage(error));
    }
  };

  const start = useMutation({
    mutationFn: async () => {
      const latest = await getVoiceWorkspace();
      const agent =
        latest.agents[0] ??
        (await createVoiceAgent({
          data: {
            name: "OpenSEO Assistant",
            speechToTextProvider: "deepgram",
            textToSpeechProvider: "deepgram",
            modelProvider: "anthropic",
            credentialReference: "OPENSEO_VOICE",
          },
        }));
      return startVoiceConversation({ data: { agentConfigId: agent.id } });
    },
    onSuccess: async (conversation) => {
      conversationRef.current = conversation.id;
      setConversationId(conversation.id);
      continuousRef.current = true;
      await client.invalidateQueries({ queryKey: ["voice"] });
      await beginListening();
    },
    onError: (error) => setStatus(getStandardErrorMessage(error)),
  });

  const endConversation = async () => {
    stopListening(false);
    const activeConversationId = conversationRef.current;
    conversationRef.current = null;
    setConversationId(null);
    setStatus("Ready to talk");
    if (activeConversationId) {
      await endVoiceConversation({
        data: { conversationId: activeConversationId },
      }).catch((error) => toast.error(getStandardErrorMessage(error)));
      await client.invalidateQueries({ queryKey: ["voice"] });
    }
  };

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!conversationRef.current && !start.isPending) start.mutate();
    else if (!listening && !transcribe.isPending) {
      continuousRef.current = true;
      void beginListening();
    }
  };

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        !(event.ctrlKey || (event.metaKey && event.shiftKey))
      )
        return;
      event.preventDefault();
      setOpen(true);
      if (!conversationRef.current && !start.isPending) start.mutate();
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [start]);

  useEffect(
    () => () => {
      continuousRef.current = false;
      if (animationFrameRef.current !== null)
        cancelAnimationFrame(animationFrameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const messages = workspace.data?.messages
    .filter((message) => message.conversationId === conversationId)
    .toSorted(byTime)
    .slice(-40);

  // Past conversations, newest first, with the first thing said in each so a
  // row is recognisable without opening it.
  const pastConversations = (workspace.data?.conversations ?? [])
    .filter((conversation) => conversation.id !== conversationId)
    .map((conversation) => {
      const turns = (workspace.data?.messages ?? [])
        .filter((message) => message.conversationId === conversation.id)
        .toSorted(byTime);
      return { conversation, turns };
    })
    .filter((entry) => entry.turns.length > 0);

  const orbState = speaking
    ? "speaking"
    : listening
      ? "listening"
      : conversationId
        ? "live"
        : "idle";

  return (
    <>
      {open ? (
        <section
          aria-label="Voice Agent conversation"
          /* Translucent over the app rather than a flat card: the panel floats
             above whatever you were reading, so it should not look like it
             replaced it. */
          className="fixed right-4 bottom-24 z-50 flex h-[min(34rem,calc(100vh-9rem))] w-[min(25rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-base-content/10 bg-base-100/80 shadow-2xl ring-1 ring-base-content/5 backdrop-blur-xl md:right-6"
        >
          <header className="flex items-center gap-3 px-4 pt-4 pb-3">
            <VoiceOrb state={orbState} level={level} size="sm" />
            <p className="min-w-0 flex-1 truncate text-sm text-base-content/70">
              {status}
            </p>
            <button
              type="button"
              className={`btn btn-circle btn-ghost btn-sm ${showHistory ? "text-primary" : ""}`}
              aria-label="Past conversations"
              aria-pressed={showHistory}
              onClick={() => setShowHistory((value) => !value)}
            >
              <History className="size-4" />
            </button>
            <button
              type="button"
              className="btn btn-circle btn-ghost btn-sm"
              aria-label="Close Voice Agent"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </button>
          </header>

          <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-2">
            {showHistory ? (
              pastConversations.length ? (
                pastConversations.map(({ conversation, turns }) => (
                  <details
                    key={conversation.id}
                    className="rounded-2xl border border-base-content/10 bg-base-200/40 p-3"
                  >
                    <summary className="cursor-pointer list-none text-sm">
                      <span className="block truncate font-medium">
                        {turns[0]?.transcript ?? "Conversation"}
                      </span>
                      <span className="text-xs text-base-content/50">
                        {new Date(conversation.startedAt).toLocaleString()} ·{" "}
                        {turns.length} turn{turns.length === 1 ? "" : "s"}
                      </span>
                    </summary>
                    <div className="mt-3 space-y-2">
                      {turns.map((turn) => (
                        <Bubble key={turn.id} message={turn} />
                      ))}
                    </div>
                  </details>
                ))
              ) : (
                <p className="grid h-full place-items-center px-6 text-center text-sm text-base-content/50">
                  Past conversations will appear here once you have had one.
                </p>
              )
            ) : messages?.length ? (
              messages.map((message) => (
                <Bubble key={message.id} message={message} />
              ))
            ) : (
              <div className="grid h-full place-items-center gap-4 px-6 text-center">
                <VoiceOrb state={orbState} level={level} size="lg" />
                <p className="text-sm text-base-content/60">
                  Allow microphone access and speak. OpenSEO notices when you
                  finish.
                </p>
              </div>
            )}
          </div>

          <footer className="flex items-center justify-center gap-3 px-4 pt-2 pb-5">
            {!conversationId ? (
              <button
                type="button"
                aria-label="Start conversation"
                disabled={start.isPending}
                onClick={() => start.mutate()}
                className="group relative grid size-16 place-items-center rounded-full bg-primary text-primary-content shadow-lg shadow-primary/30 transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:opacity-60"
              >
                {/* A ring that keeps breathing while idle, so the control reads
                    as ready rather than as a button waiting to be found. */}
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/25 [animation-duration:2.4s]" />
                {start.isPending ? (
                  <LoaderCircle className="size-6 animate-spin" />
                ) : (
                  <Mic className="relative size-6" />
                )}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-sm gap-2 rounded-full"
                onClick={() => void endConversation()}
              >
                <PhoneOff className="size-4" /> End conversation
              </button>
            )}
          </footer>
        </section>
      ) : null}

      <button
        type="button"
        onClick={toggle}
        aria-label="Open Voice Agent"
        aria-expanded={open}
        title="Voice Agent · Ctrl+Space or \u2318\u21e7Space"
        className="group fixed right-4 bottom-5 z-50 grid size-14 place-items-center rounded-full transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary md:right-6 md:bottom-6"
      >
        <VoiceOrb state={orbState} level={level} size="md" />
        <span className="pointer-events-none absolute right-full mr-3 rounded-full bg-base-content px-2.5 py-1 text-xs font-medium whitespace-nowrap text-base-100 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          Voice Agent
        </span>
      </button>
    </>
  );
}

function Bubble({
  message,
}: {
  message: { speaker: string; transcript: string };
}) {
  const mine = message.speaker === "user";
  return (
    <div className={`chat ${mine ? "chat-end" : "chat-start"}`}>
      <div
        className={`chat-bubble text-sm ${mine ? "chat-bubble-primary" : "bg-base-200/70"}`}
      >
        {message.transcript}
      </div>
    </div>
  );
}

const ORB_SIZES = {
  sm: "size-8",
  md: "size-14",
  lg: "size-24",
} as const;

/**
 * The agent, drawn rather than iconified.
 *
 * Concentric rings that widen with what the microphone is actually hearing,
 * and a colour that says whose turn it is: green while it listens to you, red
 * while it is speaking. Someone glancing at the orb should know whether to
 * talk or wait without reading the status line.
 */
function VoiceOrb({
  state,
  level,
  size,
}: {
  state: "idle" | "live" | "listening" | "speaking";
  level: number;
  size: keyof typeof ORB_SIZES;
}) {
  const listening = state === "listening";
  const speaking = state === "speaking";
  // Semantic tokens, not literals, so the orb follows the theme in both modes.
  const tone = speaking
    ? {
        halo: "bg-error/20",
        inner: "bg-error/30",
        core: "from-error to-error/70",
        ring: "ring-error/40",
        glow: "shadow-error/30",
      }
    : listening
      ? {
          halo: "bg-success/20",
          inner: "bg-success/30",
          core: "from-success to-success/70",
          ring: "ring-success/40",
          glow: "shadow-success/30",
        }
      : {
          halo: "bg-primary/20",
          inner: "bg-primary/15",
          core: "from-primary to-primary/70",
          ring: "ring-primary/40",
          glow: "shadow-primary/30",
        };

  return (
    <span
      className={`relative grid ${ORB_SIZES[size]} shrink-0 place-items-center`}
      aria-hidden="true"
    >
      {/* Driven by the measured level, not a fixed animation: a still ring
          means the microphone is genuinely hearing nothing. While speaking
          there is no input to measure, so it breathes on its own instead. */}
      <span
        className={`absolute inset-0 rounded-full ${tone.halo} transition-transform duration-100 ${speaking ? "animate-ping [animation-duration:1.6s]" : ""}`}
        style={{ transform: `scale(${1 + (listening ? level * 0.55 : 0)})` }}
      />
      <span
        className={`absolute inset-[15%] rounded-full ${tone.inner} transition-transform duration-150`}
        style={{ transform: `scale(${1 + (listening ? level * 0.3 : 0)})` }}
      />
      <span
        className={`relative grid size-1/2 place-items-center rounded-full bg-gradient-to-br ${tone.core} shadow-lg ${tone.glow} ${state === "idle" ? "" : `ring-2 ${tone.ring}`}`}
      >
        <span
          className={`size-1/3 rounded-full bg-base-100 ${listening || speaking ? "animate-pulse" : ""}`}
        />
      </span>
    </span>
  );
}

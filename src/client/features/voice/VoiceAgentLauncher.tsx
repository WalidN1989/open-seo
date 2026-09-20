/* oxlint-disable max-lines-per-function */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, LoaderCircle, Mic, PhoneOff, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { useRouterState } from "@tanstack/react-router";
import {
  createVoiceAgent,
  appendVoiceTranscript,
  deleteVoiceHistory,
  endVoiceConversation,
  getVoiceGreeting,
  getVoiceWorkspace,
  startVoiceConversation,
  transcribeVoiceAudio,
} from "@/serverFunctions/communications";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { SpeechQueue } from "./speechQueue";
import { streamVoiceTurn, VoiceTurnUnavailable } from "./streamTurn";
import {
  startBargeIn,
  startVoiceActivity,
  stepBargeIn,
  stepVoiceActivity,
  voiceDisplayLevel,
} from "./voiceActivity";

const MICROPHONE: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

/**
 * Listens while the agent speaks and calls `onInterrupt` with the open
 * microphone the moment the person starts talking over it, so the reply can
 * stop and their words can be recorded without asking for the mic again.
 * Returns a stop function that releases everything if nobody interrupts.
 */
function watchForBargeIn(onInterrupt: (stream: MediaStream) => void) {
  let stopped = false;
  let frame: number | null = null;
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  const release = (keepStream: boolean) => {
    stopped = true;
    if (frame !== null) cancelAnimationFrame(frame);
    void context?.close().catch(() => undefined);
    if (!keepStream) stream?.getTracks().forEach((track) => track.stop());
  };
  void navigator.mediaDevices
    .getUserMedia({ audio: MICROPHONE })
    .then((opened) => {
      stream = opened;
      if (stopped) {
        release(false);
        return;
      }
      context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(opened).connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      let state = startBargeIn(performance.now());
      const watch = () => {
        if (stopped) return;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const deviation = (sample - 128) / 128;
          sum += deviation * deviation;
        }
        const next = stepBargeIn(
          state,
          Math.sqrt(sum / samples.length),
          performance.now(),
        );
        state = next.state;
        if (next.interrupted) {
          release(true);
          onInterrupt(opened);
          return;
        }
        frame = requestAnimationFrame(watch);
      };
      watch();
    })
    .catch(() => undefined);
  return () => release(false);
}

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
  const replyRef = useRef<{ queue: SpeechQueue; stopWatch: () => void } | null>(
    null,
  );
  const conversationRef = useRef<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const workspace = useQuery({
    queryKey: ["voice", "workspace"],
    queryFn: () => getVoiceWorkspace(),
    enabled: open,
  });

  // Silences the reply being spoken, if any, and stops listening for an
  // interruption to it.
  const stopReply = () => {
    replyRef.current?.queue.stop();
    replyRef.current?.stopWatch();
    replyRef.current = null;
    setSpeaking(false);
  };

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

  /**
   * Opens a reply: sentences are pushed in as they arrive and played back to
   * back. Talking over it stops the whole reply at once and becomes the next
   * turn.
   */
  const startSpeaking = () => {
    stopReply();
    setSpeaking(true);
    const queue = new SpeechQueue();
    const stopWatch = watchForBargeIn((stream) => {
      if (replyRef.current?.queue !== queue) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      stopReply();
      if (continuousRef.current) void beginListening(stream);
      else stream.getTracks().forEach((track) => track.stop());
    });
    replyRef.current = { queue, stopWatch };
    return queue;
  };

  /** No more sentences: when the last one has played, listen again — or hang up. */
  const finishSpeaking = (queue: SpeechQueue, thenEnd = false) => {
    queue.finish(() => {
      if (replyRef.current?.queue !== queue) return;
      stopReply();
      if (thenEnd) {
        void endConversation();
        return;
      }
      if (continuousRef.current) void beginListening();
    });
  };

  // Made once and kept, so the greeting plays the instant the orb is tapped
  // instead of after a round trip to the speech service.
  const greeting = useQuery({
    queryKey: ["voice-greeting"],
    queryFn: () => getVoiceGreeting(),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const greetingSaidRef = useRef<string | null>(null);

  // Clearing history is the person's own record to remove, so it happens at
  // once; the bin stays faint until it is wanted.
  const forget = useMutation({
    mutationFn: (data: { conversationId?: string; all?: boolean }) =>
      deleteVoiceHistory({ data }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["voice"] }),
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const greet = () => {
    const line = greeting.data;
    if (!line) return;
    greetingSaidRef.current = line.text;
    setStatus("Speaking…");
    const queue = startSpeaking();
    queue.push(line.audioBase64, line.mimeType);
    finishSpeaking(queue);
  };

  // The keyboard shortcut is registered once; it reaches the latest greeting
  // through this rather than re-registering on every render.
  const greetRef = useRef(greet);
  useEffect(() => {
    greetRef.current = greet;
  });

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
        const queue = startSpeaking();
        queue.push(result.audioBase64, result.mimeType);
        finishSpeaking(
          queue,
          Boolean("endsConversation" in result && result.endsConversation),
        );
      } else if (continuousRef.current) {
        void beginListening();
      }
    },
    onError: (error) => {
      continuousRef.current = false;
      setStatus(getStandardErrorMessage(error));
    },
  });

  /**
   * One turn, spoken as it is written: the first sentence plays while the
   * rest of the answer is still arriving. If the stream cannot start, the
   * one-shot reply answers instead, so a turn is never lost.
   */
  const runTurn = async (data: {
    conversationId: string;
    audioBase64: string;
    mimeType: string;
  }) => {
    setStatus("Thinking…");
    let queue: SpeechQueue | null = null;
    try {
      for await (const event of streamVoiceTurn({
        ...data,
        language: "multi",
      })) {
        if (event.type === "silence") {
          // A pause is not a failure: keep the microphone open.
          setStatus("Listening…");
          if (continuousRef.current) void beginListening();
          return;
        }
        if (event.type === "error") {
          if (!queue) throw new VoiceTurnUnavailable(event.message);
          setStatus(event.message);
          break;
        }
        if (event.type === "speech") {
          if (!queue) {
            setStatus("Speaking…");
            queue = startSpeaking();
          }
          queue.push(event.audioBase64, event.mimeType);
        }
        if (event.type === "done") {
          if (queue) finishSpeaking(queue, event.endsConversation);
          void client.invalidateQueries({ queryKey: ["voice"] });
          return;
        }
      }
      if (queue) finishSpeaking(queue);
      void client.invalidateQueries({ queryKey: ["voice"] });
    } catch (error) {
      if (queue) {
        stopReply();
        setStatus(getStandardErrorMessage(error));
        return;
      }
      // Nothing was spoken yet, so the older path can still answer this turn.
      console.warn(
        "Streaming voice turn failed; using the one-shot reply",
        error,
      );
      transcribe.mutate(data);
    }
  };

  const beginListening = async (openStream?: MediaStream) => {
    const activeConversationId = conversationRef.current;
    if (!activeConversationId || recorderRef.current?.state === "recording") {
      openStream?.getTracks().forEach((track) => track.stop());
      return;
    }
    try {
      const stream =
        openStream ??
        (await navigator.mediaDevices.getUserMedia({ audio: MICROPHONE }));
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
        void runTurn({
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
            name: "Digital Urgency Assistant",
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
      // The greeting is part of the conversation, so the agent knows it has
      // already said hello.
      const said = greetingSaidRef.current;
      greetingSaidRef.current = null;
      const saved = said
        ? appendVoiceTranscript({
            data: {
              conversationId: conversation.id,
              speaker: "agent",
              transcript: said,
            },
          }).catch(() => undefined)
        : Promise.resolve();
      void saved.then(() => client.invalidateQueries({ queryKey: ["voice"] }));
      // While the greeting is still playing, its end opens the microphone.
      if (!replyRef.current) await beginListening();
    },
    onError: (error) => setStatus(getStandardErrorMessage(error)),
  });

  const endConversation = async () => {
    stopReply();
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
    if (!conversationRef.current && !start.isPending) {
      continuousRef.current = true;
      greet();
      start.mutate();
    } else if (!listening && !transcribe.isPending) {
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
      if (!conversationRef.current && !start.isPending) {
        continuousRef.current = true;
        greetRef.current();
        start.mutate();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [start]);

  useEffect(
    () => () => {
      continuousRef.current = false;
      replyRef.current?.queue.stop();
      replyRef.current?.stopWatch();
      if (animationFrameRef.current !== null)
        cancelAnimationFrame(animationFrameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  // Moving to another page fades the panel away so the page can be used; the
  // conversation carries on, and the orb brings the panel back.
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathnameRef.current === pathname) return;
    pathnameRef.current = pathname;
    if (conversationRef.current) setOpen(false);
  }, [pathname]);

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
      {open || conversationId ? (
        <section
          aria-label="Voice Agent conversation"
          aria-hidden={!open}
          inert={!open}
          /* Translucent over the app rather than a flat card: the panel floats
             above whatever you were reading, so it should not look like it
             replaced it. While a conversation is running it stays mounted and
             fades out of the way instead, so hiding it never ends the call. */
          className={`fixed right-4 bottom-24 z-50 flex h-[min(34rem,calc(100vh-9rem))] w-[min(25rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-base-content/10 bg-base-100/80 shadow-2xl ring-1 ring-base-content/5 backdrop-blur-xl transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none md:right-6 ${open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
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
            {showHistory && pastConversations.length ? (
              <button
                type="button"
                aria-label="Delete all past conversations"
                className="p-1 text-base-content/15 transition-colors hover:text-error focus-visible:text-error"
                onClick={() => {
                  if (window.confirm("Delete every past conversation?")) {
                    forget.mutate({ all: true });
                  }
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
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
                    className="group/row rounded-2xl border border-base-content/10 bg-base-200/40 p-3"
                  >
                    <summary className="flex cursor-pointer list-none items-start gap-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {turns[0]?.transcript ?? "Conversation"}
                        </span>
                        <span className="text-xs text-base-content/50">
                          {new Date(conversation.startedAt).toLocaleString()} ·{" "}
                          {turns.length} turn{turns.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label="Delete this conversation"
                        className="mt-0.5 shrink-0 p-1 text-base-content/15 transition-colors hover:text-error focus-visible:text-error group-hover/row:text-base-content/35"
                        onClick={(event) => {
                          event.preventDefault();
                          forget.mutate({ conversationId: conversation.id });
                        }}
                      >
                        <Trash2 className="size-3" />
                      </button>
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
                  Allow microphone access and speak. Digital Urgency notices
                  when you finish.
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
        aria-label={
          conversationId
            ? "Voice Agent — conversation live"
            : "Open Voice Agent"
        }
        aria-expanded={open}
        title="Voice Agent · Ctrl+Space or \u2318\u21e7Space"
        className="group fixed right-4 bottom-5 z-50 grid size-14 place-items-center rounded-full transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary md:right-6 md:bottom-6"
      >
        {/* While a conversation is live the orb keeps glowing, so it is plain
            the agent is still with you after the panel fades away. */}
        {conversationId ? (
          <span
            aria-hidden="true"
            className="voice-orb-halo pointer-events-none absolute -inset-3 rounded-full blur-xl"
            style={{
              backgroundImage: RING_GRADIENT,
              opacity: speaking || listening ? 0.75 : 0.45,
            }}
          />
        ) : null}
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
 * The hues the ring cycles through — magenta into pink, a warm peach, then
 * blue and violet back round to magenta, as on Deepgram's orb. Written as one
 * conic gradient so the colours flow into each other instead of meeting at
 * seams.
 */
const RING_GRADIENT =
  "conic-gradient(from 0deg, #ff2fb4, #ff6ec7, #ffb089, #7a8bff, #3b6bff, #a24bff, #ff2fb4)";

/** Cuts the gradient disc down to a ring: clear in the middle, solid at the rim. */
const RING_MASK =
  "radial-gradient(closest-side, transparent 74%, #000 79%, #000 95%, transparent 100%)";

/** The same palette started a third of the way round, for the second ring. */
const COUNTER_GRADIENT =
  "conic-gradient(from 120deg, #ff2fb4, #ff6ec7, #ffb089, #7a8bff, #3b6bff, #a24bff, #ff2fb4)";

function ringStyle(gradient: string) {
  return {
    backgroundImage: gradient,
    maskImage: RING_MASK,
    WebkitMaskImage: RING_MASK,
  } as const;
}

/**
 * The agent, drawn rather than iconified: a neon ring that moves like liquid.
 *
 * Transparent all the way through — the page shows in the middle, so the orb
 * sits on whatever is behind it instead of punching a dark hole in it.
 *
 * Two elliptical rings turn in opposite directions and keep crossing, so the
 * outline ripples and reshapes instead of simply spinning. Whose turn it is
 * used to be a colour; now it is motion: slow and quiet while it waits,
 * swelling with your voice while it listens, fast and bright while it talks.
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
  const active = listening || speaking;
  // The measured level while listening, so a still orb means the microphone
  // genuinely hears nothing. Speaking has nothing to measure, so it runs
  // brighter and faster on its own.
  const swell = listening ? level : speaking ? 0.4 : 0;
  // Custom properties the stylesheet reads, typed as such rather than cast:
  // React's CSSProperties does not know about "--" names on its own.
  const tempo: CSSProperties & Record<`--${string}`, string> = {
    "--orb-spin": speaking ? "2.6s" : active ? "4.5s" : "8s",
    "--orb-counter": speaking ? "3.6s" : active ? "6s" : "11s",
    "--orb-breath": speaking ? "1.1s" : "3.2s",
  };

  return (
    <span
      className={`voice-orb-breathe relative grid ${ORB_SIZES[size]} shrink-0 place-items-center`}
      style={tempo}
      aria-hidden="true"
    >
      {/* Glow: the ring again, blurred, brightening with activity. */}
      <span className="voice-orb-turn absolute inset-0">
        <span
          className="absolute inset-0 rounded-full blur-md transition-opacity duration-300"
          style={{
            ...ringStyle(RING_GRADIENT),
            opacity: 0.45 + swell * 0.5 + (active ? 0.15 : 0),
          }}
        />
      </span>
      {/* First ring: squashed a little, turning clockwise. The squash turns
          with it, which is what makes the outline wobble. */}
      <span className="voice-orb-turn absolute inset-0">
        <span
          className="absolute inset-0 rounded-full transition-transform duration-100"
          style={{
            ...ringStyle(RING_GRADIENT),
            transform: `scale(${1 + swell * 0.1}, ${0.9 + swell * 0.1})`,
          }}
        />
      </span>
      {/* Second ring: squashed the other way, turning back against the first. */}
      <span className="voice-orb-counter absolute inset-0">
        <span
          className="absolute inset-0 rounded-full opacity-80 transition-transform duration-100"
          style={{
            ...ringStyle(COUNTER_GRADIENT),
            transform: `scale(${0.9 + swell * 0.1}, ${1 + swell * 0.1})`,
          }}
        />
      </span>
    </span>
  );
}

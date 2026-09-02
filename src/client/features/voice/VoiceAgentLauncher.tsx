/* oxlint-disable max-lines-per-function */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, LoaderCircle, Mic, PhoneOff, X } from "lucide-react";
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
  const [level, setLevel] = useState(0);
  const [status, setStatus] = useState("Ready to talk");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const continuousRef = useRef(false);
  const conversationRef = useRef<string | null>(null);

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
      if ("replyError" in result && result.replyError) {
        setStatus(result.replyError);
        return;
      }
      setStatus("Speaking…");
      if ("audioBase64" in result && result.audioBase64) {
        const audio = new Audio(
          `data:${result.mimeType};base64,${result.audioBase64}`,
        );
        audio.addEventListener("ended", () => {
          if (continuousRef.current) void beginListening();
        });
        await audio.play().catch(() => {
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
    .slice(-8);

  return (
    <>
      {open ? (
        <section
          aria-label="Voice Agent conversation"
          className="fixed right-4 bottom-24 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl md:right-6"
        >
          <header className="flex items-center gap-3 border-b border-base-300 px-4 py-3">
            <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-content">
              <Bot className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">OpenSEO Voice Agent</h2>
              <p className="truncate text-xs text-base-content/60">{status}</p>
            </div>
            <button
              type="button"
              className="btn btn-square btn-ghost btn-sm"
              aria-label="Close Voice Agent"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </button>
          </header>

          <div className="min-h-52 space-y-2 overflow-y-auto bg-base-200/40 p-4">
            {messages?.length ? (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`chat ${message.speaker === "user" ? "chat-end" : "chat-start"}`}
                >
                  <div
                    className={`chat-bubble text-sm ${message.speaker === "user" ? "chat-bubble-primary" : ""}`}
                  >
                    {message.transcript}
                  </div>
                </div>
              ))
            ) : (
              <div className="grid min-h-44 place-items-center text-center text-sm text-base-content/60">
                <p>
                  Allow microphone access and speak. OpenSEO will notice when
                  you finish.
                </p>
              </div>
            )}
          </div>

          <footer className="flex items-center justify-center gap-3 border-t border-base-300 p-4">
            {!conversationId ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={start.isPending}
                onClick={() => start.mutate()}
              >
                {start.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Mic className="size-4" />
                )}
                Start conversation
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={`btn ${listening ? "btn-error" : "btn-primary"}`}
                  disabled={transcribe.isPending}
                  onClick={() =>
                    listening
                      ? stopListening(false)
                      : (() => {
                          continuousRef.current = true;
                          void beginListening();
                        })()
                  }
                  style={
                    listening
                      ? {
                          boxShadow: `0 0 0 ${4 + level * 12}px color-mix(in oklab, var(--color-error) 25%, transparent)`,
                        }
                      : undefined
                  }
                >
                  {transcribe.isPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Mic className="size-4" />
                  )}
                  {listening ? "Listening" : "Speak"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void endConversation()}
                >
                  <PhoneOff className="size-4" /> End
                </button>
              </>
            )}
          </footer>
        </section>
      ) : null}

      <button
        type="button"
        onClick={toggle}
        aria-label="Open Voice Agent"
        aria-expanded={open}
        title="Voice Agent · Ctrl+Space or ⌘⇧Space"
        className={`group fixed right-4 bottom-5 z-50 flex items-center gap-2 rounded-full border border-primary/25 px-3 py-3 text-primary-content shadow-xl shadow-primary/20 transition hover:-translate-y-0.5 hover:shadow-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:right-6 md:bottom-6 ${listening ? "animate-pulse bg-error" : conversationId ? "bg-success" : "bg-primary"}`}
      >
        <span className="relative grid size-7 place-items-center rounded-full bg-primary-content/15">
          <Bot className="size-4" aria-hidden="true" />
          <span className="absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-full bg-success text-success-content ring-2 ring-primary">
            <Mic className="size-2.5" aria-hidden="true" />
          </span>
        </span>
        <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all duration-200 group-hover:max-w-28 group-hover:pr-1 group-hover:opacity-100 group-focus-visible:max-w-28 group-focus-visible:pr-1 group-focus-visible:opacity-100">
          Voice Agent
        </span>
      </button>
    </>
  );
}

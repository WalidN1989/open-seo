const ADDRESSES = [
  {
    title: "Webhook address",
    help: "Paste this into ElevenLabs as the post-call webhook URL.",
    path: "/api/voice/elevenlabs/",
  },
  {
    title: "Caller recognition address",
    help: "Paste this into ElevenLabs as the conversation initiation webhook URL, with the x-openseo-secret header set to your Caller recognition secret.",
    path: "/api/voice/elevenlabs-caller/",
  },
] as const;

/** The two URLs ElevenLabs is pointed at for one business connection. */
export function ElevenLabsAddresses({
  connectionId,
}: {
  connectionId: string;
}) {
  return ADDRESSES.map((address) => {
    const url = `${window.location.origin}${address.path}${connectionId}`;
    return (
      <div key={address.path} className="rounded-xl border border-base-300 p-4">
        <h2 className="text-sm font-semibold">{address.title}</h2>
        <p className="mt-1 text-xs text-base-content/60">{address.help}</p>
        <code className="mt-2 block break-all rounded bg-base-200 px-2 py-1 text-xs">
          {url}
        </code>
        <button
          type="button"
          className="btn btn-outline btn-xs mt-3 w-full"
          onClick={() => {
            void navigator.clipboard.writeText(url);
          }}
        >
          Copy address
        </button>
      </div>
    );
  });
}

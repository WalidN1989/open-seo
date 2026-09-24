const ELEVENLABS_ADDRESSES = [
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

function AddressCard({
  title,
  help,
  url,
}: {
  title: string;
  help: string;
  url: string;
}) {
  return (
    <div className="rounded-xl border border-base-300 p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-base-content/60">{help}</p>
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
}

/** The two URLs ElevenLabs is pointed at for one business connection. */
export function ElevenLabsAddresses({
  connectionId,
}: {
  connectionId: string;
}) {
  return ELEVENLABS_ADDRESSES.map((address) => (
    <AddressCard
      key={address.path}
      title={address.title}
      help={address.help}
      url={`${window.location.origin}${address.path}${connectionId}`}
    />
  ));
}

/** Where Twilio posts texts in, and delivery updates, for one SMS number. */
export function SmsWebhookAddress({ connectionId }: { connectionId: string }) {
  return (
    <AddressCard
      title="SMS webhook address"
      help="In Twilio, open the number → Messaging configuration → A message comes in: paste this, method HTTP POST."
      url={`${window.location.origin}/api/sms/twilio/${connectionId}`}
    />
  );
}

/** Where the website's server sends each finished voice-agent call. */
export function DeepgramCallLogAddress({
  connectionId,
}: {
  connectionId: string;
}) {
  return (
    <AddressCard
      title="Call log address"
      help="Add this to your website's secrets as VOICE_LOG_URL, next to VOICE_LOG_SECRET."
      url={`${window.location.origin}/api/voice/deepgram/${connectionId}`}
    />
  );
}

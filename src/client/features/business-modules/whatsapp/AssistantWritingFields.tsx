import { WHATSAPP_RESPONSE_FIELDS } from "@/shared/whatsapp-ai-configuration";
import type { WhatsappResponseMessages } from "@/types/schemas/whatsappResponseMessages";

export function AssistantWritingFields({
  style,
  messages,
  onStyle,
  onMessages,
}: {
  style: string;
  messages: WhatsappResponseMessages;
  onStyle: (value: string) => void;
  onMessages: (value: WhatsappResponseMessages) => void;
}) {
  return (
    <section className="grid gap-4 rounded-xl border border-base-300 p-4">
      <h3 className="font-medium">WhatsApp writing style and responses</h3>
      <p className="text-sm text-base-content/60">
        These are the instructions and fixed messages used at runtime. Edit the
        tone, language, length and wording here. Clearing the writing-style
        field removes style guidance. Access checks, verification outcomes and
        sending protections remain enforced.
      </p>
      <label className="form-control w-full">
        <span className="mb-1 text-sm font-medium">Writing style</span>
        <textarea
          className="textarea textarea-bordered w-full"
          rows={8}
          maxLength={6000}
          value={style}
          onChange={(event) => onStyle(event.currentTarget.value)}
        />
      </label>
      {WHATSAPP_RESPONSE_FIELDS.map(({ key, label, variables }) => (
        <label key={key} className="form-control w-full">
          <span className="mb-1 text-sm font-medium">{label}</span>
          <textarea
            className="textarea textarea-bordered w-full"
            rows={3}
            maxLength={2000}
            value={messages[key]}
            onChange={(event) =>
              onMessages({ ...messages, [key]: event.currentTarget.value })
            }
          />
          <span className="mt-1 text-xs text-base-content/60">
            Available placeholders: {variables}
          </span>
        </label>
      ))}
    </section>
  );
}

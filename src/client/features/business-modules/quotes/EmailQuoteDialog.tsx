import { useState } from "react";
import { Paperclip, Send } from "lucide-react";
import { Modal } from "@/client/components/Modal";

/** Confirm the recipient and add a note before a quote goes out by email. */
export function EmailQuoteDialog({
  number,
  defaultTo,
  sending,
  onClose,
  onSend,
}: {
  number: string;
  defaultTo: string;
  sending: boolean;
  onClose: () => void;
  onSend: (input: { to: string; message: string }) => void;
}) {
  const [to, setTo] = useState(defaultTo);
  const [message, setMessage] = useState("");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());
  return (
    <Modal maxWidth="max-w-lg" onClose={onClose} labelledBy="email-quote">
      <div className="space-y-4">
        <div>
          <h2 id="email-quote" className="text-lg font-bold">
            Email {number}
          </h2>
          <p className="text-sm text-base-content/60">
            Sent from your connected mailbox with a link to view it and the PDF
            attached. A draft is marked as sent.
          </p>
        </div>
        <label className="form-control">
          <span className="label-text mb-1 text-xs font-medium">To</span>
          <input
            className="input input-bordered input-sm"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <label className="form-control">
          <span className="label-text mb-1 text-xs font-medium">
            Personal note (optional)
          </span>
          <textarea
            className="textarea textarea-bordered text-sm"
            rows={4}
            maxLength={2000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Great chatting today. As discussed, this covers the five-page site and Google Maps setup."
          />
        </label>
        <div className="flex items-center gap-1.5 text-xs text-base-content/55">
          <Paperclip className="size-3.5" /> {number}.pdf will be attached
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!valid || sending}
            onClick={() => onSend({ to: to.trim(), message: message.trim() })}
          >
            {sending ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <Send className="size-4" />
            )}
            Send quote
          </button>
        </div>
      </div>
    </Modal>
  );
}

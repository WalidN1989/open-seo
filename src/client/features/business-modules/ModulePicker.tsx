import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { X } from "lucide-react";
import { getBusinessModuleAccess } from "@/serverFunctions/business-modules";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { ClientModuleList } from "./ClientModuleList";
import { businessModuleIcons } from "./moduleIcons";

/** Space opens navigation only when it will not interrupt typing or a control. */
export function ModulePicker() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const location = useLocation();
  const access = useQuery({
    queryKey: ["business-modules", "access"],
    queryFn: () => getBusinessModuleAccess(),
    enabled: open,
    staleTime: 60_000,
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.repeat ||
        event.isComposing ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="button"], [role="combobox"], [role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"], dialog, summary, audio, video',
        )
      )
        return;
      if (document.querySelector('dialog[open], [aria-modal="true"]')) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) element.showModal();
    if (!open && element?.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-label="Active modules"
      className="module-picker m-auto w-[calc(100%_-_2rem)] max-w-5xl max-h-[calc(100dvh_-_2rem)] overflow-y-auto rounded-2xl border border-base-300 bg-base-100 p-6 text-base-content shadow-xl backdrop:bg-black/40"
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
      onClick={(event) => {
        // Native dialog clicks outside its rectangle land on the dialog itself.
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          setOpen(false);
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-base-content/60">
          Choose a module · Esc to close
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-square btn-sm"
          aria-label="Close module picker"
          onClick={() => setOpen(false)}
        >
          <X className="size-4" />
        </button>
      </div>
      {open ? (
        access.isPending ? (
          <p role="status">Loading active modules…</p>
        ) : access.isError ? (
          <p role="alert" className="alert alert-error">
            {getStandardErrorMessage(access.error)}
          </p>
        ) : (
          <ClientModuleList
            modules={access.data ?? []}
            icons={businessModuleIcons}
            onNavigate={() => setOpen(false)}
          />
        )
      ) : null}
    </dialog>
  );
}

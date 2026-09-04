import * as React from "react";
import { z } from "zod";
import {
  getCurrentAuthRedirect,
  getOAuthSignedQuery,
} from "@/lib/auth-redirect";
import { isHostedClientAuthMode, isUserClientAuthMode } from "@/lib/auth-mode";

export const authRedirectSearchSchema = z.object({
  redirect: z.string().optional(),
});

export function useAuthPageState(redirect: string | undefined) {
  const redirectTo = getCurrentAuthRedirect(redirect);
  const oauthQuery =
    typeof window !== "undefined"
      ? getOAuthSignedQuery(window.location.search)
      : null;
  const isHostedMode = isUserClientAuthMode();

  return {
    redirectTo,
    oauthQuery,
    isHostedMode,
    hasGoogleAuth: isHostedClientAuthMode(),
  };
}

export function AuthMethodChooser({
  googleLabel,
  emailLabel = "Continue with email",
  isBusy,
  disabled,
  onContinueWithGoogle,
  onContinueWithEmail,
}: {
  googleLabel: string;
  emailLabel?: string;
  isBusy?: boolean;
  disabled?: boolean;
  onContinueWithGoogle: () => void;
  onContinueWithEmail: () => void;
}) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        className="btn w-full border border-black/10 bg-white text-neutral-900 hover:border-black/20 hover:bg-neutral-50 disabled:bg-white disabled:text-neutral-500 disabled:opacity-70"
        onClick={onContinueWithGoogle}
        disabled={disabled || isBusy}
      >
        <GoogleLogo />
        {isBusy ? "Opening Google..." : googleLabel}
      </button>

      <button
        type="button"
        className="btn w-full"
        onClick={onContinueWithEmail}
        disabled={disabled || isBusy}
      >
        {emailLabel}
      </button>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="size-4 shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.72H.94v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.16.28-1.7V4.96H.94A9 9 0 0 0 0 9c0 1.45.34 2.82.94 4.04l3.02-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.64 8.64 0 0 0 9 0 9 9 0 0 0 .94 4.96L3.96 7.3C4.67 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * True inside the showcase shell, where the brand already sits top-left and
 * repeating the logo above the form would be the same mark twice on one
 * screen.
 */
const AuthShowcaseContext = React.createContext(false);

export function AuthPageCard({
  title,
  helperText,
  children,
  footer,
}: {
  title: string;
  helperText?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const inShowcase = React.useContext(AuthShowcaseContext);
  return (
    <div className="w-full max-w-xs space-y-6">
      <div className="text-center space-y-3">
        {inShowcase ? null : (
          <img
            src="/digital-urgency-logo.png"
            alt="Digital Urgency"
            className="mx-auto size-10 rounded-lg"
          />
        )}
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {helperText ? (
            <p className="text-sm text-base-content/60 mt-1">{helperText}</p>
          ) : null}
        </div>
      </div>

      {children}

      {footer ? <div className="text-center">{footer}</div> : null}
    </div>
  );
}

/**
 * The signed-out pages get a headline and a looping still beside the form;
 * everything else keeps the plain centred card.
 *
 * Opt-in rather than default because the same shell wraps mid-flow states —
 * the authenticated loading gate, the onboarding chat — where a full-height
 * marketing panel would be noise around a spinner.
 */
export function AuthPageShell({
  children,
  showcase = false,
}: {
  children: React.ReactNode;
  showcase?: boolean;
}) {
  if (!showcase) {
    return (
      // `h-[100dvh]` + `overflow-y-auto` makes this a scroll container, and the
      // auto-margin child centers when it fits but stays fully reachable (top and
      // bottom) when it's taller than the viewport. Plain `justify-center` clips
      // the overflow with no way to scroll to it.
      <div className="h-[100dvh] flex flex-col items-center overflow-y-auto p-4 bg-base-200">
        <div className="m-auto flex w-full flex-col items-center">
          {children}
        </div>
      </div>
    );
  }

  return (
    // Committed to the dark theme whatever the app is set to: the clip beside
    // the form is lit for a dark surround, and a pale page next to it reads as
    // two different products. Scoping data-theme here keeps every DaisyUI
    // field and button on the same palette without touching the app's own
    // theme preference.
    <AuthShowcaseContext.Provider value>
      <div
        data-theme="openseo-dark"
        className="min-h-[100dvh] bg-base-200 text-base-content lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-6 lg:p-5"
      >
        {/* The form column is its own scroll container so a tall form stays
            reachable without the panel beside it scrolling away. */}
        <div className="relative flex min-h-[100dvh] flex-col overflow-y-auto px-6 py-6 lg:min-h-0 lg:px-14 lg:py-10">
          <a
            href="/"
            className="auth-rise flex w-fit items-center gap-2.5 self-center"
            aria-label="Digital Urgency"
          >
            <img
              src="/digital-urgency-logo.png"
              alt=""
              className="auth-logo-mark size-9 rounded-md"
            />
            <span className="text-lg font-semibold tracking-tight">
              Digital Urgency
            </span>
          </a>

          {/* Everything in the column shares one centre line: the brand above,
              the headline, the subhead and the card. The halo is positioned
              against the headline block, which is why that block is relative. */}
          <div className="m-auto flex w-full max-w-md flex-col items-center gap-10 py-10 text-center">
            <div className="relative space-y-4">
              <div aria-hidden className="auth-halo" />
              <h2 className="auth-headline-sheen auth-rise relative text-balance font-serif text-5xl leading-[1.05] tracking-tight xl:text-6xl">
                Every client, one workspace
              </h2>
              <p className="auth-rise auth-rise-2 relative mx-auto max-w-sm text-base text-base-content/60">
                Search performance, CRM and conversations for every site you
                run.
              </p>
            </div>

            <div className="auth-rise auth-rise-3 flex w-full flex-col items-center rounded-2xl border border-base-300 bg-base-100 px-6 py-8 shadow-[0_1px_0_0_oklch(100%_0_0/0.04)_inset]">
              {children}
            </div>
          </div>
        </div>

        <AuthShowcase />
      </div>
    </AuthShowcaseContext.Provider>
  );
}

/**
 * Decoration, so it is hidden from assistive technology and skipped on small
 * screens entirely — no reason to spend a phone's data on a background.
 */
function AuthShowcase() {
  return (
    <div className="hidden lg:block">
      <video
        className="h-full w-full rounded-2xl object-cover"
        src="/login-hero.mp4"
        poster="/login-hero-poster.jpg"
        autoPlay
        muted
        loop
        // iOS refuses to autoplay without this and opens fullscreen instead.
        playsInline
        preload="metadata"
        aria-hidden
        tabIndex={-1}
      />
    </div>
  );
}

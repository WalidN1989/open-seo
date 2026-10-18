import { Link } from "@tanstack/react-router";
import { useProjectAddress } from "@/client/lib/use-project-address";

/**
 * Where to get a key, worded for the mode: hosted offers it as the headless
 * alternative to the OAuth login; self-hosted makes it the only way in.
 */
export function KeyHint({
  hosted,
  keyPlaceholder,
}: {
  hosted: boolean;
  keyPlaceholder: string;
}) {
  const workspaceProjectAddress = useProjectAddress();

  return hosted ? (
    <p className="mt-2 text-xs text-base-content/55">
      For headless or CI setups, use an API key from{" "}
      <Link
        className="link link-primary"
        to="/p/$projectId/workspace-settings"
        params={{ projectId: workspaceProjectAddress }}
      >
        Settings
      </Link>{" "}
      instead of the OAuth login.
    </p>
  ) : (
    <p className="mt-2 text-xs text-base-content/55">
      Create one under{" "}
      <Link
        className="link link-primary"
        to="/p/$projectId/workspace-settings"
        params={{ projectId: workspaceProjectAddress }}
      >
        Settings → API keys → Create API key
      </Link>
      , then paste it where the commands below say{" "}
      <code className="font-mono">{keyPlaceholder}</code>. It is shown once.
    </p>
  );
}

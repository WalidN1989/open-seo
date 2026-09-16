import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { listClientLogins, setClientDemoData } from "@/serverFunctions/team";

type ClientLogin = {
  userId: string;
  name: string;
  email: string;
  neverSignedIn: boolean;
  lastSeenAt: string | null;
  daysQuiet: number | null;
  remindersSent: number;
  warnedAboutClosing: boolean;
  demoData: boolean;
  welcomeStatus: string | null;
};

/**
 * The clients who have a login here, and how long each has been away.
 *
 * The reminder emails go out on their own; this is where their progress is
 * visible, and the only place the sample-data switch can be flipped once the
 * account exists. Closing an account is not offered: that is a decision, not
 * a toggle.
 */
export function ClientLoginList() {
  const queryClient = useQueryClient();
  const logins = useQuery({
    queryKey: ["team", "client-logins"],
    queryFn: () => listClientLogins(),
  });

  const toggle = useMutation({
    mutationFn: (input: { userId: string; demoData: boolean }) =>
      setClientDemoData({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team"] });
      toast.success("Saved");
    },
    onError: (error: unknown) => toast.error(getStandardErrorMessage(error)),
  });

  const rows: ClientLogin[] = logins.data ?? [];
  if (!logins.isLoading && rows.length === 0) return null;

  return (
    <section className="space-y-3 rounded-lg border border-base-300 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Users className="size-4" /> Client logins
        </h3>
        <Link to="/modules/overview" className="link link-primary text-xs">
          Preview the sample overview
        </Link>
      </div>
      {logins.isLoading ? (
        <p className="text-xs text-base-content/60">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Person</th>
                <th>Activity</th>
                <th>Reminders</th>
                <th>Sample data</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId}>
                  <td>
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-base-content/60">
                      {row.email}
                    </div>
                  </td>
                  <td className="text-xs">
                    {row.neverSignedIn ? (
                      <span className="text-warning">Never signed in</span>
                    ) : (
                      `Quiet ${row.daysQuiet ?? 0} day${row.daysQuiet === 1 ? "" : "s"}`
                    )}
                  </td>
                  <td className="text-xs">
                    {row.warnedAboutClosing
                      ? "Warned about closing"
                      : `${row.remindersSent} of 3`}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      className="toggle toggle-sm toggle-primary"
                      checked={row.demoData}
                      disabled={toggle.isPending}
                      aria-label={`Sample data for ${row.email}`}
                      onChange={(event) =>
                        toggle.mutate({
                          userId: row.userId,
                          demoData: event.target.checked,
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

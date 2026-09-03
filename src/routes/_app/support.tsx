import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/support")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});

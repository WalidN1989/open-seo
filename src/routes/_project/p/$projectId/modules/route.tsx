import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_project/p/$projectId/modules")({
  component: Outlet,
});

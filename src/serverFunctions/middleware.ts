import { createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { errorHandlingMiddleware } from "@/middleware/errorHandling";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { ensureUserMiddleware } from "@/middleware/ensureUser";

const ensuredUserContextSchema: z.ZodType<EnsuredUserContext> = z.object({
  userId: z.string(),
  userEmail: z.string(),
  emailVerified: z.boolean(),
  organizationId: z.string(),
  project: z.any().optional(),
});

function getAuthenticatedContext(context: unknown): EnsuredUserContext {
  const result = ensuredUserContextSchema.safeParse(context);
  if (!result.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Authenticated server function context missing",
    );
  }
  return result.data;
}

export const globalServerFunctionMiddleware = [
  errorHandlingMiddleware,
  ensureUserMiddleware,
] as const;

export const requireAuthenticatedContext = [
  createMiddleware({ type: "function" }).server(async ({ next, context }) => {
    const authenticatedContext = getAuthenticatedContext(context);

    return next({
      context: authenticatedContext,
    });
  }),
] as const;

/**
 * Authorization by signed link rather than by session.
 *
 * The document a client receives has to open without an account, so its
 * credential is a token that names one invoice in one workspace and expires.
 * This is a middleware rather than a check inside the handler so the
 * authorization stays declared on the endpoint, where every other one declares
 * it and where the coverage test can see it.
 */
export const requireSignedDocumentToken = [
  createMiddleware({ type: "function" }).server(async ({ next, data }) => {
    const token =
      data && typeof data === "object" && "token" in data
        ? (data as { token?: unknown }).token
        : null;
    if (typeof token !== "string" || !token) {
      throw new AppError("NOT_FOUND", "That link is not valid.");
    }
    const { getRequiredEnvValue } = await import("@/server/lib/runtime-env");
    const { verifyDocumentToken } =
      await import("@/server/features/invoicing/documentLink");
    const claims = await verifyDocumentToken(
      token,
      await getRequiredEnvValue("BETTER_AUTH_SECRET"),
      Date.now(),
    );
    if (!claims) {
      throw new AppError("NOT_FOUND", "That link has expired or is not valid.");
    }
    return next({ context: claims });
  }),
] as const;

export const requireProjectContext = [
  createMiddleware({ type: "function" }).server(async ({ next, context }) => {
    const authenticatedContext = getAuthenticatedContext(context);

    if (!authenticatedContext.project) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Project context missing from authenticated server function",
      );
    }

    return next({
      context: {
        ...authenticatedContext,
        project: authenticatedContext.project,
        projectId: authenticatedContext.project.id,
      },
    });
  }),
] as const;

/** True for a unique-index violation from either dialect the app runs on. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const candidate = current as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (candidate.code === "23505") return true;
    if (
      typeof candidate.message === "string" &&
      /unique constraint/i.test(candidate.message)
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

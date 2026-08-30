import { expect } from "vitest";

/**
 * A denial must not leak. Asserting only that a call rejects would pass for an
 * error message that quotes the foreign record it refused to return, so the
 * forbidden values are checked against the thrown value too.
 */
export async function expectDenied(
  operation: () => Promise<unknown>,
  forbiddenValues: readonly string[] = [],
) {
  let threw: unknown;
  let result: unknown;
  try {
    result = await operation();
  } catch (error) {
    threw = error;
  }

  if (threw === undefined) {
    // Some reads answer with emptiness rather than an error. That is a valid
    // refusal, as long as nothing foreign came back with it.
    const serialized = JSON.stringify(result ?? null);
    expect(
      serialized === "null" ||
        serialized === "[]" ||
        serialized === "{}" ||
        serialized === "undefined",
      `expected a denial or an empty result, received: ${serialized.slice(0, 200)}`,
    ).toBe(true);
    return;
  }

  const message =
    threw instanceof Error ? threw.message : JSON.stringify(threw);
  const code =
    threw && typeof threw === "object" && "code" in threw
      ? String((threw as { code: unknown }).code)
      : message;
  expect(
    /NOT_FOUND|FORBIDDEN|not found|no access|denied/i.test(
      `${code} ${message}`,
    ),
    `expected NOT_FOUND or FORBIDDEN, received: ${code} ${message}`,
  ).toBe(true);

  for (const value of forbiddenValues) {
    expect(message).not.toContain(value);
  }
}

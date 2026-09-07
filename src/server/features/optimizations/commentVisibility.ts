/**
 * Who sees which comments.
 *
 * Kept free of database imports so the rule can be tested directly. Internal
 * notes are working chatter between the agency and the assistant; a client
 * sees the conversation they are part of and nothing else, so this filter is
 * the only thing standing between the two.
 */

export type VisibilityRow = { visibility: string };

export function isStaffRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function visibleComments<T extends VisibilityRow>(
  comments: readonly T[],
  staff: boolean,
): T[] {
  // Anything not explicitly marked client is internal. Defaulting the other
  // way would leak a note the moment a new visibility value appeared.
  return comments.filter((comment) => staff || comment.visibility === "client");
}

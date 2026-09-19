const REMEMBER =
  /\b(remember|from now on|going forward|in future|don'?t forget|keep in mind|always call|never call)\b/i;

/** Whether the person is asking the voice agent to remember something. */
export function asksToRemember(transcript: string) {
  return REMEMBER.test(transcript);
}

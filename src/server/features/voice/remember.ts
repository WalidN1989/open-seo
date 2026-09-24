const REMEMBER =
  /\b(remember|from now on|going forward|in future|don'?t forget|keep in mind|always call|never call)\b/i;

/** Whether the person is asking the voice agent to remember something. */
export function asksToRemember(transcript: string) {
  return REMEMBER.test(transcript);
}

const FAREWELL =
  /\b(thank you|thanks|thank u|that'?s all|that is all|that'?s it|goodbye|good bye|bye bye|bye|see you|talk later|catch you later|nothing else|no more questions|we'?re done|i'?m done)\b/i;
const STILL_ASKING =
  /\b(but|and|also|what|why|how|when|where|which|can you|could you|tell me|show me)\b/i;

/**
 * Whether the person is ending the conversation rather than asking again.
 *
 * "Thanks, and what about the rankings?" is not a goodbye, so a farewell that
 * carries another question keeps the line open.
 */
export function isFarewell(transcript: string) {
  const said = transcript.trim();
  if (!said || said.length > 120) return false;
  return FAREWELL.test(said) && !STILL_ASKING.test(said);
}

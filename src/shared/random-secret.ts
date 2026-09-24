/**
 * A secret this app invents, for the fields where the value is ours to choose
 * rather than another service's to issue.
 *
 * Only some secrets work this way. A webhook signing secret is minted by the
 * provider that signs with it, and no button here can conjure one. But the
 * caller-recognition secret is a shared password we make up and paste into
 * ElevenLabs, and asking someone to go and run `openssl rand -hex 24` for it
 * is a detour through a terminal for something the browser can do.
 */
export function randomSecret(bytes = 24) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return [...buffer].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

import { describe, expect, it } from "vitest";
import { encodeSpeechWav } from "./azure-audio";
describe("Azure PCM recording", () => {
  it("encodes mono 16 kHz PCM with signed samples and bounded clipping", () => {
    const buffer = encodeSpeechWav(new Float32Array([-2, -1, 0, 1, 2]));
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(bytes.slice(8, 16))).toBe("WAVEfmt ");
    expect(view.getUint32(4, true)).toBe(buffer.byteLength - 8);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(10);
    expect([0, 1, 2, 3, 4].map((i) => view.getInt16(44 + i * 2, true))).toEqual(
      [-32768, -32768, 0, 32767, 32767],
    );
  });
});

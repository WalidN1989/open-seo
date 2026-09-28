/** Azure short-audio recognition requires mono, 16 kHz, signed 16-bit PCM. */
export function encodeSpeechWav(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((value, index) => {
    const sample = Math.max(-1, Math.min(1, value));
    view.setInt16(
      44 + index * 2,
      Math.round(sample * (sample < 0 ? 32768 : 32767)),
      true,
    );
  });
  return buffer;
}

export async function prepareAzureAudio(recording: Blob): Promise<Blob> {
  // Decode WebM/MP4 as produced by this browser before resampling to Azure's format.
  const decoder = new AudioContext();
  try {
    const decoded = await decoder.decodeAudioData(
      await recording.arrayBuffer(),
    );
    const renderer = new OfflineAudioContext(
      1,
      Math.ceil(decoded.duration * 16000),
      16000,
    );
    const source = renderer.createBufferSource();
    source.buffer = decoded;
    source.connect(renderer.destination);
    source.start();
    const mono = await renderer.startRendering();
    return new Blob([encodeSpeechWav(mono.getChannelData(0))], {
      type: "audio/wav",
    });
  } finally {
    await decoder.close();
  }
}

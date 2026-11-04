// The narration audio for the e2e tests: a short silent WAV generated here and
// served in place of the audio origin, so nothing story-shaped is committed.
import { AUDIO_ORIGIN } from "../../../scripts/audio-origin.mjs";

/** A mono 8 kHz 16-bit PCM WAV of digital silence. */
export function silentWav(seconds) {
  const rate = 8000;
  const data = Buffer.alloc(rate * seconds * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
export const WAV = silentWav(30);

/** Answers every request to the audio origin with the silent WAV, honouring Range requests. */
export async function routeAudio(context) {
  await context.route(`${AUDIO_ORIGIN}/**`, async (route) => {
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? "");
    const headers = { "Content-Type": "audio/wav", "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*" };
    if (!range) return route.fulfill({ status: 200, headers, body: WAV });
    const start = Number(range[1]);
    const end = Math.min(range[2] ? Number(range[2]) : WAV.length - 1, WAV.length - 1);
    return route.fulfill({
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${WAV.length}`, "Content-Length": String(end - start + 1) },
      body: WAV.subarray(start, end + 1),
    });
  });
}

# Narrator

One tool narrates every world's stories, so a fix or improvement is made once. It turns a finished story into one mp3 with a single ElevenLabs voice, and writes the part times and duration back into the story's front matter.

World repos hold only the story and its narration settings. They carry no narrator code.

## The whole path, story to listener

```bash
export ELEVENLABS_API_KEY=...            # and have ffmpeg on your PATH
npm run narrate -- ../Gods-PrimarySchool/stories/some-story.md --dry-run   # read what the voice will say
npm run narrate -- ../Gods-PrimarySchool/stories/some-story.md             # spends ElevenLabs credits
npm run upload-audio -- --apply --world legend-lane --story some-story     # host it on R2
```

Then commit the story's changed front matter (`audioUrl`, `audioDuration`, `audioBytes`, `parts`) in the world repo. The mp3 is never committed: the narrator writes it to `narrator/out/<world>/<path>.mp3` (git-ignored), and `upload-audio` picks it up from there.

The story path decides the world: it must sit inside a world's `stories` folder, as set by `localPath` in `content-sources.json`. Never run narration in CI.

Options: `--voice-id <id>`, `--model-id <id>`, `--out <path.mp3>`, `--dry-run`.

## Per-world settings

Kept in the world's own repo, in `narration/`, because respellings are about that world's names:

| File | Contents |
|---|---|
| `narration/pronunciations.json` | `{ "Written": "Spoken" }`. Added to the shared map in `narrator/pronunciations.json`; the world's entry wins. |
| `narration/narrator.json` | `{ "voiceId": "...", "modelId": "..." }`, both optional. Without it the default voice and model at the top of `narrate.mjs` are used. |

Respellings are whole words only and case-sensitive. Keys starting with `_` are ignored. The story file keeps its proper spelling; only the text sent to the voice is respelled. Add a name the first time a voice mangles it and re-run: only chunks whose text changed are regenerated.

## What the script does to the text

1. Strips the front matter and normalises line endings (files checked out on Windows are CRLF).
2. Turns each `## Part N. Title` heading into a plain spoken line ending in a full stop, and strips `*italic*` and `**bold**` markers.
3. Swaps in the respellings.
4. Splits into scenes at each `• • •` line, then packs whole scenes into chunks under 9,000 characters. Headings become plain lines before the split, so a chunk boundary usually falls between sentences inside a part. Part timing does not depend on where the boundaries fall.
5. Sends each chunk to ElevenLabs' with-timestamps endpoint, chaining `previous_request_ids` so the voice stays consistent. Every chunk is cached by content hash in `narrator/.cache/` (git-ignored) with its alignment, and the chunks are joined with ffmpeg.
6. Finds each `## ` heading in the text that was sent, takes the aligned time of its first character, adds the measured length of every earlier chunk, and writes `audioDuration` and `parts` into the story's front matter.

`--dry-run` prints the exact text the voice will read, the world, voice, output path and chunk sizes, and lists each heading with the chunk it falls in. It needs no key and makes no API call. Read it through once before spending credits.

## Part times (`parts` and `audioDuration`)

```yaml
audioDuration: 412
parts:
  - title: "Part One. Two Visitors in the Hedge"
    start: 0
  - title: "Part Two. The Teacher with Three Helpers"
    start: 12.91
```

- One entry per `## ` heading, in document order. `start` is in seconds from the start of the joined mp3, to 10 ms. `audioDuration` is whole seconds.
- Only those two keys change. A re-run replaces both in place. The result is re-parsed with gray-matter, and the script refuses to write if anything else would change.
- The raw alignment is saved next to the mp3 (`narrator/out/<world>/<name>.alignment.json`, git-ignored, 1 to 2 MB), so sentence-level timings stay possible later.
- The script stops with an error, rather than writing guesses, if a heading can't be found in the sent text, the alignment doesn't match it, starts go backwards, or the last start is past the end of the audio. The mp3 is still produced.
- A story with no `## ` headings gets `audioDuration` only. A story with no front matter block is refused before any API call.

## Cost note for re-narrating

Chunks are chained by request id, so changing text in chunk 1 changes the key of every later chunk, and the whole story is regenerated. Cache entries made without alignment are ignored.

## Checking a first run by ear

Open the mp3 in a player that shows seconds (VLC, or `ffplay -ss <start> file.mp3`) and seek to the `start` of the first part, one in the middle, the first part after the first chunk boundary (a `start` larger than `chunks[0].durationSeconds` in the alignment file) and the last. Each should land on the spoken heading, within about half a second. A start that is consistently off after the chunk boundary means the chunk offsets are wrong.

## Known limits

- One voice per world. The multi-voice (character per voice) pipeline that used to live in the Isles of Yum repo was a spec with placeholder voice IDs and was never used, so it was not carried over.
- A heading that is split across two chunks is handled; a heading repeated word for word is matched in order.

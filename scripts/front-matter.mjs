// Edits one top-level scalar in a markdown file's front matter without touching
// anything else (the body, other fields, comments, line endings).

/**
 * Returns `raw` with the front matter line `<key>: <value>` set: replaced in place when
 * the front matter has one, else added before the closing `---`. The story body is never
 * touched, CRLF files keep their line endings, and a file with no front matter gets a new
 * block. `key` must be a plain identifier; `value` is written as given (quote it first if
 * YAML needs it).
 */
export function setFrontMatterField(raw, key, value) {
  if (!/^[A-Za-z][\w-]*$/.test(key)) throw new Error(`front matter key '${key}' is not a plain name`);
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const block = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(raw);
  if (!block) return `---${eol}${key}: ${value}${eol}---${eol}${raw}`;
  const line = new RegExp(`^${key}:[^\\r\\n]*$`, "m");
  const front = line.test(block[1])
    ? block[1].replace(line, () => `${key}: ${value}`)
    : `${block[1]}${eol}${key}: ${value}`;
  return `---${eol}${front}${eol}---${block[2]}${raw.slice(block[0].length)}`;
}

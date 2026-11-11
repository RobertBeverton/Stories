// The story page's own <h1> is the title in the hero. Story files usually open
// with the same "# Title", which would give the page two h1s and a screen
// reader the title twice. This drops a leading h1 that repeats the title and
// turns any other h1 in the body into an h2, so a page has exactly one h1.
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

const decode = (s) => s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, n) => NAMED[n])
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const plain = (s) => decode(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim().toLowerCase();

/** @param {string} html rendered story body @param {string} title the story title */
export function dropTitleHeading(html, title) {
  if (typeof html !== "string") return html;
  let out = html;
  const lead = out.match(/^\s*<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>\s*/i);
  if (lead && plain(lead[1]) === plain(String(title ?? ""))) out = out.slice(lead[0].length);
  return out.replace(/<h1(\s[^>]*)?>/gi, "<h2$1>").replace(/<\/h1>/gi, "</h2>");
}

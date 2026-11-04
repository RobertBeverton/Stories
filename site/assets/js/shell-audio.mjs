// How page modules (story-resume, parts) find and use the persistent audio.
//
// There is ONE <audio data-role="shell-audio"> outside #view, and it can hold
// any story: the page's own, or another one the dock is playing (Next/Previous,
// or a Play button elsewhere). Ownership is therefore not a property of the
// page. It is the slug: a page module may drive or save from the audio only
// while audio.dataset.slug is its own slug, and must check that again on every
// event (the dock can switch the story at any time). Modules never rely on an
// id that the shell adds or removes.

/** The shell's audio element, or null on a page without one. */
export function shellAudio(doc = document) {
  return doc.querySelector('audio[data-role="shell-audio"]') ?? doc.querySelector("audio#player");
}

/** True while the audio holds `slug`'s story. */
export function holdsStory(audio, slug) {
  return Boolean(audio) && Boolean(slug) && audio.dataset.slug === slug;
}

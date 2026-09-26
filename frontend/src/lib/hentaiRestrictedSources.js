// Frontend: the restricted sources a hentai is prefilled with.
//
// Restricted sources are free text (bucket "restricted"), so these are
// suggestions rather than a vocabulary, exactly as h-comic's are
// (lib/hComicRestrictedSources.js): a new entry starts with them, the editor
// offers them while typing, and any other name is still accepted. Nothing on
// the server knows the list.

// Every hentai.
export const HENTAI_RESTRICTED_SOURCES = Object.freeze(["Hanime1"]);

/** A new hentai's sources: one untouched restricted row per suggestion. */
export function defaultHentaiSources() {
  return HENTAI_RESTRICTED_SOURCES.map((name) => ({
    kind: "access",
    bucket: "restricted",
    name,
    url: "",
    available: null,
  }));
}

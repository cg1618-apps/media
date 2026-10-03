// Frontend: the text-and-URL link pairs some note sections store in `links`.
//
// A section whose registry entry reports `link_pairs: true` (the four song
// lists and 彩蛋 Easter Eggs) stores each link as `{"text": str | null, "url":
// str}` rather than a bare URL: a song is heard on several services, and the
// text is the label a reader sees on the pill. Every other section keeps URL
// strings. These are the pure halves of the editor in LinkPairs.jsx (a different name on
// purpose: Windows resolves paths case-insensitively, and "./LinkPairs" would
// otherwise find a "linkPairs.js" first).

// Stored links as editable rows. A bare string - a row written before the
// section took pairs - becomes a pair with no text rather than being lost.
export const pairsFromLinks = (links) =>
  (links || [])
    .filter(Boolean)
    .map((link) =>
      typeof link === "string"
        ? { text: "", url: link }
        : { text: link.text || "", url: link.url || "" },
    );

// Editable rows as the API wants them: rows with no URL dropped, blank text
// sent as null.
export const pairsToLinks = (pairs) =>
  (pairs || [])
    .filter((p) => p.url.trim())
    .map((p) => ({ text: p.text.trim() || null, url: p.url.trim() }));

// Whether any row carries a URL - what makes the links say something.
export const hasLinkPair = (pairs) => (pairs || []).some((p) => p.url.trim());

// A row with a label but no URL. The server refuses a pair without a URL, and
// dropping the row would throw away what was typed, so Save waits instead.
export const pairsIncomplete = (pairs) =>
  (pairs || []).some((p) => !p.url.trim() && p.text.trim());

// The pill's label: the pair's own text, else the link's host.
export const pairLabel = (pair) => {
  if (pair.text) return pair.text;
  try {
    return new URL(pair.url).hostname;
  } catch {
    return pair.url;
  }
};

// Frontend: the mark checkboxes each media type's Add and Modify form offers -
// Pin to dashboard, Plan Next, Redo - drawn in the marks section at the top
// of both pages (components/forms/EntryFlags.jsx).
//
// Each is a boolean column of the entry, saved with the form. A type lists
// only the flags its schema has: cartoon has no to_rewatch, and the gated
// types have no is_pinged (their APIs refuse the key with a 422).

// The checkbox text, which is also its accessible name. The three plan
// columns of each kind - watch, read, play - read the same on every type.
export const ENTRY_FLAG_LABELS = Object.freeze({
  is_pinged: "Pin to dashboard",
  watch_next: "Plan Next",
  read_next: "Plan Next",
  play_next: "Plan Next",
  to_rewatch: "Redo",
  to_reread: "Redo",
  to_replay: "Redo",
});

// The form keys each media type's form carries, in display order.
export const ENTRY_FLAGS = Object.freeze({
  anime: ["is_pinged", "watch_next"],
  "anime-movie": ["is_pinged", "watch_next", "to_rewatch"],
  movie: ["is_pinged", "watch_next", "to_rewatch"],
  "tv-show": ["is_pinged", "watch_next", "to_rewatch"],
  cartoon: ["is_pinged", "watch_next"],
  manga: ["is_pinged", "read_next", "to_reread"],
  book: ["is_pinged", "read_next", "to_reread"],
  comic: ["is_pinged", "read_next", "to_reread"],
  game: ["is_pinged", "play_next", "to_replay"],
  "h-comic": ["read_next", "to_reread"],
  hentai: ["watch_next", "to_rewatch"],
  "h-game": ["play_next", "to_replay"],
});

/** `[[key, label], ...]` for a tab, or `[]` when it has no flags. */
export function entryFlagsFor(type) {
  return (ENTRY_FLAGS[type] ?? []).map((key) => [key, ENTRY_FLAG_LABELS[key]]);
}

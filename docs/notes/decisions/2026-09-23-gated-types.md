# Gated types: their own tables, a required label, and derived hiding

H-Comic, Hentai and H-Game are media types seen in the `unrestricted` access
mode only. The rules as they stand are `entry-types.md` and
`authorization.md`, "Gated types" and "Shared records".

- **Each is its own table.** An h-comic's fields are not a manga's (club,
  originality, animation status, usefulness, highlights), so reusing `manga`
  would hang them on every manga row; two tables for JP and KR would be
  near-identical, so h-comic is one table with a `region` whose unused columns
  are cleared on every write path. A hentai's fields are h-comic's more than
  anime's, and a label on an anime row would leave the type ungated: a label an
  editor can remove is not a type. H-Game is to `games` what h-comic is to
  `manga` — Game's fill, purchase records, DLC chain and note sections are
  reused, the table is not.
- **The label is required, and the server attaches it.** A media type naming a
  required label (`REQUIRED_LABEL_FOR_TYPE`) is gated: every entry and every
  franchise of that type carries the label on every write path, and a set
  that drops it is refused. It is not left to an editor to tick, because an
  entry missing its label is a public entry. The label machinery lives in one
  module (`gated_labels.py`) keyed on the map, because a missed copy per type
  would be a public adult entry.
- **Everything connected only to gated entries is hidden, by a derived rule:
  a shared record is hidden when every connection it has is hidden.** Rejected:
  label tables for people, characters and vocabulary, which need an editor to
  remember every artist and genre value and go stale the day an artist is
  credited on a mainstream work. Rejected: separate tables for gated-type
  people, which split one artist who also draws mainstream manga into two rows.
  Scopes count as connections for a club made before its first credit and an
  unused gated-only vocabulary value.
- **A narrow session is not told the type exists.** Every surface that would
  name it — constants, role scopes, the notes registry, `/api/auth/me` — leaves
  it out, and the SPA asks one question in one place (`canSeeGatedType`), since
  both SPA permission surfaces must agree. A narrow session sent to a gated URL
  lands on the home page, not on a login page that would say something is
  behind it.
- **Gated franchises are kept apart from mainstream ones**, through franchise
  families (`FRANCHISE_FAMILY_FOR_TYPE`): a franchise spanning two families is
  refused and the name resolver matches within the entry's family. Otherwise a
  Fate-themed h-comic would attach itself to the mainstream Fate franchise,
  whose hub would list it or carry a hole where it was hidden. One franchise
  carries the label of each gated type it holds.
- **h-comic's `animation_status` is derived at read time** from
  `hentai -adaptation-> h-comic` relations, not written. Writing it would need a
  recompute on every relation, hentai and Pull write and would overwrite the
  hand-set value, which reading keeps for the day the relation goes. While
  derived, a write of another value is refused (422) — an ignored write looks
  saved and is not — and a write of the derived value itself stores nothing.
- **Studio, director and the H genre vocabularies are shared, not copied**; the
  shared-record rule hides those used only by gated types.
- **Highlight names are free text, not character ids.** The characters worth
  naming are often not on the cast; requiring a row for each would mean
  creating rows for every one-scene name. Accepted: renaming a character does
  not rewrite highlights that named it.
- **Closed vocabularies are constants**, checked on every write path; the
  Sheets parser drops and logs an unknown value rather than failing a tab over
  one hand-typed cell. **A multi-choice list is stored in vocabulary order, and
  `[]` is an answer** ("none of these"), distinct from null ("not recorded").
- **Purchase records are shared through `media`.** `game_copy.game_id` points
  at `media.system_id`, so game and h-game copies live in one table; the column
  keeps its name because the sheet tab is headed by it.
- **DLsite links are two plain columns, not JSONB.** The JP and TW stores are
  exactly two fixed slots, and the product id is read out of the link rather
  than stored.

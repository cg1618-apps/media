# Character identities

A character can go by more than one identity — Kudo Shinichi and Edogawa Conan,
a hero and a civilian name. Every identity is **one character**: MAL has one
character rather than one per identity, and search, tags and the role
derivation agree.

- **The `character` row is the main identity; only the others get a table**
  (`character_identity`). Its names, photo and remark are never held twice,
  and MAL import, merge, the library and the display-name rules keep reading
  `character`. Rejected: every identity in the table with an is-main flag,
  which duplicates the character's names and turns every read, merge and MAL
  fill into a lookup of "which row is the main one".
- **An identity carries names, display-name choice, gender, remark, cover image
  and position — no tags, rating, role or MAL fields.** Those describe the
  character, who is one person whichever identity is showing; per-identity
  copies could only disagree. Identity tags are the known next step, not built.
- **A NULL gender on an identity inherits the character's**, resolved on read,
  so a later change carries through.
- **A cast row may name an identity; NULL is the main identity, and one
  character may have one row per identity in an entry**, because each needs its
  own seiyuu, photo, remark and role. Rejected: the identity on the voice row —
  voice rows exist only on voiced types, so a manga could not say which
  identity appears.
- **MAL import touches characters only**; every imported row is the main
  identity.
- **Deleting an identity folds its cast rows into the main identity**, merging
  into an existing main row where there is one, so no cast history is lost.
  Rejected: deleting those rows with it, or refusing the delete.
- **An identity is only ever created under a known character.** Converting a
  character into an identity was not built: two characters that should be one
  are fixed by merge. In the cast editor, "+ Identity" adds an identity row
  under its character row, so no picker has to say whether "create new X" makes
  a character or an identity. Rejected: one combined picker with a kind badge,
  and separate Characters and Identities sections.
- **A character search matches identity names** and resolves to the owning
  character, since every identity is that character.
- **An identity has its own page at `/identity/<public_id>/<slug>`**, on a
  `public_id` of its own like every detail page rather than a UUID URL. Reads
  are public with the character's visibility; writes are editors'.
- **The library shows each identity as its own card**, labelled with its
  character, rather than a "+N identities" badge, which would make a "hide
  identities" filter pointless.
- **An identity cast row is marked in words and by a dashed frame**, and the
  entry page hides identity rows behind a toggle — except one whose character
  has no main row in that cast, which hiding would drop altogether.
- **The editor orders a loaded cast by role rank then position on load and after
  a save, not live.** Live sorting makes a row jump away the moment its role
  changes and fights drag-and-drop.
- **`fk_casting_identity` is `DEFERRABLE INITIALLY DEFERRED`**, so merge can move
  an identity and its cast rows in one flush in either order.
- **A cast row's displayed photo falls back row, then identity, then
  character**, served as `display_photo_*` beside the row's own values, so the
  editor round-trips only what was chosen for the row.

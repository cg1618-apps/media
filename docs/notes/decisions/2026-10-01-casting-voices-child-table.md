# A casting holds several seiyuu, in a child table

A character may have more than one seiyuu in one entry — a child and an adult
voice, a recast mid-season. Each voice is a `character_casting_voice` row under
the casting, in `position` order, with a free-text `remark`.

- **A child table, not a second casting per voice.** Rejected: dropping the
  one-casting-per-character-per-entry constraint and casting a character once
  per seiyuu. The casting carries the character's role, photo, focus, position
  and remark for that entry; two rows would hold two copies of each that could
  drift, and every cast list would show the character twice.
- **The voice row repeats the casting's `media_type` and `entry_id`, held equal
  by a composite FK** (`ON UPDATE CASCADE`). Two things depend on the copy: the
  scope rule (a voice only on voiced types) stays a CHECK, which cannot look at
  another table, so the pipelines and migrations that write rows without the
  API are held to it; and every reader asking "which entries does this person
  voice in" reads one table with a `(media_type, entry_id)` pair, exactly as it
  reads `media_credit`. Rejected: storing only `casting_id`, which buys
  normalisation at the cost of both.
- **`person_id` cascades, and the casting stays.** The voice row is the
  person's link to the work, as a credit is; the casting is the character's
  link and survives with its other voices. `person_id` is NOT NULL.
- **Merges carry voices.** A person merge repoints voice rows (dropping one on a
  casting the survivor already voices); a character merge appends the loser's
  voices the survivor's casting lacks before dropping the loser's casting, so a
  seiyuu recorded only on the duplicate is not lost.

# A grouping tier's content label reaches its entries at read time

Labelling a franchise `nsfw` hides every entry in it, and the label is joined
on every read rather than copied onto the entries.

- **Rejected: writing a `media_content_label` row onto every entry when the
  franchise is labelled.** It reads simpler and is wrong in three places:
  moving an entry out of the franchise would leave the copy behind, adding an
  entry to a labelled franchise would silently not inherit, and clearing the
  franchise's labels could not tell an inherited row from one set by hand. So
  the visibility check asks both questions on every read — the entry's own
  label rows and its grouping tiers' — and nothing is stored twice.
- **Each tier has its own label table** rather than nullable owner columns on
  `media_content_label`, because that table's `media_id` is a real foreign key
  to the `media` supertable and a franchise has no row there. A pair of
  nullable owner columns could name both owners or neither, and no constraint
  would say which was meant.
- **Putting a label on an entry is a catalogue write.** It decides only which
  shelf one thing sits on and is submitted with the rest of the entry. Because
  that widened who may write label rows, the assignment routes carry the same
  visibility gate as the rest of the write surface: a thing the caller's mode
  cannot see answers 404, so a narrowed editor cannot clear the label hiding
  it.

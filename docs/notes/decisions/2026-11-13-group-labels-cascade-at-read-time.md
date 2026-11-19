# A grouping tier's content label reaches everything under it at read time

Collections, franchises and series carry content labels, and a label cascades
down the tree: a collection hides itself, its franchises, their series and
every entry under them; a franchise its series and entries; a series its
entries. Nothing cascades up or sideways — a label marks what is inside the
thing labelled, not the umbrella around it.

- **Joined at read time, never copied.** Rejected: writing a label row onto
  every entry when a group is labelled. It reads simpler and is wrong in three
  places: moving an entry out would leave the copy behind, adding an entry to a
  labelled group would silently not inherit, and clearing the group's labels
  could not tell an inherited row from one set by hand. Each tier's condition
  in `enforcement.py` is built from the one above it, so clearing a label or
  moving a group reveals everything under it at once.
- **One join table per tier, not a polymorphic owner.** An `(owner_type,
  owner_id)` pair cannot carry a real foreign key, so a deleted group would
  leave label rows behind; a nullable column per tier could name two owners or
  none. Each small table keeps a real `ON DELETE CASCADE`, and the code that
  treats them alike is one map, `GROUP_LABEL_TABLES`.
- **An entry is hidden by its series' chain as well as by its own
  franchise.** `media.franchise_id`, `media.series_id` and
  `series.franchise_id` normally agree, but nothing forces it; hiding on either
  is the direction that cannot leak.
- **Groups have no 標籤 Label tag and no gated-type required label** (neither a
  collection nor a series has a type); the `nsfw` rule applies on every tier.
- **Putting a label on something is a catalogue write**, submitted with the
  rest of the form. Because that widens who may write label rows, the
  assignment routes carry the same visibility gate as the rest of the write
  surface: a thing the caller's mode cannot see answers 404, so a narrowed
  editor cannot clear the label hiding it.
- **Labels travel on authorization tabs**, restored only for `admin.authz`; a
  Pull without the tab restores every group unlabelled.

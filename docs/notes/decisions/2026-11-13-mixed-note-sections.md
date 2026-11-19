# Catalogue rows and each account's own rows in one section: mixed sections

Some catalogue sections are mixed (`NoteSection.mixed`): a viewer reads the
catalogue rows plus its own personal rows, in the same groups. The kind lives
on the row, as `note.personal`.

- **A row-level boolean, because the section cannot say.** Everywhere else a
  row's kind is its section's `scope`. One NOT NULL boolean defaulting false
  leaves every older row catalogue and keeps `scope` meaning what it meant.
  Rejected: a second section per mixed section (`items` and `items_personal`),
  which splits one card's rows across two sections, two orders and two group
  lists. `personal` stays false on a personal-scope section's rows: a second
  source of the same answer is one that can disagree.
- **The server picks the kind, from `manage.catalog`.** An account writes
  catalogue rows if it writes the catalogue, personal rows otherwise, never
  both in one section, and there is no "only me" switch. The payload carries
  no kind; taking it from the payload would need refusing the wrong one per
  account, the same rule written twice.
- **Reorder is per kind**: the two kinds never share an order, and a catalogue
  order written by a member would be a catalogue write by someone who may not
  make one.
- **A user's rows sort after the catalogue's within each group**, by kind before
  `sort_index`, so no grouping has to know about kinds. In a tree a personal
  row may sit under a catalogue row, never the reverse, which every other
  reader would see as a child with no parent.
- **Never promoted.** A personal row never becomes a catalogue row; adding one
  to the catalogue is a request, written by whoever writes the catalogue.
- **Personal values work on both kinds through marks**, so the page, the mark
  route and the NG reset have one path.
- **On Sheets, content twins are matched among catalogue rows only**: a
  personal row is never minted per database, and matching one by content would
  hand a catalogue row to one account.
- **Deleting a catalogue row re-homes members' rows under it** to the section's
  top level first, so a catalogue edit cannot destroy data that is not the
  catalogue's. It lives in the route, because an ON DELETE rule cannot tell a
  personal child from a catalogue one.
- **A mixed section has no "only me" switch.** See
  `2026-11-14-a-mixed-section-has-no-only-me-switch.md`.

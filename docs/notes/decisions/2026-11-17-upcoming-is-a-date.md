# Upcoming books and manga volumes: upcoming is a date, not a status

- **Upcoming is a date.** A book unit carries its own JP and TW release dates,
  and a manga its next volume's. A unit or volume is upcoming while one of its
  dates is ahead, and a passed date drops it off Future Releases on its own.
  Rejected: a per-unit release status, a second statement of what the date says,
  which would disagree the day the date passes and nobody edits it.
- **Manga gets two columns, not a unit table**: a reader waits for the next
  volume, one at a time, and a table of every future volume would be data
  nobody enters.
- **"Ahead" for a partial date is the end of the period it names.** `2026-11`
  stays upcoming until 30 November. Reading it as the first of the month — how
  it *sorts* — would drop a book announced for November on the first, while it
  is still to come. Today is the viewer's calendar date, in the browser.
- **The filter runs in the browser over the ordinary list endpoints**, which
  already carry units and apply the visibility gates. A dedicated "upcoming"
  endpoint would need its own copy of the gates.
- **A unit's cover belongs to the image library, not the units write.** The
  units save never writes a cover, so a save from a form loaded before a cover
  was attached cannot put the old value back; the picker appears only on a
  saved unit, since an attach needs an id.
- **`book-unit` has no cover folder and no focus column**: nothing downloads a
  unit cover, and it is drawn only as a thumbnail.
- **A book is placed by its earliest upcoming date**, its own or a unit's, so it
  appears once with every upcoming volume under it.

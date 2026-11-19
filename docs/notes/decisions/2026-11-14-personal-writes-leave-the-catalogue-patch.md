# Personal writes leave the catalogue PATCH, and never finish the work

A status, progress count or plan flag is written to `/api/me` (the list row and
the plan flags), and every control that writes one asks `self.list`, which is
what the route asks. The catalogue `PATCH` asks `manage.catalog`.

- **A list write never writes the work's catalogue half.** `PUT /api/me/list`
  applies the tracker's rule that reaching the total completes, so `+` on 11 /
  12 does not leave a member Watching. But marking completed also writes the
  catalogue half — an anime becomes Finished Airing — and one member reaching
  the last episode it has seen says nothing about whether the work has ended;
  on the list route that would be a catalogue write by an account without
  `manage.catalog`. Both paths share `write_list_payload`, so the row's half is
  the same.
- **One hook routes by key, with a small explicit split.** `useStatusToggle`
  sends the plan-flag names to `/api/me/plan-flags` and every other personal key
  to `/api/me/list`. The SPA does not mirror the server's field table: a copy
  would drift, and the routes refuse a key a type does not hold (422).
- **A control that edits the work as well says so**, passing the catalogue half
  separately, drawn for an editor only.
- **Names say what is gated.** `isAdmin` on a control that writes the viewer's
  own progress is how two gates drifted apart; it is `canTrack`.

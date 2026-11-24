# Pinged is a column on the viewer's list row

A pin puts an entry in the dashboard's Pinged division, above Watching. It is
`user_media_list.is_pinged`, a NOT NULL boolean on the viewer's own row, and
not a plan flag.

**Why the list row.** A pin is one person's, as a status or a rating is, and
the list row is where every such fact about one entry lives. As a column in
`LIST_FIELDS`, it is written by every path that already writes the row: the
entry endpoints' create, PUT and PATCH (the Add and Modify forms) and
`PUT /api/me/list` (the detail page's tracker). `attach_list_fields` then
serves it on every list and detail read, so the dashboard learns which entries
are pinned from the lists it already fetches, with no new route and no new
query.

**Why not a plan flag.** `watch_next` and `to_rewatch` are `plan_next` rows
because the Plan page orders them and the random picker weights them. A pin
does neither. As a third plan kind it would need its own key per type
(`watch_pin`, `read_pin`, …) under `PLAN_FLAG_FIELDS`, a second write route
from the tracker, and the Plan page to learn to ignore it.

**Why not a status.** The pin is independent of progress. A paused show can be
pinned as a reminder, and an active one stays pinned when it is paused.
Pinning also leaves an entry in its own division, so the Pinged division is a
shortcut and never the only place an entry is drawn.

**Why only the nine ordinary types.** The dashboard draws no gated type, so a
pin on an h-comic, h-game or hentai entry would be stored and shown nowhere.
Leaving the key out of their `LIST_FIELDS` makes `PUT /api/me/list` refuse it
with 422 instead of accepting a write that has no effect.

**Why soft sections, not sub-sections.** Watching, Reading and Playing are
sub-divided by status (Active, Passive, Paused), and each sub-section is a
sticky header and an anchor in the contents. Pinged is grouped by division
instead, with an eyebrow on a dotted rule, the way a type groups cards inside
a sub-section. Those groups are not anchors. If the contents listed them, it
would repeat Watching, Reading and Playing a second time under Pinged.

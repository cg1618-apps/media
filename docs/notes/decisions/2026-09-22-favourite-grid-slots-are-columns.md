# Favourite-grid slots are a column on each tier, not a join table

The favourite 3×3 grids hold franchises, comic series, movies and games, so a
slot is storable on `franchise`, `series`, `movies` and `games` (and
`h_game`) as a `type_slots` JSONB column.

- **The same column on each table, not a generic `(grid, slot) -> owner`
  table.** The join table is the more normalised answer and was considered
  first. What rules it out is the Google Sheet: a new table needs its own tab,
  parser and place in the Pull order before it survives a machine switch,
  whereas a column on a table that already has a tab travels the day it is
  added. It also keeps one meaning for `type_slots` wherever it appears.
- **The entry-tier column is on the detail tables, not on `media`.** The
  supertable would have served every type at once, but the promotion rule in
  `app/models/media.py` also needs something to query across types by the
  column, and each grid reads one type's list. A later grid pays for its own
  column.
- **A grid's key is only meaningful beside its tier.** The favourite movie
  *franchises* and the favourite *movies* both key `"Movie"`, on different
  tables. That is safe because the column is per table; a generic table would
  have needed a second column to tell them apart.
- **`config/favoriteGrids.js` is the single declaration**, read by the public
  page and the admin editor.

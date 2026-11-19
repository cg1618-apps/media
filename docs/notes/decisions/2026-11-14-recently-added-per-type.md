# Recently added is cut per type, and a row is the grid's column count

- **`/api/dashboard/recent` cuts per type, not overall** (`per_type`). The
  dashboard draws one section per type, and newest-overall lets one busy type
  crowd every other off the page. It answers in one query, numbering visible
  entries newest first within their type by `row_number()`; the response stays
  a flat list the page groups. A type's second row is the page's to ask for,
  not a server rule about one type.
- **A row is the grid's column count at that width**, not a fixed number of
  cards, which would leave a ragged last row at every width but one. The page
  fetches enough for the widest grid and hides cards past the last full row.
- **The shared account's picker is chosen by `view.random_picker` without
  `self.list`**, the same pair the dashboard reads for Recently added.

# Release dates are truncated ISO strings

Every release-date column stores a truncated ISO-8601 string whose length is
its precision (`2020`, `2020-07`, `2020-07-14`), guarded by a CHECK per column,
and one helper module (`app/utils/release_date.py`) owns parsing, validation,
normalisation and display. The behaviour is in `business-rules.md`.

- **Rejected: a `DATE` plus a precision column.** Two columns that must agree,
  and a year-only date would have to invent a month and day.
- **Rejected: free text.** Nothing could sort or validate it.
- **Sheets cells get an apostrophe prefix, not RAW mode.** The prefix stops
  Google Sheets turning `2020-07` into a date serial on the one cell, without
  changing how every other value on the tab is written.

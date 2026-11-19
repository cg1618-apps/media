# Labels and modes are code, and what a mode shows is derived

The content labels (`app/services/rbac/labels.py`) and the access modes
(`MODE_ORDER`) are defined in code. Each label and field group names the lowest
mode that shows it, and a mode shows everything at or below it. Only a mode's
name, description and display order are adjustable.

- **A ceiling needs each mode to contain the one below it.** Stored sets could
  not guarantee that: any edit could leave `normal` showing something
  `borderline` hides. Deriving every set from one order makes containment true
  by construction.
- **Every database shows the same.** Stored mode contents did not travel on the
  sheet, so two databases could silently disagree about who sees an entry.
- **`unrestricted` shows every label row**, not only the ones the code names,
  so an unexpected row is reachable in the widest mode and hidden in every
  other: fail-closed everywhere but the mode that means "everything".
- **Unknown labels are refused, not guessed at.** Deleting a cited label would
  silently publish its entries; keeping one no code knows leaves it meaning
  nothing. A Pull skips a sheet row whose key the code does not name, and
  reports it.
- **Rejected: keeping the stored sets and validating monotonicity on write.**
  It would still be per-database and absent from the sheet.

## `nsfw` is stored beside every other label, not implied

`label_rules.py` attaches `nsfw` beside any other label on every write path,
and refuses (422) a write that drops it while another label stays.

- **Stored, so a reader never needs the rule.** Implying it would make every
  query asking "is this nsfw" — the label filter, the counts, the sheet a human
  reads — know which labels imply it.
- **Refused, not silently re-added, when dropped.** Keeping `erotica` and
  dropping `nsfw` is a contradiction, and quietly restoring `nsfw` would make
  the form lie about what was saved. A first label brings `nsfw` with it.
- **No constraint enforces it**: a CHECK cannot see across rows, every write
  path goes through one function, and the invariant pass after a Pull and in
  Calculate catches rows written straight to the tables.

## A label and its 標籤 Label tag are kept in step

`nsfw`, `ecchi` and `erotica` each have a 標籤 Label tag, kept in step with the
label both ways on an entry.

- **The tag is a field on the label definition**, not a second table: a label
  has at most one tag, and the mapping is a rule.
- **Each write path converts at the route**, inside its own transaction, so a
  refused removal leaves nothing half-applied; `replace_tags` stays a plain
  writer because Pull calls it and Pull must not 422.
- **Pull reconciles with the label winning**, and the invariant pass repairs
  drift in Calculate too.
- **The form keeps the two controls in step live**, so the order Add and Modify
  save in cannot revert an edit made in only one of them.

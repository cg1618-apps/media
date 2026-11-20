# A Resources row's group is its note kind

- **The group is stored in `note.kind`.** The Note tab already carries the
  column, so grouping needed no migration and no sheet reshape. A registry
  flag, `kind_is_group`, makes `kind` free text on that section; every other
  section still refuses a kind it does not declare. A group alone does not make
  a row worth storing: it says nothing about what the row points at.
- **Rejected: the structured shape's `group_by` / `names` machinery.** It files
  a row under several names and stores a group order on the owner. A bookmark
  sits in one group, and the order groups are read in is the order of the
  rows, so reordering rows is all the ordering there is.
- **Ungrouped rows go last, under "Other".** Drawn first with no heading, an
  unlabelled run at the top reads as a group whose heading is missing.
